<template>
  <div class="cv-tab-content">
    <div class="cv-message-section-head">
      <h2 class="cv-section-title">提示词生成预设</h2>
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

    <PromptEntryList
      v-model="messages"
      empty-text="暂无消息，点击下方按钮开始构建"
      :get-role="entry => (entry as PromptLlmMessage).role"
    >
      <template #main="{ entry }">
        <span class="cv-message-indicator cv-indicator" />
        <span class="cv-message-role">{{ ROLE_LABELS[(entry as PromptLlmMessage).role] }}</span>
        <span class="cv-message-title">{{ getMessageTitle(entry as PromptLlmMessage) }}</span>
      </template>
      <template #actions="{ entry }">
        <ToggleSwitch v-model="entry.enabled" class="cv-message-toggle" />
        <Button
          icon="fa-solid fa-pen"
          class="cv-message-edit-btn"
          text
          size="small"
          @click="openMessageEditor(entry as PromptLlmMessage)"
        />
        <Button
          v-if="!isReservedMessage(entry as PromptLlmMessage)"
          icon="fa-solid fa-trash"
          severity="danger"
          text
          size="small"
          @click="deleteMessage(entry.id)"
        />
      </template>
    </PromptEntryList>

    <button type="button" class="cv-add-message-btn-flat-wide" @click="addMessage('user', '')">
      <i class="fa-solid fa-plus" /> 新建条目
    </button>
    <Dialog
      v-model:visible="isEditorVisible"
      class="cv-message-editor-dialog"
      modal
      dismissable-mask
      :header="editorTitle"
      :style="editorDialogStyle"
      :pt="MESSAGE_EDITOR_DIALOG_PT"
      @hide="closeMessageEditor"
    >
      <div v-if="editorDraft" class="cv-message-editor">
        <label v-if="!isReservedDraft(editorDraft)" class="cv-field">
          <span>条目名称</span>
          <InputText v-model="editorDraft.title" placeholder="用于消息列表显示" />
        </label>
        <label class="cv-field">
          <span>角色</span>
          <Select
            v-model="editorDraft.role"
            :options="ROLE_OPTIONS"
            option-label="label"
            option-value="value"
            class="cv-role-select"
          />
        </label>
        <label class="cv-field cv-message-editor-content-field">
          <div class="cv-field-header">
            <span>内容</span>
            <div v-if="!isReservedDraft(editorDraft)" class="cv-source-tokens" @click.prevent>
              <span class="cv-token-label">插入：</span>
              <button type="button" class="cv-token-btn" @click="insertMessageToken(focusParagraphToken)">
                焦点段落
              </button>
              <button type="button" class="cv-token-btn" @click="insertMessageToken(specialRequestToken)">
                特别要求
              </button>
            </div>
          </div>
          <Textarea
            v-if="isReservedDraft(editorDraft)"
            :model-value="getReservedDraftPreviewText(editorDraft)"
            class="cv-message-editor-textarea custom-scrollbar"
            rows="4"
            disabled
          />
          <Textarea
            v-else
            v-model="editorDraft.content"
            class="cv-message-editor-textarea custom-scrollbar"
            rows="10"
            placeholder="输入消息内容..."
          />
        </label>
      </div>
      <template #footer>
        <div class="cv-message-editor-actions">
          <Button label="取消" text @click="closeMessageEditor" />
          <Button label="保存" icon="fa-solid fa-check" @click="saveMessageEditor" />
        </div>
      </template>
    </Dialog>

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
import PromptEntryList from '@/panel/components/PromptEntryList.vue';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import PromptMessagePreview from '@/panel/components/PromptMessagePreview.vue';
import {
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID,
  DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME,
  DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
  DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
  DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
  DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
  DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
} from '@/constants/default-settings';
import {
  type PromptLlmMessage,
  type PromptLlmMessagePreset,
  type PromptLlmMessageRole,
} from '@/constants/novelai';
import {
  createPromptLlmHistoryMessage,
  ensurePromptLlmReservedMessages,
  getPromptLlmReservedPreviewText,
  isPromptLlmReservedMessage,
  normalizePromptLlmReservedMessage,
} from '@/services/prompt-llm/message-preset';
import { useSettingsStore } from '@/store/settings';

/**
 * 消息编辑草稿
 */
interface MessageEditorDraft {
  id: string;
  title: string;
  role: PromptLlmMessageRole;
  content: string;
}

interface PromptExtractRuleField {
  label: string;
  patternKey: 'positivePromptExtractPattern' | 'negativePromptExtractPattern';
  replacementKey: 'positivePromptExtractReplacement' | 'negativePromptExtractReplacement';
  patternPlaceholder: string;
  replacementPlaceholder: string;
  patternLabel: string;
  replacementLabel: string;
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

const ROLE_LABELS: Record<PromptLlmMessageRole, string> = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
};

const ROLE_OPTIONS = [
  { label: ROLE_LABELS.system, value: 'system' },
  { label: ROLE_LABELS.user, value: 'user' },
  { label: ROLE_LABELS.assistant, value: 'assistant' },
];

const { settings } = useSettingsStore();
const promptExtractRuleFields = [...PROMPT_EXTRACT_RULE_FIELDS];
const focusParagraphToken = PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN;
const specialRequestToken = PROMPT_LLM_SPECIAL_REQUEST_TOKEN;

const activePreset = computed(() => {
  const { activePresetId, presets } = settings.promptLlmMessagePresets;
  return presets.find(preset => preset.id === activePresetId) ?? presets[0];
});

const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');

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
  const copiedMessages = current.messages.map(m => ({
    ...m,
    id: isPromptLlmReservedMessage(m) ? m.id : uuidv4(),
    enabled: m.enabled !== false,
  }));
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
const isEditorVisible = ref(false);
const editorDraft = ref<MessageEditorDraft | null>(null);
const editorDialogStyle = {
  width: '42rem',
  maxHeight: 'min(42rem, calc(100dvh - 2rem))',
  maxWidth: 'calc(100vw - 2rem)',
} as const;
const MESSAGE_EDITOR_DIALOG_PT = {
  content: { style: { display: 'flex', flexDirection: 'column', overflowY: 'auto' } },
} as const;

/**
 * 当前弹窗标题
 */
const editorTitle = computed(() => {
  if (!editorDraft.value) {
    return '编辑消息';
  }

  return `编辑 ${ROLE_LABELS[editorDraft.value.role]} 消息`;
});

/**
 * 添加新消息
 * @param role 消息角色
 * @param content 消息内容
 */
function addMessage(role: PromptLlmMessageRole, content: string): void {
  messages.value.push({
    id: uuidv4(),
    title: DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
    role,
    content,
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  });
}

/**
 * 删除消息
 * @param id 消息 id
 */
function deleteMessage(id: string): void {
  const index = messages.value.findIndex(message => message.id === id);
  if (index === -1) return;
  if (isReservedMessage(messages.value[index])) return;
  if (editorDraft.value?.id === id) closeMessageEditor();
  messages.value.splice(index, 1);
}

/**
 * 获取消息标题
 * @param message 消息对象
 * @returns 列表中显示的单行标题
 */
function getMessageTitle(message: PromptLlmMessage): string {
  const title = message.title.trim();
  if (title) {
    return title;
  }

  const normalized = message.content.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '未命名条目';
  }

  return normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;
}

/**
 * 打开消息编辑弹窗
 * @param message 待编辑消息
 */
function openMessageEditor(message: PromptLlmMessage): void {
  editorDraft.value = {
    id: message.id,
    title: message.title,
    role: message.role,
    content: message.content,
  };
  isEditorVisible.value = true;
}

/**
 * 关闭消息编辑弹窗
 */
function closeMessageEditor(): void {
  isEditorVisible.value = false;
  editorDraft.value = null;
}

/**
 * 保存消息编辑结果
 */
function saveMessageEditor(): void {
  if (!editorDraft.value) return;
  const message = messages.value.find(item => item.id === editorDraft.value?.id);
  if (!message) return closeMessageEditor();
  if (isReservedMessage(message)) {
    message.role = editorDraft.value.role;
    return closeMessageEditor();
  }

  message.title = editorDraft.value.title;
  message.role = editorDraft.value.role;
  message.content = editorDraft.value.content;
  closeMessageEditor();
}

/**
 * 向自定义消息末尾插入宏
 * @param token 宏文本
 */
function insertMessageToken(token: string): void {
  const draft = editorDraft.value;
  if (!draft || isReservedDraft(draft)) return;
  const separator = draft.content && !draft.content.endsWith(' ') ? ' ' : '';
  draft.content = `${draft.content}${separator}${token}`;
}

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
 * 判断消息是否为保留消息
 * @param message 消息条目
 * @returns 是否为保留消息
 */
function isReservedMessage(message: PromptLlmMessage): boolean {
  normalizePromptLlmReservedMessage(message);
  return isPromptLlmReservedMessage(message);
}

/**
 * 判断编辑草稿是否为保留消息
 * @param draft 编辑草稿
 * @returns 是否为保留消息
 */
function isReservedDraft(draft: MessageEditorDraft): boolean {
  return isPromptLlmReservedMessage(draft);
}

/**
 * 获取保留草稿预览文本
 * @param draft 编辑草稿
 * @returns 预览文本
 */
function getReservedDraftPreviewText(draft: MessageEditorDraft): string {
  return getPromptLlmReservedPreviewText(draft);
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
  justify-content: space-between;
  gap: var(--cv-space-sm);
  margin-bottom: var(--cv-space-5xl);
}

.cv-add-message-btn-flat-wide {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: calc(var(--mainFontSize) * 0.85);
  margin-bottom: var(--cv-space-6xl);
}

.cv-add-message-btn-flat-wide:hover {
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  border-color: var(--cv-outline);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 10%, transparent);
}

/* LED Indicator 彩色小圆点 */
.cv-message-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.2s ease;
  background: var(--p-primary-color);
  box-shadow: 0 0 6px var(--p-primary-color);
}

.cv-message-role {
  color: color-mix(in srgb, var(--cv-on-surface) 55%, transparent);
  font-size: calc(var(--mainFontSize) * 0.75);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex: 0 0 auto;
}

.cv-message-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(var(--mainFontSize) * 0.9);
  color: var(--cv-on-surface);
  font-weight: 500;
}

.cv-message-toggle {
  transform: scale(0.7);
  margin-right: 0;
  flex-shrink: 0;
}

.cv-message-edit-btn {
  color: color-mix(in srgb, var(--cv-on-surface) 60%, transparent) !important;
}

.cv-message-edit-btn:hover {
  color: var(--cv-on-surface) !important;
  background: var(--cv-surface-container-high) !important;
}

.cv-role-select {
  width: 8em;
}

.cv-message-editor {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-3xl);
}

.cv-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.cv-field-header > span {
  font-family: var(--cv-font-body);
  font-size: calc(var(--mainFontSize) * 1);
  font-weight: 500;
  color: var(--cv-on-surface);
}

.cv-source-tokens {
  display: flex;
  align-items: center;
  gap: var(--cv-space-xs);
  font-size: calc(var(--mainFontSize) * 0.75);
}

.cv-token-label {
  color: var(--cv-on-surface-variant);
  opacity: 0.8;
}

.cv-token-btn {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--p-primary-color);
  cursor: pointer;
  font-size: inherit;
  transition: all 0.2s;
}

.cv-token-btn:hover {
  background: var(--cv-surface-container-high);
  color: var(--p-primary-hover-color);
}

.cv-message-editor-dialog {
  display: flex;
  flex-direction: column;
}

.cv-message-editor-content-field {
  display: flex;
  flex-direction: column;
}

.cv-message-editor-textarea {
  width: 100%;
  height: 12rem;
  min-height: 6rem;
  overflow-y: auto;
  resize: vertical;
}

.cv-message-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--cv-space-sm);
}
</style>
