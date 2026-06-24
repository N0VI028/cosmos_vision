<template>
  <div class="cv-tab-content">
    <div class="cv-message-section-head">
      <h2 class="cv-section-title cv-prompt-builder-title">
        <span>提示词生成预设</span>
        <div
          v-if="isDefaultPresetActive"
          class="cv-reset-default-preset-btn"
          role="button"
          tabindex="0"
          title="重置内置预设"
          aria-label="重置内置预设"
          @click="resetDefaultPreset"
          @keydown.enter.prevent="resetDefaultPreset"
          @keydown.space.prevent="resetDefaultPreset"
        >
          <i class="fa-solid fa-rotate-left" />
        </div>
      </h2>
    </div>

    <PresetSelector
      class="cv-prompt-builder-preset-selector"
      :presets="presetOptions"
      :active-preset-id="settings.promptLlmMessagePresets.activePresetId"
      :default-preset-id="DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID"
      @update:active-preset-id="updatePresetId"
      @create="createPresetPrompt"
      @clone="clonePreset"
      @rename="renamePreset"
      @delete-preset="deletePreset"
    />

    <PromptLlmMessageList v-model="messages" />

    <h2 class="cv-section-title">提示词预览</h2>
    <div v-if="messages.length === 0" class="cv-empty-hint">暂无消息</div>
    <PromptMessagePreview v-else :messages="messages" />

    <h2 class="cv-section-title">Tag提取规则</h2>
    <div class="cv-field">
      <label class="cv-field-inline" style="margin-bottom: 0">
        <ToggleSwitch v-model="settings.promptLlm.preferJsonSchemaExtraction" />
        <span>优先 JSON Schema 解析</span>
      </label>
      <div class="cv-field-hint" style="margin-top: 0">
        开启后请求 LLM 时会附带 JSON Schema，并按字段名读取对应侧提示词；某侧字段名留空时该侧不参与 JSON
        提取，交给固定预设。渠道不支持或返回非 JSON 时回退到下方的正则提取规则。
      </div>
    </div>
    <div v-if="settings.promptLlm.preferJsonSchemaExtraction" class="cv-field-grid">
      <label class="cv-field">
        <span>正面 JSON 字段名</span>
        <InputText
          v-model="settings.promptLlm.positivePromptJsonField"
          :placeholder="DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.positive"
        />
      </label>
      <label class="cv-field">
        <span>负面 JSON 字段名</span>
        <InputText
          v-model="settings.promptLlm.negativePromptJsonField"
          :placeholder="DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.negative"
        />
      </label>
    </div>

    <div v-for="field in promptExtractRuleFields" :key="field.label" class="cv-field-grid">
      <label class="cv-field">
        <span>{{ field.patternLabel }}</span>
        <InputText v-model="settings.promptLlm[field.patternKey]" :placeholder="field.patternPlaceholder" />
      </label>
      <label class="cv-field">
        <span>{{ field.replacementLabel }}</span>
        <InputText v-model="settings.promptLlm[field.replacementKey]" :placeholder="field.replacementPlaceholder" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import PromptLlmMessageList from '@/panel/components/PromptLlmMessageList.vue';
import PromptMessagePreview from '@/panel/components/PromptMessagePreview.vue';
import defaultPromptLlmPresetSettings from '@/constants/default-prompt-llm-preset';
import {
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID,
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME,
  DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
  DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
  DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
  DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
} from '@/constants/default-settings';
import {
  type PromptLlmMessage,
  type PromptLlmMessagePreset,
} from '@/constants/novelai';
import {
  createPromptLlmHistoryMessage,
  ensurePromptLlmReservedMessages,
  isPromptLlmReservedMessage,
} from '@/services/prompt-llm/message-preset';
import { clonePromptLlmMessage } from '@/services/prompt-llm/message-source';
import { useSettingsStore } from '@/store/settings';

interface PromptExtractRuleField {
  label: string;
  patternKey: 'positivePromptExtractPattern' | 'negativePromptExtractPattern';
  replacementKey: 'positivePromptExtractReplacement' | 'negativePromptExtractReplacement';
  patternPlaceholder: string;
  replacementPlaceholder: string;
  patternLabel: string;
  replacementLabel: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  acceptLabel?: string;
  cancelLabel?: string;
  severity?: string;
}

const PROMPT_EXTRACT_RULE_FIELDS = [
  {
    label: '正面提取规则',
    patternKey: 'positivePromptExtractPattern',
    replacementKey: 'positivePromptExtractReplacement',
    patternPlaceholder: DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
    replacementPlaceholder: DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
    patternLabel: '正面匹配正则',
    replacementLabel: '正面提取模板',
  },
  {
    label: '负面提取规则',
    patternKey: 'negativePromptExtractPattern',
    replacementKey: 'negativePromptExtractReplacement',
    patternPlaceholder: DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
    replacementPlaceholder: DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
    patternLabel: '负面匹配正则',
    replacementLabel: '负面提取模板',
  },
] as const satisfies ReadonlyArray<PromptExtractRuleField>;

const { settings } = useSettingsStore();
const promptExtractRuleFields = [...PROMPT_EXTRACT_RULE_FIELDS];

const activePreset = computed(() => {
  const { activePresetId, presets } = settings.promptLlmMessagePresets;
  return presets.find(preset => preset.id === activePresetId) ?? presets[0];
});

const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');
const showConfirm = inject<(options: ConfirmOptions) => Promise<boolean>>('showConfirm');

const isDefaultPresetActive = computed(
  () => settings.promptLlmMessagePresets.activePresetId === DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID,
);

const presetOptions = computed(() => {
  return settings.promptLlmMessagePresets.presets.map(preset => ({
    id: preset.id,
    name:
      preset.name?.trim() ||
      (preset.id === DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID ? DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME : '未命名预设'),
  }));
});

/**
 * 更新激活的提示词生成预设 ID
 * @param id 预设 ID
 */
function updatePresetId(id: string): void {
  settings.promptLlmMessagePresets.activePresetId = id;
}

/**
 * 新建提示词生成预设
 */
async function createPresetPrompt(): Promise<void> {
  if (!showPrompt) return;
  const name = await showPrompt({ title: '新建预设', message: '请输入新预设的名称：', defaultValue: '新预设' });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toastr.error('预设名称不能为空');
    return;
  }
  const newId = uuidv4();
  const preset = {
    id: newId,
    name: trimmed,
    messages: [createPromptLlmHistoryMessage()],
  };
  settings.promptLlmMessagePresets.presets.push(normalizePresetMessages(preset));
  settings.promptLlmMessagePresets.activePresetId = newId;
  toastr.success(`预设 "${trimmed}" 已创建`);
}

/**
 * 克隆当前预设
 */
async function clonePreset(): Promise<void> {
  const current = activePreset.value;
  if (!current || !showPrompt) return;
  const currentName = presetOptions.value.find(p => p.id === current.id)?.name || '未命名预设';
  const name = await showPrompt({
    title: '克隆预设',
    message: '请输入克隆预设的名称：',
    defaultValue: `${currentName} - 副本`,
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toastr.error('预设名称不能为空');
    return;
  }
  const newId = uuidv4();
  const copiedMessages = current.messages.map(copyPresetMessage);
  const preset = {
    id: newId,
    name: trimmed,
    messages: copiedMessages,
  };
  settings.promptLlmMessagePresets.presets.push(normalizePresetMessages(preset));
  settings.promptLlmMessagePresets.activePresetId = newId;
  toastr.success(`已克隆到新预设 "${trimmed}"`);
}

/**
 * 重命名当前预设
 */
async function renamePreset(): Promise<void> {
  const current = activePreset.value;
  if (!current || !showPrompt) return;
  const currentName = presetOptions.value.find(p => p.id === current.id)?.name || '未命名预设';
  const name = await showPrompt({ title: '重命名预设', message: '请输入新的预设名称：', defaultValue: currentName });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toastr.error('预设名称不能为空');
    return;
  }
  current.name = trimmed;
  toastr.success('预设已重命名');
}

/**
 * 删除指定的预设
 * @param id 预设 ID
 */
function deletePreset(id: string): void {
  if (id === DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID) {
    toastr.warning('默认预设不能删除');
    return;
  }
  const index = settings.promptLlmMessagePresets.presets.findIndex(p => p.id === id);
  if (index !== -1) {
    settings.promptLlmMessagePresets.presets.splice(index, 1);
    if (settings.promptLlmMessagePresets.activePresetId === id) {
      settings.promptLlmMessagePresets.activePresetId = DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID;
    }
    toastr.success('预设已删除');
  }
}

/**
 * 确认后重置内置提示词生成预设
 */
async function resetDefaultPreset(): Promise<void> {
  const message = '确定要重置内置预设到初始状态吗？这会覆盖你对默认预设的修改。';
  const confirmed = showConfirm
    ? await showConfirm({
        title: '重置内置预设',
        message,
        acceptLabel: '确认重置',
        cancelLabel: '取消',
        severity: 'danger',
      })
    : confirm(message);

  if (!confirmed) return;
  restoreDefaultPreset();
  toastr.success('内置预设已重置为初始状态');
}

/**
 * 用初始配置替换内置默认预设
 */
function restoreDefaultPreset(): void {
  const preset = defaultPromptLlmPresetSettings.presets.find(item => item.id === DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID);
  if (!preset) throw new Error('未找到内置提示词预设初始配置');

  const defaultPreset = _.cloneDeep(preset);
  const presets = settings.promptLlmMessagePresets.presets;
  const index = presets.findIndex(p => p.id === DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID);

  if (index === -1) {
    presets.unshift(defaultPreset);
    settings.promptLlmMessagePresets.activePresetId = defaultPreset.id;
  } else {
    presets.splice(index, 1, defaultPreset);
  }
}

const messages = computed<PromptLlmMessage[]>({
  get() {
    const list = activePreset.value?.messages ?? [];
    list.forEach(m => {
      if (m.enabled === undefined) {
        m.enabled = true;
      }
    });
    return list;
  },
  set(value) {
    const preset = activePreset.value;
    if (!preset) {
      return;
    }

    preset.messages = value;
  },
});

watchEffect(() => {
  ensureReservedMessages();
});

/**
 * 规范化预设中的保留条目
 * @param preset 待处理预设
 * @returns 已补齐保留条目的预设
 */
function normalizePresetMessages(preset: PromptLlmMessagePreset): PromptLlmMessagePreset {
  const normalized = ensurePromptLlmReservedMessages({
    activePresetId: preset.id,
    presets: [preset],
  });
  return { ...preset, messages: normalized.presets[0].messages };
}

/**
 * 确保当前消息列表包含全部保留条目
 */
function ensureReservedMessages(): void {
  const preset = activePreset.value;
  if (!preset) return;
  const normalized = normalizePresetMessages(preset);
  if (_.isEqual(preset.messages, normalized.messages)) return;
  preset.messages.splice(0, preset.messages.length, ...normalized.messages);
}

/**
 * 复制预设中的单条消息
 * @param message 消息条目
 * @returns 克隆后的消息
 */
function copyPresetMessage(message: PromptLlmMessage): PromptLlmMessage {
  if (!isPromptLlmReservedMessage(message)) return clonePromptLlmMessage(message);
  return { ...message, enabled: message.enabled !== false };
}
</script>

<style scoped>
.cv-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cv-prompt-builder-preset-selector {
  margin-bottom: var(--cv-space-6xl);
}

.cv-message-section-head {
  display: flex;
  align-items: center;
  gap: var(--cv-space-sm);
  margin-bottom: var(--cv-space-5xl);
}

.cv-prompt-builder-title {
  display: inline-flex;
  align-items: center;
  gap: var(--cv-space-sm);
}

.cv-reset-default-preset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.65em;
  height: 1.65em;
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  font-size: calc(var(--mainFontSize) * 0.72);
  transition: all 0.15s ease;
}

.cv-reset-default-preset-btn:focus-visible,
.cv-reset-default-preset-btn:hover {
  color: var(--p-red-500);
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  outline: none;
}
</style>
