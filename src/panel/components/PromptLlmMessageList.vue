<template>
  <PromptEntryList
    ref="entryList"
    v-model="messages"
    empty-text="暂无消息，点击下方按钮开始构建"
    :get-role="entry => (entry as PromptLlmMessage).role"
  >
    <template #main="{ entry }">
      <!-- cv-indicator：PromptEntryList 禁用态 [&_.cv-indicator] 锚点 -->
      <span
        class="cv-message-indicator cv-indicator size-1.5 shrink-0 rounded-full"
        :class="getMessageTriggerToneClass(entry as PromptLlmMessage)"
      />
      <i
        class="shrink-0 text-(length:--cv-font-size-sm) text-[color-mix(in_srgb,var(--cv-on-surface)_55%,transparent)]"
        :class="ROLE_ICONS[(entry as PromptLlmMessage).role]"
        :title="ROLE_LABELS[(entry as PromptLlmMessage).role]"
      />
      <span class="sr-only">{{ ROLE_LABELS[(entry as PromptLlmMessage).role] }}</span>
      <span
        v-if="isSourceMessage(entry as PromptLlmMessage)"
        class="shrink-0 whitespace-nowrap text-(length:--cv-font-size-2xs) font-semibold uppercase tracking-normal text-(--cv-on-surface-variant)"
      >
        {{ getMessageSourceLabel(entry as PromptLlmMessage) }}
      </span>
      <span
        class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--cv-font-size-md) font-medium text-(--cv-on-surface)"
      >{{ getMessageTitle(entry as PromptLlmMessage) }}</span>
      <Tag
        v-if="shouldShowSourceStatus(entry as PromptLlmMessage)"
        class="cv-status-tag-mini h-auto leading-none"
        :value="getSourceStatusText(entry as PromptLlmMessage)"
        :severity="getSourceStatusSeverity(entry as PromptLlmMessage)"
      />
    </template>
    <template #actions="{ entry }">
      <CvMiniToggleSwitch
        :model-value="(entry as PromptLlmMessage).enabled !== false"
        :aria-label="(entry as PromptLlmMessage).enabled !== false ? '禁用条目' : '启用条目'"
        @update:model-value="toggleMessageEnabled(entry as PromptLlmMessage)"
      />
      <CvMiniButton
        icon="fa-regular fa-pen"
        aria-label="编辑条目"
        @click="openMessageEditor(entry as PromptLlmMessage)"
      />
      <CvMiniButton
        icon="fa-regular fa-trash"
        tone="danger"
        aria-label="删除条目"
        @click="deleteMessage(entry.id)"
      />
    </template>
  </PromptEntryList>

  <CvAddEntryButton label="新建条目" @click="addMessage" />

  <Dialog
    v-model:visible="isEditorVisible"
    class="flex flex-col"
    modal
    dismissable-mask
    :header="editorTitle"
    :style="PROMPT_EDITOR_DIALOG_STYLE"
    :pt="PROMPT_EDITOR_DIALOG_PT"
    @hide="closeMessageEditor"
  >
    <div v-if="editorDraft" class="flex flex-col gap-(--cv-space-3xl)">
      <label class="cv-field">
        <span>来源</span>
        <Select
          :model-value="editorDraft.kind"
          :options="editorSourceOptions"
          option-label="label"
          option-value="value"
          placeholder="选择条目来源"
          fluid
          class="w-full"
          :loading="isLoadingWorldbookSources"
          @update:model-value="updateEditorSource"
        />
      </label>

      <div v-if="editorDraft.kind === 'worldbook_entry'" class="cv-field-control">
        <div class="grid grid-cols-1 gap-(--cv-space-md) min-[520px]:grid-cols-2">
          <label class="cv-field min-w-0">
            <span>世界书</span>
            <Select
              :model-value="editorDraft.selectedWorldbookName"
              :options="worldbookOptions"
              option-label="label"
              option-value="value"
              placeholder="选择世界书"
              fluid
              class="w-full"
              :loading="isLoadingWorldbookSources"
              @update:model-value="updateSelectedWorldbookName"
            />
          </label>
          <label class="cv-field min-w-0">
            <span>条目</span>
            <Select
              :model-value="editorDraft.selectedWorldbookEntryUid"
              :options="worldbookEntryOptions"
              option-label="label"
              option-value="value"
              placeholder="选择条目"
              fluid
              class="w-full"
              :disabled="worldbookEntryOptions.length === 0"
              @update:model-value="updateSelectedWorldbookEntryUid"
            />
          </label>
        </div>
        <div v-if="isEditorWorldbookReferenceMissing()" class="cv-field-warn">
          当前引用的世界书条目已失效，已保留原始值，请重新选择。
        </div>
      </div>

      <label class="cv-field">
        <span>条目名称</span>
        <InputText
          v-if="editorDraft.kind === 'custom'"
          :model-value="editorDraft.customTitle"
          placeholder="用于消息列表显示"
          @update:model-value="value => updateDraftField('customTitle', value ?? '')"
        />
        <InputText v-else :model-value="editorReadonlyTitle" disabled />
      </label>

      <!--
        角色 + 触发编辑器并排；匹配/条件区由子组件锚点 cv-trigger-match-field /
        cv-trigger-conditions-field 跨两列（任意后代选择器，非 :deep）
      -->
      <Fluid
        class="grid w-full grid-cols-1 gap-x-(--cv-space-md) gap-y-(--cv-space-3xl) min-[520px]:grid-cols-2 [&_.cv-trigger-match-field]:col-span-full [&_.cv-trigger-match-field]:min-w-0 [&_.cv-trigger-conditions-field]:col-span-full [&_.cv-trigger-conditions-field]:min-w-0"
      >
        <label class="cv-field min-w-0">
          <span>角色</span>
          <Select
            v-model="editorDraft.role"
            :options="ROLE_OPTIONS"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
        <PromptLlmTriggerEditor v-model="editorDraft" />
      </Fluid>

      <div class="cv-field">
        <div class="cv-field-header">
          <span>{{ getEditorContentLabel(editorDraft) }}</span>
          <div v-if="editorDraft.kind === 'custom'" class="flex w-max items-center">
            <CvMiniButton
              label="插入宏"
              class="cv-macro-button-root cv-macro-trigger-button"
              @pointerdown.prevent="rememberMessageSelection"
              @click.stop="toggleMacroPopover"
            />
            <Popover
              ref="macroPopover"
              :base-z-index="MACRO_POPOVER_BASE_Z_INDEX"
              :pt="MACRO_POPOVER_PT"
            >
              <CvMiniButton
                v-for="option in PROMPT_LLM_TOKEN_OPTIONS"
                :key="option.token"
                :label="option.label"
                class="cv-macro-button-root cv-macro-option-button"
                @pointerdown.prevent="rememberMessageSelection"
                @click.stop="selectMessageToken(option.token)"
              />
              <CvMiniButton
                label="变量"
                class="cv-macro-button-root cv-macro-option-button"
                @pointerdown.prevent="rememberMessageSelection"
                @click.stop="openVariablePicker"
              />
            </Popover>
          </div>
        </div>
        <Textarea
          v-if="editorDraft.kind === 'custom'"
          ref="messageContentTextarea"
          :model-value="editorDraft.customContent"
          class="custom-scrollbar h-48 min-h-24 w-full resize-y overflow-y-auto"
          rows="10"
          placeholder="输入消息内容..."
          @click="rememberMessageSelection"
          @focus="rememberMessageSelection"
          @keyup="rememberMessageSelection"
          @select="rememberMessageSelection"
          @update:model-value="value => updateDraftField('customContent', value ?? '')"
        />
        <Textarea
          v-else
          :model-value="editorPreviewText"
          class="custom-scrollbar h-48 min-h-24 w-full resize-y overflow-y-auto"
          rows="6"
          disabled
        />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-(--cv-space-sm)">
        <Button label="取消" text @click="closeMessageEditor" />
        <Button label="保存" icon="fa-solid fa-check" :disabled="!canSaveEditor" @click="saveMessageEditor" />
      </div>
    </template>
  </Dialog>
  <PromptVariablePickerDialog
    v-model:visible="isVariablePickerVisible"
    @insert="insertMessageToken"
  />
</template>

<script setup lang="ts">
import Popover from 'primevue/popover';
import PromptVariablePickerDialog from '@/panel/components/PromptVariablePickerDialog.vue';
import {
  getPromptLlmMessageEntryKind,
  type PromptLlmMessage,
  type PromptLlmMessageEntryKind,
  type PromptLlmMessageRole,
} from '@/constants/novelai';
import PromptEntryList from '@/panel/components/PromptEntryList.vue';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import { PROMPT_EDITOR_DIALOG_PT, PROMPT_EDITOR_DIALOG_STYLE } from '@/panel/components/prompt-editor-dialog';
import PromptLlmTriggerEditor from '@/panel/components/PromptLlmTriggerEditor.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import {
  MACRO_POPOVER_BASE_Z_INDEX,
  MACRO_POPOVER_PT,
  type MacroPopoverInstance,
  PROMPT_LLM_TOKEN_OPTIONS,
} from '@/panel/components/prompt-llm-macro-popover';
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
import { createCustomPromptLlmMessage, resolvePromptLlmSourceMessage } from '@/services/prompt-llm/message-source';
import {
  getPromptWorldbookSourceOptions,
  type PromptWorldbookGroup,
  type ResolvedPromptSourceEntry,
} from '@/services/tavern-helper/worldbook-sources';
import {
  focusTextareaAt,
  getTextareaElement,
  readTextareaInsertRange,
  replaceTextRange,
  type TextareaRef,
  type TextRange,
} from '@/panel/components/textarea-token-insert';

const ROLE_LABELS: Record<PromptLlmMessageRole, string> = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
};

/** 各角色对应的 FontAwesome 图标，用于列表中替代角色文本 */
const ROLE_ICONS: Record<PromptLlmMessageRole, string> = {
  system: 'fa-solid fa-gear',
  user: 'fa-solid fa-user',
  assistant: 'fa-solid fa-robot',
};

const ROLE_OPTIONS = [
  { label: ROLE_LABELS.system, value: 'system' },
  { label: ROLE_LABELS.user, value: 'user' },
  { label: ROLE_LABELS.assistant, value: 'assistant' },
];

const messages = defineModel<PromptLlmMessage[]>({ required: true });
const entryList = ref<InstanceType<typeof PromptEntryList> | null>(null);
const entryStatusMap = ref<Record<string, ResolvedPromptSourceEntry>>({});
const worldbookSourceOptions = ref<PromptWorldbookGroup[]>([]);
const editorDraft = ref<PromptLlmMessageEditorDraft | null>(null);
const editorPreview = ref<ResolvedPromptSourceEntry | null>(null);
const macroPopover = ref<MacroPopoverInstance | null>(null);
const messageContentTextarea = ref<TextareaRef>(null);
const messageSelectionRange = ref<TextRange | null>(null);
const isEditorVisible = ref(false);
const isVariablePickerVisible = ref(false);
const isLoadingWorldbookSources = ref(false);

let worldbookSourceRequestId = 0;
let entryStatusRequestId = 0;
let editorPreviewRequestId = 0;
let entryStatusIdleId: number | null = null;
let entryStatusTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;

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

watch(sourceMessageStatusSignature, scheduleEntryStatusRefresh, { immediate: true, flush: 'post' });
watch(
  () => isEditorVisible.value,
  visible => {
    if (visible && worldbookSourceOptions.value.length === 0) void loadWorldbookSources();
  },
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

onBeforeUnmount(cancelEntryStatusRefresh);

/**
 * 空闲时刷新来源状态，避免与列表首帧渲染争抢主线程
 */
function scheduleEntryStatusRefresh(): void {
  cancelEntryStatusRefresh();
  if ('requestIdleCallback' in window) {
    entryStatusIdleId = window.requestIdleCallback(() => void refreshEntryStatuses(), { timeout: 800 });
    return;
  }
  entryStatusTimerId = globalThis.setTimeout(() => void refreshEntryStatuses(), 80);
}

/**
 * 取消尚未执行的来源状态刷新
 */
function cancelEntryStatusRefresh(): void {
  if (entryStatusIdleId !== null) window.cancelIdleCallback(entryStatusIdleId);
  if (entryStatusTimerId !== null) globalThis.clearTimeout(entryStatusTimerId);
  entryStatusIdleId = null;
  entryStatusTimerId = null;
}

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
 * 新增默认 LLM 条目，并滚动列表到底部
 */
function addMessage(): void {
  messages.value = [...messages.value, createCustomPromptLlmMessage('user')];
  entryList.value?.scrollToEnd();
}

/**
 * 删除消息
 * @param id 消息 id
 */
function deleteMessage(id: string): void {
  const index = messages.value.findIndex(message => message.id === id);
  if (index === -1) return;
  if (editorDraft.value?.id === id) closeMessageEditor();
  messages.value = messages.value.filter(message => message.id !== id);
}

/**
 * 切换消息启用状态
 * @param message 消息条目
 */
function toggleMessageEnabled(message: PromptLlmMessage): void {
  message.enabled = !message.enabled;
}

/**
 * 打开消息编辑弹窗
 * @param message 待编辑消息
 */
function openMessageEditor(message: PromptLlmMessage): void {
  editorDraft.value = createPromptLlmMessageEditorDraft(message, worldbookSourceOptions.value);
  messageSelectionRange.value = null;
  isEditorVisible.value = true;
}

/**
 * 关闭消息编辑弹窗
 */
function closeMessageEditor(): void {
  isEditorVisible.value = false;
  editorDraft.value = null;
  editorPreview.value = null;
  messageSelectionRange.value = null;
}

/**
 * 保存消息编辑结果
 */
function saveMessageEditor(): void {
  const draft = editorDraft.value;
  if (!draft || !canSaveEditor.value) return;
  const nextMessage = buildSavedPromptLlmMessage(draft, worldbookSourceOptions.value);
  const nextMessages = messages.value.map(message =>
    message.id === draft.id ? { ...message, ...nextMessage } : message,
  );
  if (!nextMessages.some(message => message.id === draft.id)) return closeMessageEditor();
  messages.value = nextMessages;
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
 * 记录当前消息输入框选区
 */
function rememberMessageSelection(): void {
  const el = getMessageContentTextareaElement();
  if (!el) return;
  messageSelectionRange.value = { start: el.selectionStart, end: el.selectionEnd };
}

/**
 * 切换宏选择浮层
 * @param event 点击事件
 */
function toggleMacroPopover(event: Event): void {
  macroPopover.value?.toggle(event);
}

/**
 * 选择并插入消息宏
 * @param token 宏文本
 */
function selectMessageToken(token: string): void {
  insertMessageToken(token);
  macroPopover.value?.hide();
}

/**
 * 打开变量选择弹窗
 */
function openVariablePicker(): void {
  macroPopover.value?.hide();
  isVariablePickerVisible.value = true;
}

/**
 * 向自定义消息选区插入宏
 * @param token 宏文本
 */
function insertMessageToken(token: string): void {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'custom') return;
  const range = readTextareaInsertRange(
    getMessageContentTextareaElement(),
    messageSelectionRange.value,
    draft.customContent,
  );
  const nextValue = replaceTextRange(draft.customContent, range, token);
  updateDraftField('customContent', nextValue);
  focusMessageContentTextarea(range.start + token.length);
}

/**
 * 读取消息输入框原生元素
 * @returns 文本框元素
 */
function getMessageContentTextareaElement(): HTMLTextAreaElement | null {
  return getTextareaElement(messageContentTextarea.value);
}

/**
 * 恢复消息输入框焦点和光标位置
 * @param position 光标位置
 */
function focusMessageContentTextarea(position: number): void {
  focusTextareaAt(getMessageContentTextareaElement, position, range => {
    messageSelectionRange.value = range;
  });
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
 * 判断是否为来源型消息
 * @param message 消息条目
 * @returns 是否为来源型消息
 */
function isSourceMessage(message: PromptLlmMessage): boolean {
  return getPromptLlmMessageEntryKind(message) !== 'custom';
}

/**
 * 获取条目触发模式指示灯颜色
 * @param message 消息条目
 * @returns 触发模式颜色类名
 */
function getMessageTriggerToneClass(message: PromptLlmMessage): string {
  return message.triggerMatchMode === 'always' || !message.triggerMatchMode
    ? 'bg-(--p-blue-500) shadow-[0_0_6px_var(--p-blue-500)]'
    : 'bg-(--p-green-500) shadow-[0_0_6px_var(--p-green-500)]';
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
 * 判断是否需要显示来源异常状态
 * @param message 消息条目
 * @returns 是否显示状态标签
 */
function shouldShowSourceStatus(message: PromptLlmMessage): boolean {
  const status = entryStatusMap.value[message.id]?.status;
  return status !== undefined && status !== 'ready';
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
  return draft.kind === 'custom' ? '内容' : '资料预览';
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
  return (
    draft?.kind === 'worldbook_entry' &&
    isWorldbookReferenceMissing(
      worldbookSourceOptions.value,
      draft.selectedWorldbookName,
      draft.selectedWorldbookEntryUid,
    )
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
/*
  残留：列表行紧凑 Tag。
  Tag token 无 per-instance font-size/padding 细粒度；业务比全局 2xs 更紧。
  迁移条件：Aura 补 tag size variant 或包装 CvMiniTag 后迁入。
*/
.cv-status-tag-mini {
  --p-tag-font-size: 0.65rem;
  --p-tag-padding: 0.05rem 0.2rem;
}
</style>
