<template>
  <PromptEntryList
    ref="entryList"
    v-model="entries"
    empty-text="暂无人物模板条目"
    :get-role="entry => getEntryKind(entry as PromptPersonTemplateEntry)"
  >
    <template #main="{ entry }">
      <span
        class="cv-indicator size-1.5 shrink-0 rounded-full bg-(--p-primary-color) shadow-[0_0_6px_var(--p-primary-color)]"
      />
      <span
        class="whitespace-nowrap text-(length:--cv-font-size-2xs) font-semibold uppercase tracking-normal text-(--cv-on-surface-variant)"
      >{{ getEntrySourceLabel(entry as PromptPersonTemplateEntry) }}</span>
      <span
        class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-(--cv-on-surface)"
      >{{ getEntryTitle(entry as PromptPersonTemplateEntry) }}</span>
    </template>

    <template #actions="{ entry }">
      <CvMiniToggleSwitch
        v-model="entry.enabled"
        :aria-label="entry.enabled ? '禁用条目' : '启用条目'"
      />
      <CvMiniButton
        icon="fa-regular fa-pen"
        aria-label="编辑条目"
        @click="openEntryEditor(entry as PromptPersonTemplateEntry)"
      />
      <CvMiniButton
        icon="fa-regular fa-trash"
        tone="danger"
        aria-label="删除条目"
        @click="removeEntry(entry.id)"
      />
    </template>
  </PromptEntryList>
  <CvAddEntryButton label="添加条目" class="mb-0" @click="addEntry" />
  <Dialog
    v-model:visible="isEditorVisible"
    class="flex flex-col"
    modal
    dismissable-mask
    :header="editorTitle"
    :style="PROMPT_EDITOR_DIALOG_STYLE"
    :pt="entryEditorDialogPt"
    @hide="closeEntryEditor"
  >
    <div v-if="editorDraft" class="flex flex-col gap-(--cv-space-3xl)">
      <label class="cv-field">
        <span>来源</span>
        <Select
          ref="sourceSelect"
          :model-value="editorDraft.kind"
          :options="editorSourceOptions"
          option-label="label"
          option-value="value"
          placeholder="选择条目来源"
          fluid
          class="w-full"
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
          fluid
          class="w-full"
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
          fluid
          class="w-full"
          @update:model-value="updateSelectedPersonaKey"
        />
      </label>
      <div v-if="editorDraft.kind === 'character_worldbook_entry'" class="cv-field-control">
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
              :loading="isLoadingWorldbookNames"
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
              :loading="isLoadingWorldbookEntries"
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
          :model-value="editorDraft.title"
          placeholder="用于条目列表显示"
          @update:model-value="updateCustomTitle"
        />
        <InputText v-else :model-value="editorReadonlyTitle" disabled />
      </label>
      <div class="cv-field">
        <div class="cv-field-header">
          <span>{{ editorDraft.kind === 'custom' ? '内容' : '资料预览' }}</span>
          <div v-if="editorDraft.kind === 'custom'" class="flex items-center gap-(--cv-space-xs) text-(length:--cv-font-size-2xs)">
            <CvMiniButton
              label="插入宏"
              class="cv-macro-button-root cv-macro-trigger-button"
              @pointerdown.prevent="rememberEntrySelection"
              @click.stop="toggleMacroPopover"
            />
            <Popover
              ref="macroPopover"
              :base-z-index="MACRO_POPOVER_BASE_Z_INDEX"
              :pt="MACRO_POPOVER_PT"
            >
              <CvMiniButton
                v-for="option in PROMPT_PERSON_TOKEN_OPTIONS"
                :key="option.token"
                :label="option.label"
                class="cv-macro-button-root cv-macro-option-button"
                @pointerdown.prevent="rememberEntrySelection"
                @click.stop="selectEntryToken(option.token)"
              />
            </Popover>
          </div>
        </div>
        <Textarea
          v-if="editorDraft.kind === 'custom'"
          ref="entryContentTextarea"
          :model-value="editorDraft.content"
          rows="10"
          class="custom-scrollbar h-48 min-h-24 w-full resize-y overflow-y-auto"
          placeholder="输入模板内容..."
          @click="rememberEntrySelection"
          @focus="rememberEntrySelection"
          @keyup="rememberEntrySelection"
          @select="rememberEntrySelection"
          @update:model-value="updateCustomContent"
        />
        <Textarea
          v-else
          :model-value="editorPreviewPlaceholder ?? editorPreviewText"
          rows="6"
          disabled
          class="custom-scrollbar h-48 min-h-24 w-full resize-y overflow-y-auto"
        />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-(--cv-space-sm)">
        <Button label="取消" text @click="closeEntryEditor" />
        <Button label="保存" icon="fa-solid fa-check" :disabled="!canSaveEditor" @click="saveEntryEditor" />
      </div>
    </template>
  </Dialog>
</template>
<script setup lang="ts">
import Popover from 'primevue/popover';
import {
  type PromptPersonKind,
  type PromptPersonTemplateEntry,
  type PromptPersonTemplateEntryKind,
} from '@/constants/novelai';
import PromptEntryList from '@/panel/components/PromptEntryList.vue';
import { createCustomPromptPersonTemplateEntry } from '@/services/prompt-profiles/runtime';
import { PROMPT_EDITOR_DIALOG_PT, PROMPT_EDITOR_DIALOG_STYLE } from '@/panel/components/prompt-editor-dialog';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import {
  MACRO_POPOVER_BASE_Z_INDEX,
  MACRO_POPOVER_PT,
  type MacroPopoverInstance,
  PROMPT_PERSON_TOKEN_OPTIONS,
} from '@/panel/components/prompt-llm-macro-popover';
import {
  applySourceDefaults as applyEditorSourceDefaults,
  buildSavedPromptSourceEntry,
  buildSourceOptions,
  buildTextSelectOptions,
  canSaveSourceEditor,
  createSourceEditorDraft,
  getSourceEditorPreviewPlaceholder,
  syncDraftEntryFields as syncEditorDraftEntryFields,
  type PromptSourceEditorDraft,
} from '@/panel/components/prompt-source-entry-editor';
import {
  buildWorldbookEntryOptions,
  buildWorldbookNameOptions,
  getWorldbookReferenceDisplayTitle,
  isWorldbookReferenceMissing,
} from '@/panel/components/prompt-worldbook-source';
import {
  getPromptPersonCharacterNames,
  getPromptPersonUserPersonaNames,
  resolvePromptPersonTemplateEntry,
  type ResolvedPromptPersonTemplateEntry,
} from '@/services/tavern-helper/prompt-profiles-sources';
import {
  getPromptWorldbookNames,
  getPromptWorldbookSourceEntries,
  type PromptWorldbookGroup,
} from '@/services/tavern-helper/worldbook-sources';
import {
  focusTextareaAt,
  getTextareaElement,
  readTextareaInsertRange,
  replaceTextRange,
  type TextareaRef,
  type TextRange,
} from '@/panel/components/textarea-token-insert';
import {
  getPromptSourceEntryKind,
  getPromptSourceEntryLabel,
  getPromptSourceEntryTitle,
  getPromptSourcePreviewText,
} from '@/panel/components/prompt-source-entry-display';
import { mockEntryEditorRequested } from '@/panel/components/onboarding/mock-person';

const props = withDefaults(
  defineProps<{
    kind: PromptPersonKind;
    characterName?: string;
    userPersonaKey?: string;
    /** 教程演示目标：为 true 时响应教程请求真实打开条目编辑弹窗 */
    tutorialTarget?: boolean;
  }>(),
  {
    characterName: '',
    userPersonaKey: '',
    tutorialTarget: false,
  },
);

const entries = defineModel<PromptPersonTemplateEntry[]>({ required: true });
const entryList = ref<InstanceType<typeof PromptEntryList> | null>(null);
const sourceSelect = ref<{ show?: (isFocus?: boolean) => void } | null>(null);
const worldbookNames = ref<string[]>([]);
const worldbookSourceOptions = ref<PromptWorldbookGroup[]>([]);
const editorDraft = ref<PromptSourceEditorDraft | null>(null);
const editorPreview = ref<ResolvedPromptPersonTemplateEntry | null>(null);
const macroPopover = ref<MacroPopoverInstance | null>(null);
const entryContentTextarea = ref<TextareaRef>(null);
const entrySelectionRange = ref<TextRange | null>(null);
const isEditorVisible = ref(false);
const isLoadingWorldbookNames = ref(false);
const isLoadingWorldbookEntries = ref(false);

let worldbookEntryRequestId = 0;
let editorPreviewRequestId = 0;
let loadedWorldbookName = '';
const editorSourceOptions = computed(() => buildSourceOptions(props.kind, editorDraft.value?.kind));
const characterOptions = computed(() =>
  buildTextSelectOptions([...getPromptPersonCharacterNames(), props.characterName]),
);
const personaOptions = computed(() =>
  buildTextSelectOptions([...getPromptPersonUserPersonaNames(), props.userPersonaKey]),
);
const worldbookOptions = computed(() =>
  buildWorldbookNameOptions(worldbookNames.value, editorDraft.value?.selectedWorldbookName ?? ''),
);
const worldbookEntryOptions = computed(() =>
  buildWorldbookEntryOptions(
    worldbookSourceOptions.value,
    editorDraft.value?.selectedWorldbookName ?? '',
    editorDraft.value?.selectedWorldbookEntryUid ?? null,
  ),
);
const canSaveEditor = computed(() => {
  const draft = editorDraft.value;
  return Boolean(draft && canSaveSourceEditor(draft));
});
const editorTitle = computed(() => {
  if (!editorDraft.value) return '编辑人物模板条目';
  return `编辑 ${getPromptSourceEntryTitle(editorDraft.value)}`;
});
const editorPreviewText = computed(() => getPromptSourcePreviewText(editorPreview.value));
const editorPreviewPlaceholder = computed(() => getSourceEditorPreviewPlaceholder(editorDraft.value));
const editorReadonlyTitle = computed(() => getEditorReadonlyTitle(editorDraft.value));
/** 弹窗 PT：教程目标实例在根节点附加高亮标记，供教程遮罩定位 */
const entryEditorDialogPt = computed(() => {
  if (!props.tutorialTarget) return PROMPT_EDITOR_DIALOG_PT;
  return {
    ...PROMPT_EDITOR_DIALOG_PT,
    root: { 'data-cv-tutorial': 'prompt-profiles-entry-editor' },
  };
});

// 教程请求时真实打开首个条目的编辑弹窗，并展开来源下拉；请求结束后关闭
watch(
  () => props.tutorialTarget && mockEntryEditorRequested.value,
  requested => {
    if (requested) openTutorialEntryEditor();
    else if (props.tutorialTarget && isEditorVisible.value) closeEntryEditor();
  },
  { immediate: true },
);

/**
 * 教程演示：打开首个条目编辑弹窗并展开来源下拉
 */
function openTutorialEntryEditor(): void {
  const entry = entries.value[0];
  if (!entry || isEditorVisible.value) return;
  openEntryEditor(entry);
  // 等待弹窗渲染后展开来源下拉，展示可选项
  nextTick(() => setTimeout(() => sourceSelect.value?.show?.(), 150));
}

watch(
  () => [isEditorVisible.value, editorDraft.value?.kind ?? ''] as const,
  ([visible, kind]) => {
    if (visible && kind === 'character_worldbook_entry') {
      loadWorldbookNames();
    }
  },
);
watch(
  () => [isEditorVisible.value, editorDraft.value?.kind ?? '', editorDraft.value?.selectedWorldbookName ?? ''] as const,
  ([visible, kind, worldbookName]) => {
    if (visible && kind === 'character_worldbook_entry' && worldbookName.trim()) {
      void loadWorldbookEntries(worldbookName);
      return;
    }
    clearWorldbookEntries();
  },
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
 * 加载世界书名称
 */
function loadWorldbookNames(): void {
  if (worldbookNames.value.length > 0) return;
  isLoadingWorldbookNames.value = true;
  try {
    worldbookNames.value = getPromptWorldbookNames();
  } catch (error) {
    console.error('[CosmosVision] PromptSourceEntryList:', error);
  } finally {
    isLoadingWorldbookNames.value = false;
  }
}

/**
 * 加载当前选择世界书的条目
 * @param worldbookName 世界书名称
 */
async function loadWorldbookEntries(worldbookName: string): Promise<void> {
  clearWorldbookEntries();
  const requestId = ++worldbookEntryRequestId;
  isLoadingWorldbookEntries.value = true;
  try {
    const entries = await getPromptWorldbookSourceEntries(worldbookName);
    if (requestId !== worldbookEntryRequestId) {
      return;
    }
    worldbookSourceOptions.value = [{ worldbookName, entries }];
    loadedWorldbookName = worldbookName;
    const draft = editorDraft.value;
    if (draft?.selectedWorldbookName === worldbookName) syncDraftEntryFields(draft);
  } catch (error) {
    if (requestId === worldbookEntryRequestId) {
      loadedWorldbookName = worldbookName;
      console.error('[CosmosVision] PromptSourceEntryList:', error);
      toastr.warning('世界书条目读取失败，请稍后重试');
    }
  } finally {
    if (requestId === worldbookEntryRequestId) isLoadingWorldbookEntries.value = false;
  }
}

/**
 * 清空当前世界书条目缓存
 */
function clearWorldbookEntries(): void {
  worldbookEntryRequestId++;
  worldbookSourceOptions.value = [];
  loadedWorldbookName = '';
}

/**
 * 删除模板条目
 * @param id 条目 ID
 */
function removeEntry(id: string): void {
  entries.value = entries.value.filter(entry => entry.id !== id);
  if (editorDraft.value?.id === id) closeEntryEditor();
}

/**
 * 新增默认空自定义条目，并滚动列表到底部，内容由用户手动填写
 */
function addEntry(): void {
  entries.value = [...entries.value, createCustomPromptPersonTemplateEntry()];
  entryList.value?.scrollToEnd();
}

/**
 * 打开模板条目编辑弹窗
 * @param entry 模板条目
 */
function openEntryEditor(entry: PromptPersonTemplateEntry): void {
  editorDraft.value = createEditorDraft(entry);
  entrySelectionRange.value = null;
  isEditorVisible.value = true;
}

/**
 * 关闭模板条目编辑弹窗
 */
function closeEntryEditor(): void {
  isEditorVisible.value = false;
  editorDraft.value = null;
  editorPreview.value = null;
  entrySelectionRange.value = null;
}

/**
 * 保存模板条目编辑结果
 */
function saveEntryEditor(): void {
  const draft = editorDraft.value;
  if (!draft || !canSaveEditor.value) return;
  const nextEntry = buildSavedEntry(draft);
  if (!entries.value.some(entry => entry.id === draft.id)) return closeEntryEditor();
  entries.value = entries.value.map(entry => (entry.id === draft.id ? { ...entry, ...nextEntry } : entry));
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
  draft.selectedWorldbookEntryUid = null;
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
 * 记录当前条目输入框选区
 */
function rememberEntrySelection(): void {
  const el = getEntryContentTextareaElement();
  if (!el) return;
  entrySelectionRange.value = { start: el.selectionStart, end: el.selectionEnd };
}

/**
 * 切换宏选择浮层
 * @param event 点击事件
 */
function toggleMacroPopover(event: Event): void {
  macroPopover.value?.toggle(event);
}

/**
 * 选择并插入人物模板宏
 * @param token 占位符文本
 */
function selectEntryToken(token: string): void {
  insertToken(token);
  macroPopover.value?.hide();
}

/**
 * 向自定义条目选区插入占位符
 * @param token 占位符文本
 */
function insertToken(token: string): void {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'custom') return;
  const range = readTextareaInsertRange(getEntryContentTextareaElement(), entrySelectionRange.value, draft.customContent);
  updateCustomContent(replaceTextRange(draft.customContent, range, token));
  focusEntryContentTextarea(range.start + token.length);
}

/**
 * 读取条目输入框原生元素
 * @returns 文本框元素
 */
function getEntryContentTextareaElement(): HTMLTextAreaElement | null {
  return getTextareaElement(entryContentTextarea.value);
}

/**
 * 恢复条目输入框焦点和光标位置
 * @param position 光标位置
 */
function focusEntryContentTextarea(position: number): void {
  focusTextareaAt(getEntryContentTextareaElement, position, range => {
    entrySelectionRange.value = range;
  });
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
  if (getSourceEditorPreviewPlaceholder(draft)) {
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
    editorPreview.value = { status: 'missing', title: getPromptSourceEntryTitle(draft), content: '' };
  }
}

/**
 * 获取条目来源显示
 * @param entry 模板条目
 * @returns 来源标签
 */
function getEntrySourceLabel(entry: PromptPersonTemplateEntry): string {
  return getPromptSourceEntryLabel(entry);
}

/**
 * 获取条目标题
 * @param entry 模板条目
 * @returns 列表标题
 */
function getEntryTitle(entry: PromptPersonTemplateEntry): string {
  return getPromptSourceEntryTitle(entry);
}

/**
 * 获取条目类型
 * @param entry 模板条目
 * @returns 条目类型
 */
function getEntryKind(entry: PromptPersonTemplateEntry): PromptPersonTemplateEntryKind {
  return getPromptSourceEntryKind(entry);
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
 * 判断编辑中的世界书引用是否已失效
 * @returns 是否失效
 */
function isEditorWorldbookReferenceMissing(): boolean {
  const draft = editorDraft.value;
  if (!draft || draft.kind !== 'character_worldbook_entry') return false;
  if (isLoadingWorldbookEntries.value || loadedWorldbookName !== draft.selectedWorldbookName) return false;
  return isWorldbookReferenceMissing(
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
function getEditorReadonlyTitle(draft: PromptSourceEditorDraft | null): string {
  if (!draft) return '';
  if (draft.kind !== 'character_worldbook_entry') return draft.title;
  return getWorldbookReferenceDisplayTitle(draft.title, isEditorWorldbookReferenceMissing());
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
