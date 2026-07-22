<template>
  <div class="cv-tab-content">
    <h2 class="cv-section-title">历史上下文</h2>
    <div class="cv-section-body">
      <div>
        <div class="flex flex-col gap-(--cv-space-5xl)">
          <label class="cv-field">
            <span>发送的历史楼层数</span>
            <div class="cv-field-control">
              <InputNumber
                v-model="settings.promptLlm.historyFloorCount"
                :min="0"
                :step="1"
                :use-grouping="false"
                show-buttons
              />
              <div class="cv-field-hint">输入 0 时仅发送焦点段落所在楼层</div>
            </div>
          </label>
          <div class="cv-field">
            <label class="cv-field-inline" style="margin-bottom: 0">
              <span>忽略用户楼层</span>
              <ToggleSwitch v-model="settings.promptLlm.ignoreUserMessagesInHistory" />
            </label>
          </div>
        </div>
      </div>
    </div>

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
      show-portability
      @update:active-preset-id="updatePresetId"
      @create="createPresetPrompt"
      @clone="clonePreset"
      @rename="renamePreset"
      @export-preset="exportPresetPackage"
      @import-presets="importPresetPackage"
      @delete-preset="deletePreset"
    />

    <PromptLlmMessageList v-model="messages" />

    <div class="cv-message-section-head" style="margin-bottom: var(--cv-space-3xl)">
      <h2 class="cv-section-title cv-prompt-builder-title" style="margin-bottom: 0; margin-top: var(--cv-space-10xl)">
        <span>Tag提取规则</span>
        <div
          class="cv-reset-default-preset-btn"
          role="button"
          tabindex="0"
          title="重置为默认值"
          aria-label="重置为默认值"
          @click="resetTagExtractionRules"
          @keydown.enter.prevent="resetTagExtractionRules"
          @keydown.space.prevent="resetTagExtractionRules"
        >
          <i class="fa-solid fa-rotate-left" />
        </div>
      </h2>
    </div>
    <div class="cv-section-body">
      <div class="cv-field">
        <div class="cv-field-control">
          <label class="cv-field-inline" style="margin-bottom: 0">
            <ToggleSwitch v-model="settings.promptLlm.preferJsonSchemaExtraction" />
            <span>优先 JSON Schema 解析</span>
          </label>
          <div class="cv-field-hint">
            开启后请求 LLM 时会附带 JSON Schema，并按字段名读取对应侧提示词；渠道未返回 JSON字段 时回退到下方的正则提取规则。若渠道报错请关闭此选项。
          </div>
        </div>
      </div>
      <SelectButton
        v-model="extractMode"
        fluid
        size="small"
        :options="extractModeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="提取模式"
      />
      <template v-if="extractMode === 'json'">
        <div>
          <span class="cv-subsection-title">全局提示词</span>
          <Divider />
          <div class="cv-field-grid">
            <label class="cv-field"><span>正面 JSON 字段名</span><InputText v-model="settings.promptLlm.positivePromptJsonField" /></label>
            <label class="cv-field"><span>负面 JSON 字段名</span><InputText v-model="settings.promptLlm.negativePromptJsonField" /></label>
          </div>
        </div>
        <div>
          <span class="cv-subsection-title">NovelAI 角色提示词</span>
          <Divider />
          <div class="cv-field-grid">
            <label class="cv-field"><span>角色数组字段名</span><InputText v-model="settings.promptLlm.characterPromptsJsonField" /></label>
            <label class="cv-field"><span>角色正面字段名</span><InputText v-model="settings.promptLlm.characterPositivePromptJsonField" /></label>
            <label class="cv-field"><span>角色负面字段名</span><InputText v-model="settings.promptLlm.characterNegativePromptJsonField" /></label>
            <label class="cv-field"><span>角色位置字段名</span><InputText v-model="settings.promptLlm.characterPositionJsonField" /></label>
            <label class="cv-field"><span>角色 X 坐标字段名</span><InputText v-model="settings.promptLlm.characterPositionXJsonField" /></label>
            <label class="cv-field"><span>角色 Y 坐标字段名</span><InputText v-model="settings.promptLlm.characterPositionYJsonField" /></label>
          </div>
        </div>
      </template>
      <template v-else>
        <div>
          <span class="cv-subsection-title">全局提示词</span>
          <Divider />
          <div class="cv-field-grid">
            <label v-for="field in promptExtractRuleFields" :key="field.label" class="cv-field">
              <span>{{ field.patternLabel }}</span>
              <InputText v-model="settings.promptLlm[field.patternKey]" :placeholder="field.patternPlaceholder" />
            </label>
          </div>
        </div>
        <div>
          <span class="cv-subsection-title">NovelAI 角色提示词</span>
          <Divider />
          <div class="cv-field-grid items-end">
            <label v-for="field in characterExtractRuleFields" :key="field.label" class="cv-field">
              <span>{{ field.patternLabel }}</span>
              <InputText v-model="settings.promptLlm[field.patternKey]" :placeholder="field.patternPlaceholder || '/角色:\\s*(.+)/g'" />
            </label>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import PromptLlmMessageList from '@/panel/components/PromptLlmMessageList.vue';
import defaultPromptLlmPresetSettings from '@/constants/default-prompt-llm-preset';
import {
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID,
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME,
  DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
  DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
  DEFAULT_SETTINGS,
} from '@/constants/default-settings';
import { type PromptLlmMessage, type PromptLlmMessagePreset } from '@/constants/novelai';
import {
  downloadActivePromptLlmPresetPackage,
  importPresetPackageFile,
} from '@/services/data-portability/preset-toolbar';
import { normalizePromptLlmMessagePresets } from '@/services/prompt-llm/message-preset';
import { clonePromptLlmMessage } from '@/services/prompt-llm/message-source';
import { useSettingsStore } from '@/store/settings';
import manifest from '../../../manifest.json';

interface PromptExtractRuleField {
  label: string;
  patternKey: 'positivePromptExtractPattern' | 'negativePromptExtractPattern';
  patternPlaceholder: string;
  patternLabel: string;
}

interface CharacterExtractRuleField {
  label: string;
  patternKey:
    | 'characterPositivePromptExtractPattern'
    | 'characterNegativePromptExtractPattern'
    | 'characterPositionXExtractPattern'
    | 'characterPositionYExtractPattern';
  patternLabel: string;
  patternPlaceholder?: string;
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
    patternPlaceholder: DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
    patternLabel: '正面匹配正则',
  },
  {
    label: '负面提取规则',
    patternKey: 'negativePromptExtractPattern',
    patternPlaceholder: DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
    patternLabel: '负面匹配正则',
  },
] as const satisfies ReadonlyArray<PromptExtractRuleField>;

const CHARACTER_EXTRACT_RULE_FIELDS = [
  {
    label: '角色正面',
    patternKey: 'characterPositivePromptExtractPattern',
    patternLabel: '角色正面匹配正则',
    patternPlaceholder: '/"positivePrompt"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/g',
  },
  {
    label: '角色负面',
    patternKey: 'characterNegativePromptExtractPattern',
    patternLabel: '角色负面匹配正则',
    patternPlaceholder: '/"negativePrompt"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/g',
  },
  { label: '角色 X 位置', patternKey: 'characterPositionXExtractPattern', patternLabel: '角色 X 位置正则', patternPlaceholder: '/"x"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)/g' },
  { label: '角色 Y 位置', patternKey: 'characterPositionYExtractPattern', patternLabel: '角色 Y 位置正则', patternPlaceholder: '/"y"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)/g' },
] as const satisfies ReadonlyArray<CharacterExtractRuleField>;

const settingsStore = useSettingsStore();
const { settings, applyImportedSettings } = settingsStore;
const promptExtractRuleFields = [...PROMPT_EXTRACT_RULE_FIELDS];
const characterExtractRuleFields: CharacterExtractRuleField[] = [...CHARACTER_EXTRACT_RULE_FIELDS];
const extractMode = ref<'json' | 'regex'>('json');
const extractModeOptions = [
  { label: 'JSON 字段', value: 'json' },
  { label: '正则', value: 'regex' },
];

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
    messages: [],
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
 * 导出当前激活的 LLM 预设
 */
function exportPresetPackage(): void {
  try {
    downloadActivePromptLlmPresetPackage(settings, manifest.version);
    toastr.success('已导出当前 LLM 预设');
  } catch (error) {
    reportPresetToolbarError('导出 LLM 预设失败', error);
  }
}

/**
 * 导入 LLM 预设
 * @param file 用户选择的 JSON 文件
 */
async function importPresetPackage(file: File): Promise<void> {
  try {
    const result = await importPresetPackageFile(file, 'promptLlmMessagePresets', settings);
    applyImportedSettings(result.settings);
    toastr.success(`LLM 预设导入完成：成功 ${result.imported} 项`);
  } catch (error) {
    reportPresetToolbarError('导入 LLM 预设失败', error);
  }
}

/**
 * 报告预设工具栏错误
 * @param fallback 默认提示
 * @param error 捕获的错误
 */
function reportPresetToolbarError(fallback: string, error: unknown): void {
  toastr.error(error instanceof Error ? error.message : fallback);
  console.error(`[PromptBuilderTab] ${fallback}`, error);
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
 * 确认后重置Tag提取规则为默认值
 */
async function resetTagExtractionRules(): Promise<void> {
  const message = '确定要将所有Tag提取规则重置为默认值吗？';
  const confirmed = showConfirm
    ? await showConfirm({
        title: '重置Tag提取规则',
        message,
        acceptLabel: '确认重置',
        cancelLabel: '取消',
        severity: 'danger',
      })
    : confirm(message);

  if (!confirmed) return;

  const defaults = DEFAULT_SETTINGS.promptLlm;
  settings.promptLlm.preferJsonSchemaExtraction = defaults.preferJsonSchemaExtraction;
  settings.promptLlm.positivePromptJsonField = defaults.positivePromptJsonField;
  settings.promptLlm.negativePromptJsonField = defaults.negativePromptJsonField;
  settings.promptLlm.characterPromptsJsonField = defaults.characterPromptsJsonField;
  settings.promptLlm.characterPositivePromptJsonField = defaults.characterPositivePromptJsonField;
  settings.promptLlm.characterNegativePromptJsonField = defaults.characterNegativePromptJsonField;
  settings.promptLlm.characterPositionJsonField = defaults.characterPositionJsonField;
  settings.promptLlm.characterPositionXJsonField = defaults.characterPositionXJsonField;
  settings.promptLlm.characterPositionYJsonField = defaults.characterPositionYJsonField;
  settings.promptLlm.positivePromptExtractPattern = defaults.positivePromptExtractPattern;
  settings.promptLlm.negativePromptExtractPattern = defaults.negativePromptExtractPattern;
  settings.promptLlm.characterPositivePromptExtractPattern = defaults.characterPositivePromptExtractPattern;
  settings.promptLlm.characterNegativePromptExtractPattern = defaults.characterNegativePromptExtractPattern;
  settings.promptLlm.characterPositionXExtractPattern = defaults.characterPositionXExtractPattern;
  settings.promptLlm.characterPositionYExtractPattern = defaults.characterPositionYExtractPattern;

  toastr.success('Tag提取规则已重置为默认值');
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
    return activePreset.value?.messages ?? [];
  },
  set(value) {
    const preset = activePreset.value;
    if (!preset) {
      return;
    }

    preset.messages = value;
  },
});

/**
 * 规范化预设中的消息条目
 * @param preset 待处理预设
 * @returns 已规范化消息的预设
 */
function normalizePresetMessages(preset: PromptLlmMessagePreset): PromptLlmMessagePreset {
  const normalized = normalizePromptLlmMessagePresets({
    activePresetId: preset.id,
    presets: [preset],
  });
  return { ...preset, messages: normalized.presets[0].messages };
}

/**
 * 复制预设中的单条消息
 * @param message 消息条目
 * @returns 克隆后的消息
 */
function copyPresetMessage(message: PromptLlmMessage): PromptLlmMessage {
  return clonePromptLlmMessage(message);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-tab-content {
  @apply flex flex-col gap-0;
}

.cv-prompt-builder-preset-selector {
  margin-bottom: var(--cv-space-5xl);
}

.cv-message-section-head {
  @apply flex items-center;
  gap: var(--cv-space-sm);
  margin-bottom: var(--cv-space-5xl);
}

.cv-prompt-builder-title {
  @apply inline-flex items-center;
  gap: var(--cv-space-sm);
}

.cv-reset-default-preset-btn {
  @apply inline-flex cursor-pointer items-center justify-center;
  flex: 0 0 auto;
  width: 1.65em;
  height: 1.65em;
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-2xs);
  transition: all 0.15s ease;
}

.cv-reset-default-preset-btn:focus-visible,
.cv-reset-default-preset-btn:hover {
  color: var(--p-red-500);
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  outline: none;
}

.cv-subsection-title {
  display: block;
  font-size: var(--cv-font-size-2xs);
  font-weight: 600;
  color: var(--cv-on-surface-variant);
  margin-top: var(--cv-space-lg);
}
</style>
