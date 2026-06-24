<template>
  <PromptEntryList
    v-model="messages"
    empty-text="暂无消息，点击下方按钮开始构建"
    :get-role="entry => (entry as PromptLlmMessage).role"
  >
    <template #main="{ entry }">
      <span class="cv-message-indicator cv-indicator" />
      <span class="cv-message-role">{{ ROLE_LABELS[(entry as PromptLlmMessage).role] }}</span>
      <span v-if="isSourceMessage(entry as PromptLlmMessage)" class="cv-message-source-kind">
        {{ getMessageSourceLabel(entry as PromptLlmMessage) }}
      </span>
      <span class="cv-message-title">{{ getMessageTitle(entry as PromptLlmMessage) }}</span>
      <Tag
        v-if="isSourceMessage(entry as PromptLlmMessage) && !isSourceStatusReady(entry as PromptLlmMessage)"
        class="cv-status-tag-mini"
        :value="getSourceStatusText(entry as PromptLlmMessage)"
        :severity="getSourceStatusSeverity(entry as PromptLlmMessage)"
      />
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

  <button type="button" class="cv-add-message-btn-flat-wide" @click="addMessage">
    <i class="fa-solid fa-plus" /> 新建条目
  </button>

  <Dialog
    v-model:visible="isEditorVisible"
    class="cv-message-editor-dialog"
    modal
    dismissable-mask
    :header="editorTitle"
    :style="EDITOR_DIALOG_STYLE"
    :pt="EDITOR_DIALOG_PT"
    @hide="closeMessageEditor"
  >
    <div v-if="editorDraft" class="cv-message-editor">
      <label v-if="!isReservedDraft(editorDraft)" class="cv-field">
        <span>来源</span>
        <Select
          :model-value="editorDraft.kind"
          :options="editorSourceOptions"
          option-label="label"
          option-value="value"
          placeholder="选择条目来源"
          class="cv-source-select"
          :loading="isLoadingWorldbookSources"
          @update:model-value="updateEditorSource"
        />
      </label>

      <div v-if="editorDraft.kind === 'worldbook_entry'" class="cv-source-pair-row">
        <label class="cv-field cv-source-pair-field">
          <span>世界书</span>
          <Select
            :model-value="editorDraft.selectedWorldbookName"
            :options="worldbookOptions"
            option-label="label"
            option-value="value"
            placeholder="选择世界书"
            class="cv-source-select"
            :loading="isLoadingWorldbookSources"
            @update:model-value="updateSelectedWorldbookName"
          />
        </label>
        <label class="cv-field cv-source-pair-field">
          <span>条目</span>
          <Select
            :model-value="editorDraft.selectedWorldbookEntryUid"
            :options="worldbookEntryOptions"
            option-label="label"
            option-value="value"
            placeholder="选择条目"
            class="cv-source-select"
            :disabled="worldbookEntryOptions.length === 0"
            @update:model-value="updateSelectedWorldbookEntryUid"
          />
        </label>
      </div>
      <div v-if="isEditorWorldbookReferenceMissing()" class="cv-field-warn">
        当前引用的世界书条目已失效，已保留原始值，请重新选择。
      </div>

      <label v-if="!isReservedDraft(editorDraft)" class="cv-field">
        <span>条目名称</span>
        <InputText
          v-if="editorDraft.kind === 'custom'"
          :model-value="editorDraft.customTitle"
          placeholder="用于消息列表显示"
          @update:model-value="value => updateDraftField('customTitle', value ?? '')"
        />
        <InputText v-else :model-value="editorReadonlyTitle" disabled />
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
          <span>{{ getEditorContentLabel(editorDraft) }}</span>
          <div v-if="editorDraft.kind === 'custom' && !isReservedDraft(editorDraft)" class="cv-source-tokens" @click.prevent>
            <span class="cv-token-label">插入：</span>
            <button type="button" class="cv-token-btn" @click="insertMessageToken(PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN)">焦点段落</button>
            <button type="button" class="cv-token-btn" @click="insertMessageToken(PROMPT_LLM_SPECIAL_REQUEST_TOKEN)">特别要求</button>
          </div>
        </div>
        <Textarea
          v-if="isReservedDraft(editorDraft)"
          :model-value="getPromptLlmReservedPreviewText(editorDraft)"
          class="cv-message-editor-textarea custom-scrollbar"
          rows="4"
          disabled
        />
        <Textarea
          v-else-if="editorDraft.kind === 'custom'"
          :model-value="editorDraft.customContent"
          class="cv-message-editor-textarea custom-scrollbar"
          rows="10"
          placeholder="输入消息内容..."
          @update:model-value="value => updateDraftField('customContent', value ?? '')"
        />
        <Textarea
          v-else
          :model-value="editorPreviewText"
          class="cv-message-editor-textarea custom-scrollbar"
          rows="6"
          disabled
        />
      </label>
    </div>
    <template #footer>
      <div class="cv-message-editor-actions">
        <Button label="取消" text @click="closeMessageEditor" />
        <Button label="保存" icon="fa-solid fa-check" :disabled="!canSaveEditor" @click="saveMessageEditor" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN, PROMPT_LLM_SPECIAL_REQUEST_TOKEN } from '@/constants/default-settings';
import {
  getPromptLlmMessageEntryKind,
  type PromptLlmMessage,
  type PromptLlmMessageEntryKind,
  type PromptLlmMessageRole,
} from '@/constants/novelai';
import PromptEntryList from '@/panel/components/PromptEntryList.vue';
import {
  applyPromptLlmMessageDefaults,
  buildPromptLlmSourceOptions,
  buildSavedPromptLlmMessage,
  canSavePromptLlmMessageDraft,
  createPromptLlmMessageEditorDraft,
  getPromptLlmSourceLabel,
  syncPromptLlmMessageDraftFields,
  type PromptLlmMessageEditorDraft,
} from '@/panel/components/prompt-llm-message-editor';
import {
  buildWorldbookEntryOptions,
  buildWorldbookOptions,
  getWorldbookReferenceDisplayTitle,
  isWorldbookReferenceMissing,
  pickWorldbookEntryUid,
} from '@/panel/components/prompt-worldbook-source';
import { getPromptLlmReservedPreviewText, isPromptLlmReservedMessage } from '@/services/prompt-llm/message-preset';
import { createCustomPromptLlmMessage, resolvePromptLlmSourceMessage } from '@/services/prompt-llm/message-source';
import {
  getPromptWorldbookSourceOptions,
  type PromptWorldbookGroup,
  type ResolvedPromptSourceEntry,
} from '@/services/tavern-helper/worldbook-sources';

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

const EDITOR_DIALOG_STYLE = {
  width: '42rem',
  maxHeight: 'min(42rem, calc(100dvh - 2rem))',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

const EDITOR_DIALOG_PT = {
  content: { style: { display: 'flex', flexDirection: 'column', overflowY: 'auto' } },
} as const;

const messages = defineModel<PromptLlmMessage[]>({ required: true });
const entryStatusMap = ref<Record<string, ResolvedPromptSourceEntry>>({});
const worldbookSourceOptions = ref<PromptWorldbookGroup[]>([]);
const editorDraft = ref<PromptLlmMessageEditorDraft | null>(null);
const editorPreview = ref<ResolvedPromptSourceEntry | null>(null);
const isEditorVisible = ref(false);
const isLoadingWorldbookSources = ref(false);

let worldbookSourceRequestId = 0;
let entryStatusRequestId = 0;
let editorPreviewRequestId = 0;

const editorSourceOptions = computed(() => buildPromptLlmSourceOptions(editorDraft.value?.kind));
const worldbookOptions = computed(() =>
  buildWorldbookOptions(worldbookSourceOptions.value, editorDraft.value?.selectedWorldbookName ?? ''),
);
const worldbookEntryOptions = computed(() =>
  buildWorldbookEntryOptions(
    worldbookSourceOptions.value,
    editorDraft.value?.selectedWorldbookName ?? '',
    editorDraft.value?.selectedWorldbookEntryUid ?? null,
  ),
);
const canSaveEditor = computed(() => Boolean(editorDraft.value && canSavePromptLlmMessageDraft(editorDraft.value)));
const editorTitle = computed(() => {
  if (!editorDraft.value) return '编辑消息';
  return `编辑 ${ROLE_LABELS[editorDraft.value.role]} 消息`;
});
const editorPreviewText = computed(() => getResolvedPreviewText(editorPreview.value));
const editorReadonlyTitle = computed(() => getEditorReadonlyTitle(editorDraft.value));
const sourceMessageStatusSignature = computed(() =>
  messages.value
    .filter(isSourceMessage)
    .map(message => `${message.id}:${message.reference?.worldbookName ?? ''}:${message.reference?.entryUid ?? ''}`)
    .join('|'),
);

watch(sourceMessageStatusSignature, refreshEntryStatuses, { immediate: true });
watch(
  () => isEditorVisible.value,
  visible => {
    if (visible || worldbookSourceOptions.value.length === 0) void loadWorldbookSources();
  },
  { immediate: true },
);
watch(
  () =>
    [
      isEditorVisible.value,
      editorDraft.value?.kind ?? '',
      editorDraft.value?.selectedWorldbookName ?? '',
      editorDraft.value?.selectedWorldbookEntryUid ?? null,
    ] as const,
  refreshEditorPreview,
);

/**
 * 刷新来源条目状态
 */
async function refreshEntryStatuses(): Promise<void> {
  const requestId = ++entryStatusRequestId;
  const sourceMessages = messages.value.filter(isSourceMessage);
  const statusEntries = await Promise.all(
    sourceMessages.map(async message => [message.id, await resolveSourceMessage(message)] as const),
  );
  if (requestId !== entryStatusRequestId) return;
  entryStatusMap.value = Object.fromEntries(statusEntries);
}

/**
 * 加载全部世界书来源
 */
async function loadWorldbookSources(): Promise<void> {
  const requestId = ++worldbookSourceRequestId;
  isLoadingWorldbookSources.value = true;
  try {
    const options = await getPromptWorldbookSourceOptions();
    if (requestId !== worldbookSourceRequestId) return;
    worldbookSourceOptions.value = options;
    if (editorDraft.value?.kind === 'worldbook_entry') {
      applyPromptLlmMessageDefaults(editorDraft.value, options);
      syncPromptLlmMessageDraftFields(editorDraft.value, options);
    }
  } catch (error) {
    console.error('[PromptLlmMessageList]', error);
    toastr.warning('世界书读取失败，仍可创建其他条目');
  } finally {
    if (requestId === worldbookSourceRequestId) isLoadingWorldbookSources.value = false;
  }
}

/**
 * 新增默认 LLM 条目
 */
function addMessage(): void {
  messages.value.push(createCustomPromptLlmMessage('user'));
}

/**
 * 删除消息
 * @param id 消息 id
 */
function deleteMessage(id: string): void {
  const index = messages.value.findIndex(message => message.id === id);
  if (index === -1 || isReservedMessage(messages.value[index])) return;
  if (editorDraft.value?.id === id) closeMessageEditor();
  messages.value.splice(index, 1);
}

/**
 * 打开消息编辑弹窗
 * @param message 待编辑消息
 */
function openMessageEditor(message: PromptLlmMessage): void {
  editorDraft.value = createPromptLlmMessageEditorDraft(message, worldbookSourceOptions.value);
  isEditorVisible.value = true;
}

/**
 * 关闭消息编辑弹窗
 */
function closeMessageEditor(): void {
  isEditorVisible.value = false;
  editorDraft.value = null;
  editorPreview.value = null;
}

/**
 * 保存消息编辑结果
 */
function saveMessageEditor(): void {
  const draft = editorDraft.value;
  if (!draft || !canSaveEditor.value) return;
  const message = messages.value.find(item => item.id === draft.id);
  if (!message) return closeMessageEditor();

  if (isReservedDraft(draft)) {
    message.role = draft.role;
  } else {
    Object.assign(message, buildSavedPromptLlmMessage(draft, worldbookSourceOptions.value));
  }
  closeMessageEditor();
}

/**
 * 切换编辑弹窗来源
 * @param source 来源类型
 */
function updateEditorSource(source: PromptLlmMessageEntryKind): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft.kind = source;
  applyPromptLlmMessageDefaults(draft, worldbookSourceOptions.value);
  syncPromptLlmMessageDraftFields(draft, worldbookSourceOptions.value);
}

/**
 * 更新世界书选择
 * @param worldbookName 世界书名称
 */
function updateSelectedWorldbookName(worldbookName: string): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft.selectedWorldbookName = worldbookName;
  draft.selectedWorldbookEntryUid = pickWorldbookEntryUid(worldbookSourceOptions.value, worldbookName, null);
  syncPromptLlmMessageDraftFields(draft, worldbookSourceOptions.value);
}

/**
 * 更新草稿字段
 * @param key 字段键
 * @param value 字段值
 */
function updateDraftField<TKey extends keyof PromptLlmMessageEditorDraft>(
  key: TKey,
  value: PromptLlmMessageEditorDraft[TKey],
): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft[key] = value;
  if (key === 'customTitle') draft.title = value as string;
  if (key === 'customContent') draft.content = value as string;
  if (key === 'selectedWorldbookEntryUid') syncPromptLlmMessageDraftFields(draft, worldbookSourceOptions.value);
}

/**
 * 更新世界书条目选择
 * @param entryUid 条目 uid
 */
function updateSelectedWorldbookEntryUid(entryUid: number | null): void {
  updateDraftField('selectedWorldbookEntryUid', entryUid);
}

/**
 * 向自定义消息末尾插入宏
 * @param token 宏文本
 */
function insertMessageToken(token: string): void {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'custom') return;
  const separator = draft.customContent && !draft.customContent.endsWith(' ') ? ' ' : '';
  updateDraftField('customContent', `${draft.customContent}${separator}${token}`);
}

/**
 * 刷新当前弹窗资料预览
 */
async function refreshEditorPreview(): Promise<void> {
  const draft = editorDraft.value;
  if (!isEditorVisible.value || !draft || draft.kind !== 'worldbook_entry') {
    editorPreview.value = null;
    return;
  }
  const requestId = ++editorPreviewRequestId;
  const resolved = await resolveSourceMessage(buildSavedPromptLlmMessage(draft, worldbookSourceOptions.value));
  if (requestId === editorPreviewRequestId) editorPreview.value = resolved;
}

/**
 * 判断是否为保留消息
 * @param message 消息条目
 * @returns 是否为保留消息
 */
function isReservedMessage(message: PromptLlmMessage): boolean {
  return isPromptLlmReservedMessage(message);
}

/**
 * 判断编辑草稿是否为保留消息
 * @param draft 编辑草稿
 * @returns 是否为保留消息
 */
function isReservedDraft(draft: PromptLlmMessageEditorDraft): boolean {
  return isPromptLlmReservedMessage(draft);
}

/**
 * 判断是否为来源型消息
 * @param message 消息条目
 * @returns 是否为来源型消息
 */
function isSourceMessage(message: PromptLlmMessage): boolean {
  return !isReservedMessage(message) && getPromptLlmMessageEntryKind(message) !== 'custom';
}

/**
 * 获取消息状态条目
 * @param message 消息条目
 * @returns 状态条目
 */
function getMessageStatus(message: PromptLlmMessage): ResolvedPromptSourceEntry['status'] {
  return entryStatusMap.value[message.id]?.status ?? 'missing';
}

/**
 * 判断来源是否可用
 * @param message 消息条目
 * @returns 是否可用
 */
function isSourceStatusReady(message: PromptLlmMessage): boolean {
  return getMessageStatus(message) === 'ready';
}

/**
 * 获取来源状态文案
 * @param message 消息条目
 * @returns 状态文案
 */
function getSourceStatusText(message: PromptLlmMessage): string {
  const status = getMessageStatus(message);
  if (status === 'ready') return '可用';
  if (status === 'unsupported') return '未接入';
  return '来源失效';
}

/**
 * 获取来源状态颜色
 * @param message 消息条目
 * @returns PrimeVue Tag severity
 */
function getSourceStatusSeverity(message: PromptLlmMessage): 'success' | 'warn' | 'danger' {
  const status = getMessageStatus(message);
  if (status === 'ready') return 'success';
  if (status === 'unsupported') return 'warn';
  return 'danger';
}

/**
 * 获取消息来源标签
 * @param message 消息条目
 * @returns 来源标签
 */
function getMessageSourceLabel(message: PromptLlmMessage): string {
  return getPromptLlmSourceLabel(getPromptLlmMessageEntryKind(message));
}

/**
 * 获取消息标题
 * @param message 消息对象
 * @returns 列表中显示的单行标题
 */
function getMessageTitle(message: PromptLlmMessage): string {
  const title = message.title.trim();
  if (title) return title;
  if (getPromptLlmMessageEntryKind(message) === 'worldbook_entry') return '世界书条目';
  const normalized = message.content.trim().replace(/\s+/g, ' ');
  if (!normalized) return '未命名条目';
  return normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;
}

/**
 * 获取编辑区内容标签
 * @param draft 编辑草稿
 * @returns 字段标签
 */
function getEditorContentLabel(draft: PromptLlmMessageEditorDraft): string {
  return isPromptLlmReservedMessage(draft) || draft.kind === 'custom' ? '内容' : '资料预览';
}

/**
 * 获取解析结果预览文本
 * @param resolved 解析结果
 * @returns 预览文本
 */
function getResolvedPreviewText(resolved: ResolvedPromptSourceEntry | null): string {
  if (!resolved) return '正在读取资料...';
  if (resolved.status === 'ready') return resolved.content;
  if (resolved.status === 'unsupported') return '该资料来源本期仅保留占位';
  return '当前引用已失效，运行时会跳过该条目';
}

/**
 * 判断编辑中的世界书引用是否已失效
 * @returns 是否失效
 */
function isEditorWorldbookReferenceMissing(): boolean {
  const draft = editorDraft.value;
  return draft?.kind === 'worldbook_entry' && isWorldbookReferenceMissing(
    worldbookSourceOptions.value,
    draft.selectedWorldbookName,
    draft.selectedWorldbookEntryUid,
  );
}

/**
 * 获取编辑器只读标题展示
 * @param draft 编辑草稿
 * @returns 标题展示文本
 */
function getEditorReadonlyTitle(draft: PromptLlmMessageEditorDraft | null): string {
  if (!draft || draft.kind !== 'worldbook_entry') return draft?.title ?? '';
  return getWorldbookReferenceDisplayTitle(draft.title, isEditorWorldbookReferenceMissing());
}

/**
 * 解析来源消息
 * @param message 消息条目
 * @returns 解析结果
 */
async function resolveSourceMessage(message: PromptLlmMessage): Promise<ResolvedPromptSourceEntry> {
  const resolved = await resolvePromptLlmSourceMessage(message);
  return resolved ?? { status: 'missing', title: getMessageTitle(message), content: '' };
}
</script>

<style scoped>
.cv-add-message-btn-flat-wide {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  margin-bottom: var(--cv-space-6xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  font-size: calc(var(--mainFontSize) * 0.85);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-add-message-btn-flat-wide:hover {
  border-color: var(--cv-outline);
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 10%, transparent);
}

.cv-message-indicator {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color);
  box-shadow: 0 0 6px var(--p-primary-color);
}

.cv-message-role,
.cv-message-source-kind {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--cv-on-surface) 55%, transparent);
  font-size: calc(var(--mainFontSize) * 0.75);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cv-message-source-kind {
  color: var(--cv-on-surface-variant);
}

.cv-message-title {
  min-width: 0;
  overflow: hidden;
  color: var(--cv-on-surface);
  font-size: calc(var(--mainFontSize) * 0.9);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-message-toggle {
  flex-shrink: 0;
  margin-right: 0;
  transform: scale(0.7);
}

.cv-message-edit-btn {
  color: color-mix(in srgb, var(--cv-on-surface) 60%, transparent) !important;
}

.cv-message-edit-btn:hover {
  background: var(--cv-surface-container-high) !important;
  color: var(--cv-on-surface) !important;
}

.cv-status-tag-mini {
  height: auto !important;
  padding: 0.05rem 0.2rem !important;
  font-size: 0.65rem !important;
  line-height: 1 !important;
}

.cv-message-editor {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-3xl);
}

.cv-message-editor-dialog {
  display: flex;
  flex-direction: column;
}

.cv-role-select {
  width: 8em;
}

.cv-source-select {
  width: 100%;
}

.cv-source-pair-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--cv-space-md);
}

.cv-source-pair-field {
  min-width: 0;
}

.cv-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.cv-field-header > span {
  color: var(--cv-on-surface);
  font-family: var(--cv-font-body);
  font-size: calc(var(--mainFontSize) * 1);
  font-weight: 500;
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
  padding: 2px 6px;
  border: none;
  border-radius: var(--cv-radius-sm);
  background: none;
  color: var(--p-primary-color);
  cursor: pointer;
  font-size: inherit;
  transition: all 0.2s;
}

.cv-token-btn:hover {
  background: var(--cv-surface-container-high);
  color: var(--p-primary-hover-color);
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

@media (max-width: 520px) {
  .cv-source-pair-row {
    grid-template-columns: 1fr;
  }
}
</style>
