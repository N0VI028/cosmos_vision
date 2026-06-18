<template>
  <PromptEntryList
    v-model="entries"
    empty-text="暂无人物模板条目"
    :get-role="entry => getEntryKind(entry as PromptPersonTemplateEntry)"
  >
    <template #main="{ entry }">
      <span class="cv-source-indicator cv-indicator" />
      <span class="cv-source-kind">{{ getEntrySourceLabel(entry as PromptPersonTemplateEntry) }}</span>
      <span class="cv-source-title">{{ getEntryTitle(entry as PromptPersonTemplateEntry) }}</span>
      <Tag
        v-if="!isCustomEntry(entry as PromptPersonTemplateEntry) && !isEntryStatusReady(entry as PromptPersonTemplateEntry)"
        class="cv-status-tag-mini"
        :value="getEntryStatusText(entry as PromptPersonTemplateEntry)"
        :severity="getEntryStatusSeverity(entry as PromptPersonTemplateEntry)"
      />
    </template>

    <template #actions="{ entry }">
      <ToggleSwitch v-model="entry.enabled" class="cv-source-toggle" />
      <Button
        icon="fa-solid fa-pen"
        class="cv-source-edit-btn"
        text
        size="small"
        @click="openEntryEditor(entry as PromptPersonTemplateEntry)"
      />
      <Button icon="fa-solid fa-trash" severity="danger" text size="small" @click="removeEntry(entry.id)" />
    </template>
  </PromptEntryList>
  <button type="button" class="cv-add-entry-btn-flat-wide" @click="openNewEntryEditor">
    <i class="fa-solid fa-plus" /> 添加条目
  </button>
  <Dialog
    v-model:visible="isEditorVisible"
    class="cv-message-editor-dialog"
    modal
    dismissable-mask
    :header="editorTitle"
    :style="editorDialogStyle"
    :pt="MESSAGE_EDITOR_DIALOG_PT"
    @hide="closeEntryEditor"
  >
    <div v-if="editorDraft" class="cv-message-editor">
      <label class="cv-field">
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
      <label v-if="editorDraft.kind === 'character_description'" class="cv-field">
        <span>角色卡</span>
        <Select
          :model-value="editorDraft.selectedCharacterName"
          :options="characterOptions"
          option-label="label"
          option-value="value"
          placeholder="选择角色卡"
          class="cv-source-select"
          @update:model-value="updateSelectedCharacterName"
        />
      </label>
      <label v-if="editorDraft.kind === 'user_persona'" class="cv-field">
        <span>用户人设</span>
        <Select
          :model-value="editorDraft.selectedPersonaKey"
          :options="personaOptions"
          option-label="label"
          option-value="value"
          placeholder="选择用户人设"
          class="cv-source-select"
          @update:model-value="updateSelectedPersonaKey"
        />
      </label>
      <div v-if="editorDraft.kind === 'character_worldbook_entry'" class="cv-source-pair-row">
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
      <label class="cv-field">
          <span>条目名称</span>
        <InputText
          v-if="editorDraft.kind === 'custom'"
          :model-value="editorDraft.title"
          placeholder="用于条目列表显示"
          @update:model-value="updateCustomTitle"
        />
        <InputText v-else :model-value="editorDraft.title" disabled />
      </label>
      <label class="cv-field cv-message-editor-content-field">
        <div class="cv-field-header">
          <span>{{ editorDraft.kind === 'custom' ? '内容' : '资料预览' }}</span>
          <div v-if="editorDraft.kind === 'custom'" class="cv-source-tokens" @click.prevent>
            <span class="cv-token-label">插入：</span>
            <button type="button" class="cv-token-btn" @click="insertToken(triggerToken)">关键词</button>
            <button type="button" class="cv-token-btn" @click="insertToken(fixedTagsToken)">固定 tag</button>
          </div>
        </div>
        <Textarea
          v-if="editorDraft.kind === 'custom'"
          :model-value="editorDraft.content"
          rows="10"
          class="cv-message-editor-textarea custom-scrollbar"
          placeholder="输入模板内容..."
          @update:model-value="updateCustomContent"
        />
        <Textarea
          v-else
          :model-value="editorPreviewText"
          rows="6"
          disabled
          class="cv-message-editor-textarea custom-scrollbar"
        />
      </label>
    </div>
    <template #footer>
      <div class="cv-message-editor-actions">
        <Button label="取消" text @click="closeEntryEditor" />
        <Button label="保存" icon="fa-solid fa-check" :disabled="!canSaveEditor" @click="saveEntryEditor" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { PROMPT_LLM_FIXED_TAGS_TOKEN, PROMPT_LLM_TRIGGER_NAMES_TOKEN } from '@/constants/default-settings';
import {
  getPromptPersonTemplateEntryKind,
  PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS,
  type PromptPersonKind,
  type PromptPersonTemplateEntry,
  type PromptPersonTemplateEntryKind,
} from '@/constants/novelai';
import PromptEntryList from '@/panel/components/PromptEntryList.vue';
import {
  applySourceDefaults as applyEditorSourceDefaults,
  buildSavedPromptSourceEntry,
  buildSourceOptions,
  buildTextSelectOptions,
  buildWorldbookEntryOptions,
  buildWorldbookOptions,
  canSaveSourceEditor,
  createSourceEditorDraft,
  pickWorldbookEntryUid,
  syncDraftEntryFields as syncEditorDraftEntryFields,
  type PromptSourceEditorDraft,
} from '@/panel/components/prompt-source-entry-editor';
import {
  getPromptPersonCharacterNames,
  getPromptPersonUserPersonaNames,
  type PromptPersonWorldbookGroup,
  getPromptPersonWorldbookSourceOptions,
  resolvePromptPersonTemplateEntry,
  type ResolvedPromptPersonTemplateEntry,
} from '@/services/tavern-helper/prompt-profiles-sources';

const props = withDefaults(
  defineProps<{
    kind: PromptPersonKind;
    characterName?: string;
    userPersonaKey?: string;
  }>(),
  {
    characterName: '',
    userPersonaKey: '',
  },
);

const entries = defineModel<PromptPersonTemplateEntry[]>({ required: true });
const entryStatusMap = ref<Record<string, ResolvedPromptPersonTemplateEntry>>({});
const worldbookSourceOptions = ref<PromptPersonWorldbookGroup[]>([]);
const editorDraft = ref<PromptSourceEditorDraft | null>(null);
const editorPreview = ref<ResolvedPromptPersonTemplateEntry | null>(null);
const isCreatingEntry = ref(false);
const isEditorVisible = ref(false);
const isLoadingWorldbookSources = ref(false);
const triggerToken = PROMPT_LLM_TRIGGER_NAMES_TOKEN;
const fixedTagsToken = PROMPT_LLM_FIXED_TAGS_TOKEN;
const editorDialogStyle = {
  width: '42rem',
  maxHeight: 'min(42rem, calc(100dvh - 2rem))',
  maxWidth: 'calc(100vw - 2rem)',
} as const;
const MESSAGE_EDITOR_DIALOG_PT = {
  content: { style: { display: 'flex', flexDirection: 'column', overflowY: 'auto' } },
} as const;

let worldbookSourceRequestId = 0;
let entryStatusRequestId = 0;
let editorPreviewRequestId = 0;

const editorSourceOptions = computed(() => buildSourceOptions(props.kind, editorDraft.value?.kind));
const characterOptions = computed(() =>
  buildTextSelectOptions([...getPromptPersonCharacterNames(), props.characterName]),
);
const personaOptions = computed(() =>
  buildTextSelectOptions([...getPromptPersonUserPersonaNames(), props.userPersonaKey]),
);
const worldbookOptions = computed(() => buildWorldbookOptions(worldbookSourceOptions.value));
const worldbookEntryOptions = computed(() =>
  buildWorldbookEntryOptions(worldbookSourceOptions.value, editorDraft.value?.selectedWorldbookName ?? ''),
);
const canSaveEditor = computed(() => {
  const draft = editorDraft.value;
  return Boolean(draft && canSaveSourceEditor(draft));
});
const editorTitle = computed(() => {
  if (isCreatingEntry.value) return '新增人物模板条目';
  if (!editorDraft.value) return '编辑人物模板条目';
  return `编辑 ${getEntryTitle(editorDraft.value)}`;
});
const editorPreviewText = computed(() => getResolvedPreviewText(editorPreview.value));

watch(entries, refreshEntryStatuses, { deep: true, immediate: true });
watch(
  () => isEditorVisible.value,
  visible => {
    if (visible || worldbookSourceOptions.value.length === 0) {
      void loadWorldbookSources();
    }
  },
  { immediate: true },
);
watch(
  () =>
    [
      isEditorVisible.value,
      editorDraft.value?.kind ?? '',
      editorDraft.value?.selectedCharacterName ?? '',
      editorDraft.value?.selectedPersonaKey ?? '',
      editorDraft.value?.selectedWorldbookName ?? '',
      editorDraft.value?.selectedWorldbookEntryUid ?? null,
    ] as const,
  refreshEditorPreview,
);

/**
 * 刷新外部资料条目状态
 */
async function refreshEntryStatuses(): Promise<void> {
  const requestId = ++entryStatusRequestId;
  const statusEntries = await Promise.all(
    entries.value
      .filter(entry => !isCustomEntry(entry))
      .map(async entry => [entry.id, await resolvePromptPersonTemplateEntry(entry)] as const),
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
    const options = await getPromptPersonWorldbookSourceOptions();
    if (requestId !== worldbookSourceRequestId) return;
    worldbookSourceOptions.value = options;
    reconcileEditorSourceDefaults();
  } catch (error) {
    console.error('[PromptSourceEntryList]', error);
    toastr.warning('世界书读取失败，仍可创建其他条目');
  } finally {
    if (requestId === worldbookSourceRequestId) isLoadingWorldbookSources.value = false;
  }
}

/**
 * 删除模板条目
 * @param id 条目 ID
 */
function removeEntry(id: string): void {
  const index = entries.value.findIndex(entry => entry.id === id);
  if (index !== -1) entries.value.splice(index, 1);
  if (editorDraft.value?.id === id) closeEntryEditor();
}

/**
 * 打开新建模板条目弹窗
 */
function openNewEntryEditor(): void {
  isCreatingEntry.value = true;
  editorDraft.value = createEditorDraft();
  isEditorVisible.value = true;
}

/**
 * 打开模板条目编辑弹窗
 * @param entry 模板条目
 */
function openEntryEditor(entry: PromptPersonTemplateEntry): void {
  isCreatingEntry.value = false;
  editorDraft.value = createEditorDraft(entry);
  isEditorVisible.value = true;
}

/**
 * 关闭模板条目编辑弹窗
 */
function closeEntryEditor(): void {
  isCreatingEntry.value = false;
  isEditorVisible.value = false;
  editorDraft.value = null;
  editorPreview.value = null;
}

/**
 * 保存模板条目编辑结果
 */
function saveEntryEditor(): void {
  const draft = editorDraft.value;
  if (!draft || !canSaveEditor.value) return;
  const nextEntry = buildSavedEntry(draft);
  const index = entries.value.findIndex(item => item.id === draft.id);
  if (index === -1) {
    entries.value.push(nextEntry);
    return closeEntryEditor();
  }
  Object.assign(entries.value[index], nextEntry);
  closeEntryEditor();
}

/**
 * 切换编辑弹窗来源
 * @param source 来源类型
 */
function updateEditorSource(source: PromptPersonTemplateEntryKind): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft.kind = source;
  applySourceDefaults(draft);
  syncDraftEntryFields(draft);
}

/**
 * 更新角色卡选择
 * @param characterName 角色卡名称
 */
function updateSelectedCharacterName(characterName: string): void {
  updateDraftSelection('selectedCharacterName', characterName);
}

/**
 * 更新用户人设 选择
 * @param personaKey persona key
 */
function updateSelectedPersonaKey(personaKey: string): void {
  updateDraftSelection('selectedPersonaKey', personaKey);
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
  syncDraftEntryFields(draft);
}

/**
 * 更新世界书条目选择
 * @param entryUid 条目 uid
 */
function updateSelectedWorldbookEntryUid(entryUid: number | null): void {
  updateDraftSelection('selectedWorldbookEntryUid', entryUid);
}

/**
 * 更新自定义条目标题
 * @param title 条目标题
 */
function updateCustomTitle(title: string | undefined): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft.customTitle = title ?? '';
  draft.title = title ?? '';
}

/**
 * 更新自定义条目内容
 * @param content 条目内容
 */
function updateCustomContent(content: string | undefined): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft.customContent = content ?? '';
  draft.content = content ?? '';
}

/**
 * 向自定义条目末尾插入占位符
 * @param token 占位符文本
 */
function insertToken(token: string): void {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'custom') return;
  const separator = draft.customContent && !draft.customContent.endsWith(' ') ? ' ' : '';
  updateCustomContent(`${draft.customContent}${separator}${token}`);
}

/**
 * 刷新当前弹窗资料预览
 */
async function refreshEditorPreview(): Promise<void> {
  const draft = editorDraft.value;
  if (!isEditorVisible.value || !draft || draft.kind === 'custom') {
    editorPreview.value = null;
    return;
  }
  const requestId = ++editorPreviewRequestId;
  try {
    const resolved = await resolvePromptPersonTemplateEntry(buildSavedEntry(draft));
    if (requestId !== editorPreviewRequestId) return;
    editorPreview.value = resolved;
  } catch {
    if (requestId !== editorPreviewRequestId) return;
    editorPreview.value = { status: 'missing', title: getEntryTitle(draft), content: '' };
  }
}

/**
 * 判断外部资料是否处于可用状态
 * @param entry 模板条目
 * @returns 是否可用
 */
function isEntryStatusReady(entry: PromptPersonTemplateEntry): boolean {
  return (entryStatusMap.value[entry.id]?.status ?? 'missing') === 'ready';
}

/**
 * 获取外部资料状态文案
 * @param entry 模板条目
 * @returns 状态文案
 */
function getEntryStatusText(entry: PromptPersonTemplateEntry): string {
  const status = entryStatusMap.value[entry.id]?.status ?? 'missing';
  if (status === 'ready') return '可用';
  if (status === 'unsupported') return '未接入';
  return '来源失效';
}

/**
 * 获取外部资料状态颜色
 * @param entry 模板条目
 * @returns PrimeVue Tag severity
 */
function getEntryStatusSeverity(entry: PromptPersonTemplateEntry): 'success' | 'warn' | 'danger' {
  const status = entryStatusMap.value[entry.id]?.status ?? 'missing';
  if (status === 'ready') return 'success';
  if (status === 'unsupported') return 'warn';
  return 'danger';
}

/**
 * 获取条目来源显示
 * @param entry 模板条目
 * @returns 来源标签
 */
function getEntrySourceLabel(entry: PromptPersonTemplateEntry): string {
  return PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS[getEntryKind(entry)] ?? '外部资料';
}

/**
 * 获取条目标题
 * @param entry 模板条目
 * @returns 列表标题
 */
function getEntryTitle(entry: PromptPersonTemplateEntry): string {
  const title = entry.title.trim();
  if (title) return title;
  const content = entry.content.trim().replace(/\s+/g, ' ');
  if (!content) return '未命名条目';
  return content.length > 30 ? `${content.slice(0, 30)}...` : content;
}

/**
 * 获取解析结果的预览文本
 * @param resolved 解析结果
 * @returns 预览文本
 */
function getResolvedPreviewText(resolved: ResolvedPromptPersonTemplateEntry | null): string {
  if (!resolved) return '正在读取资料...';
  if (resolved.status === 'ready') return resolved.content;
  if (resolved.status === 'unsupported') return '该资料来源本期仅保留占位';
  return '来源失效，运行时会跳过该条目';
}

/**
 * 获取条目类型
 * @param entry 模板条目
 * @returns 条目类型
 */
function getEntryKind(entry: PromptPersonTemplateEntry): PromptPersonTemplateEntryKind {
  return getPromptPersonTemplateEntryKind(entry);
}

/**
 * 判断是否为自定义条目
 * @param entry 模板条目
 * @returns 是否为自定义条目
 */
function isCustomEntry(entry: PromptPersonTemplateEntry): boolean {
  return getEntryKind(entry) === 'custom';
}

/**
 * 创建模板条目编辑草稿
 * @param entry 现有模板条目
 * @returns 编辑草稿
 */
function createEditorDraft(entry?: PromptPersonTemplateEntry): PromptSourceEditorDraft {
  return createSourceEditorDraft(
    entry,
    {
      characterName: props.characterName,
      personaKey: props.userPersonaKey,
    },
    worldbookSourceOptions.value,
  );
}

/**
 * 构建当前草稿的保存结果
 * @param draft 编辑草稿
 * @returns 可写回列表的模板条目
 */
function buildSavedEntry(draft: PromptSourceEditorDraft): PromptPersonTemplateEntry {
  return buildSavedPromptSourceEntry(draft, worldbookSourceOptions.value);
}

/**
 * 同步草稿派生字段
 * @param draft 编辑草稿
 */
function syncDraftEntryFields(draft: PromptSourceEditorDraft): void {
  syncEditorDraftEntryFields(draft, worldbookSourceOptions.value);
}

/**
 * 补齐当前来源默认选择
 * @param draft 编辑草稿
 */
function applySourceDefaults(draft: PromptSourceEditorDraft): void {
  applyEditorSourceDefaults(
    draft,
    {
      characterOptions: characterOptions.value,
      personaOptions: personaOptions.value,
    },
    worldbookSourceOptions.value,
  );
}

/**
 * 世界书加载后补齐弹窗默认值
 */
function reconcileEditorSourceDefaults(): void {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'character_worldbook_entry') return;
  applySourceDefaults(draft);
  syncDraftEntryFields(draft);
}

/**
 * 更新草稿选择值
 * @param key 草稿字段
 * @param value 字段值
 */
function updateDraftSelection<TKey extends keyof PromptSourceEditorDraft>(
  key: TKey,
  value: PromptSourceEditorDraft[TKey],
): void {
  const draft = editorDraft.value;
  if (!draft) return;
  draft[key] = value;
  syncDraftEntryFields(draft);
}
</script>

<style scoped>
.cv-add-entry-btn-flat-wide {
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
}

.cv-add-entry-btn-flat-wide:hover {
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  border-color: var(--cv-outline);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 10%, transparent);
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

.cv-source-title {
  min-width: 0;
  overflow: hidden;
  color: var(--cv-on-surface);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-source-kind {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.75);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0;
  white-space: nowrap;
}

.cv-source-toggle {
  flex-shrink: 0;
  margin-right: 0;
  transform: scale(0.7);
}

.cv-source-edit-btn {
  color: color-mix(in srgb, var(--cv-on-surface) 60%, transparent) !important;
}

.cv-source-edit-btn:hover {
  background: var(--cv-surface-container-high) !important;
  color: var(--cv-on-surface) !important;
}

.cv-source-indicator {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color);
  box-shadow: 0 0 6px var(--p-primary-color);
}

.cv-status-tag-mini {
  font-size: 0.65rem !important;
  padding: 0.05rem 0.2rem !important;
  height: auto !important;
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

.cv-message-editor-content-field {
  display: flex;
  flex-direction: column;
}

@media (max-width: 520px) {
  .cv-source-pair-row {
    grid-template-columns: 1fr;
  }
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
