<template>
  <div class="cv-tab-content cv-profiles-tab">
    <div class="cv-profiles-layout">
      <Button
        label="新建人物"
        icon="fa-solid fa-user-plus"
        outlined
        size="small"
        class="w-full"
        @click="createBlankPerson"
      />

      <div v-if="filteredProfiles.length > 0" class="cv-person-panel-list">
        <CollapsiblePanelItem
          v-for="person in filteredProfiles"
          :key="person.id"
          :title="person.name || '未命名人物'"
          :collapsed="person.id !== activePersonId"
          :disabled="person.enabled === false"
          @toggle="togglePerson(person.id)"
        >
          <template #title>
            <template v-if="editingPersonId === person.id">
              <InputText
                v-model="editingDraft"
                class="cv-person-item__name-input"
                size="small"
                autofocus
                @click.stop
                @keydown.enter="finishEditing(person)"
                @keydown.esc="finishEditing(person)"
              />
              <CvMiniButton
                icon="fa-solid fa-check"
                size="small"
                aria-label="完成"
                @click.stop="finishEditing(person)"
              />
            </template>
            <template v-else>
              <span
                class="block min-w-0 flex-[0_1_auto] overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-(--cv-on-surface)"
              >
                {{ person.name || '未命名人物' }}
              </span>
              <CvMiniButton
                icon="fa-solid fa-pen"
                size="small"
                aria-label="重命名"
                @click.stop="toggleEditing(person)"
              />
            </template>
          </template>

          <template #actions>
            <ToggleSwitch
              v-model="person.enabled"
              :aria-label="getPersonEnabledLabel(person)"
              :dt="{ width: '2rem', height: '1.2rem', handle: { size: '0.8rem' } }"
            />
            <CvMiniButton
              icon="fa-solid fa-trash"
              size="small"
              tone="danger"
              aria-label="删除人物"
              @click="deletePerson(person)"
            />
          </template>

          <section class="cv-person-editor">
            <label class="cv-field">
              <span>触发模式</span>
              <Select
                v-model="person.insertMode"
                :options="INSERT_MODE_OPTIONS"
                option-label="label"
                option-value="value"
              />
            </label>

            <h3 class="cv-person-section-title">关键词</h3>
            <div class="cv-field">
              <div class="cv-field-control">
                <InputTags
                  v-model="person.triggerKeywords"
                  :allow-duplicate="false"
                  add-on-blur
                  delimiter=","
                  class="cv-trigger-inputchips"
                />
                <div class="cv-field-hint">输入关键词，回车或逗号添加</div>
              </div>
            </div>

            <div class="cv-person-section-header">
              <h3 class="cv-person-section-title">固定 tag</h3>
              <Button
                label="从资料解析"
                icon="fa-solid fa-dice-d20"
                class="cv-parse-tags-btn"
                text
                size="small"
                :loading="isParsingTags && person.id === parsingPersonId"
                @click="openParseTagsDialog(person)"
              />
            </div>
            <div class="cv-field">
              <div class="cv-field-control">
                <Textarea v-model="person.staticTags" rows="3" auto-resize class="cv-full-textarea" />
                <div class="cv-field-hint">固定tag中的内容将在发送到LLM时，被强调原样保留在最终tag中</div>
              </div>
            </div>

            <h3 class="cv-person-section-title">人物模板条目</h3>
            <PromptSourceEntryList
              v-model="person.templateEntries"
              :kind="person.kind"
              :character-name="getSelectedCharacterName(person)"
              :user-persona-key="getSelectedUserPersonaKey(person)"
            />
          </section>
        </CollapsiblePanelItem>
      </div>

      <section v-else class="cv-person-empty-panel">
        <i class="fa-solid fa-user-gear" />
        <span>请创建一个人物设置</span>
      </section>
    </div>
  </div>

  <Dialog
    v-model:visible="isTagParseDialogVisible"
    class="cv-tag-parse-dialog"
    modal
    :draggable="false"
    header="从资料解析固定 tag"
    :style="tagParseDialogStyle"
    @hide="closeParseTagsDialog"
  >
    <StaticTagsDraftResult
      v-if="tagParseDraft"
      v-model:draft="tagParseDraft"
      @copy="copyTagDraft"
      @replace="replaceStaticTags"
      @append="appendToStaticTags"
    />
    <div v-else class="cv-tag-parse-panel">
      <button
        type="button"
        class="cv-tag-parse-option"
        :class="{ 'cv-tag-parse-option--active': tagParseMode === 'template' }"
        :aria-pressed="tagParseMode === 'template'"
        @click="selectTagParseMode('template')"
      >
        <i class="fa-solid fa-layer-group" />
        <span class="cv-tag-parse-option-content">
          <span class="cv-tag-parse-option-title">发送人物模板条目</span>
          <span class="cv-tag-parse-option-desc">使用当前人物的模板条目生成固定 tag 草稿</span>
        </span>
      </button>

      <div class="cv-tag-parse-custom-block">
        <button
          type="button"
          class="cv-tag-parse-option"
          :class="{ 'cv-tag-parse-option--active': tagParseMode === 'custom' }"
          :aria-pressed="tagParseMode === 'custom'"
          @click="selectTagParseMode('custom')"
        >
          <i class="fa-solid fa-keyboard" />
          <span class="cv-tag-parse-option-content">
            <span class="cv-tag-parse-option-title">手动输入内容</span>
            <span class="cv-tag-parse-option-desc">输入资料或描述后生成固定 tag 草稿</span>
          </span>
        </button>
        <label v-if="tagParseMode === 'custom'" class="cv-field cv-tag-parse-input">
          <span>输入内容</span>
          <Textarea
            v-model="tagParseInput"
            rows="6"
            auto-resize
            class="cv-tag-parse-textarea custom-scrollbar"
            placeholder="输入人物资料、设定或描述..."
          />
        </label>
      </div>

      <div class="cv-tag-parse-custom-block">
        <button
          type="button"
          class="cv-tag-parse-option"
          :class="{ 'cv-tag-parse-option--active': tagParseMode === 'image' }"
          :aria-pressed="tagParseMode === 'image'"
          @click="selectTagParseMode('image')"
        >
          <i class="fa-solid fa-image" />
          <span class="cv-tag-parse-option-content">
            <span class="cv-tag-parse-option-title">从图片提取</span>
            <span class="cv-tag-parse-option-desc">使用 WD Tagger 提取 Danbooru 风格标签草稿</span>
          </span>
        </button>
        <WdTaggerSource
          v-if="tagParseMode === 'image' && tagParseDialogPerson"
          ref="taggerSource"
          v-model:general-threshold="taggerGeneralThreshold"
          v-model:character-threshold="taggerCharacterThreshold"
          :person-kind="tagParseDialogPerson.kind"
          class="cv-tag-parse-input"
          @draft="showTagDraft"
          @error="showTagParseError"
          @parsing="updateTaggerParsing"
        />
      </div>
    </div>

    <template #footer>
      <div class="cv-tag-parse-actions">
        <Button
          v-if="!tagParseDraft && tagParseMode !== 'image'"
          label="生成草稿"
          icon="fa-solid fa-wand-magic-sparkles"
          :loading="isParsingTags"
          :disabled="!canConfirmTagParse"
          @click="confirmParseStaticTags"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import StaticTagsDraftResult from '@/panel/components/StaticTagsDraftResult.vue';
import WdTaggerSource from '@/panel/components/WdTaggerSource.vue';
import PromptSourceEntryList from '@/panel/components/PromptSourceEntryList.vue';
import type { PromptPerson, PromptPersonInsertMode, PromptPersonKind } from '@/constants/novelai';
import { useSettingsStore } from '@/store/settings';
import { appendStaticTags } from '@/services/prompt-profiles/static-tags-draft';
import { createPromptPerson } from '@/services/prompt-profiles/runtime';
import { getCurrentCharacterKey, getCurrentUserPersonaKey } from '@/services/tavern-helper/prompt-profiles-context';
import {
  parsePromptPersonStaticTags,
  parsePromptPersonStaticTagsFromText,
} from '@/services/tavern-helper/prompt-profiles-tags';

type TagParseMode = 'template' | 'custom' | 'image';

const INSERT_MODE_OPTIONS: Array<{ label: string; value: PromptPersonInsertMode }> = [
  { label: '始终触发', value: 'always' },
  { label: '关键词触发', value: 'keyword' },
];

const { settings } = useSettingsStore();
const activeKind = defineModel<PromptPersonKind>('kind', { default: 'character' });
const activePersonId = ref('');
const editingPersonId = ref<string | null>(null);
/** 编辑草稿：进入编辑时预填入旧人物名，确认时写回 person.name */
const editingDraft = ref('');
const isParsingTags = ref(false);
const parsingPersonId = ref('');
const isTagParseDialogVisible = ref(false);
const tagParseDialogPerson = ref<PromptPerson | null>(null);
const tagParseMode = ref<TagParseMode | null>(null);
const tagParseInput = ref('');
const tagParseDraft = ref('');
const taggerGeneralThreshold = ref(0.35);
const taggerCharacterThreshold = ref(0.85);
const taggerSource = ref<{ cancel: () => void } | null>(null);
let tagParseRequestId = 0;
const showConfirm =
  inject<
    (options: {
      title?: string;
      message: string;
      acceptLabel?: string;
      cancelLabel?: string;
      severity?: string;
    }) => Promise<boolean>
  >('showConfirm');
const tagParseDialogStyle = { width: '30rem', maxWidth: 'calc(100vw - 2rem)' } as const;

const filteredProfiles = computed(() =>
  settings.promptProfiles.profiles.filter(person => person.kind === activeKind.value),
);
const canConfirmTagParse = computed(() => {
  if (!tagParseDialogPerson.value || isParsingTags.value) return false;
  if (tagParseMode.value === 'template') return true;
  if (tagParseMode.value === 'custom') return tagParseInput.value.trim().length > 0;
  return false;
});

watch(activeKind, () => {
  activePersonId.value = '';
});

watch(
  filteredProfiles,
  () => {
    if (!filteredProfiles.value.some(person => person.id === activePersonId.value)) {
      activePersonId.value = '';
    }
  },
  { immediate: true },
);

/**
 * 创建空白人物
 */
function createBlankPerson(): void {
  const triggerKeywords = buildDefaultTriggerKeywords(activeKind.value);
  const name = buildDefaultPersonName(triggerKeywords[0] ?? '');
  addPerson(createPromptPerson(activeKind.value, name, triggerKeywords));
}

/**
 * 构建新人物默认触发词
 * @param kind 人物类型
 * @returns 默认触发词列表
 */
function buildDefaultTriggerKeywords(kind: PromptPersonKind): string[] {
  const currentName = kind === 'character' ? getCurrentCharacterKey() : getCurrentUserPersonaKey();
  return compactUniqueStrings([currentName]);
}

/**
 * 构建新人物默认名称
 * @param currentName 当前激活对象名称
 * @returns 新人物名称
 */
function buildDefaultPersonName(currentName: string): string {
  if (currentName.trim()) return currentName.trim();
  return activeKind.value === 'user' ? '新用户人物' : '新角色人物';
}

/**
 * 写入新人物并激活
 * @param person 新人物
 */
function addPerson(person: PromptPerson): void {
  settings.promptProfiles.profiles.push(person);
  activePersonId.value = person.id;
}

/**
 * 读取人物启用状态文案
 * @param person 人物配置
 * @returns 切换开关的可访问名称
 */
function getPersonEnabledLabel(person: PromptPerson): string {
  return person.enabled === false ? '启用人物' : '禁用人物';
}

/**
 * 切换人物面板折叠状态
 * @param id 人物 ID
 */
function togglePerson(id: string): void {
  activePersonId.value = activePersonId.value === id ? '' : id;
}

/**
 * 进入重命名模式，将旧名字预填入草稿
 * @param person 人物配置
 */
function toggleEditing(person: PromptPerson): void {
  if (editingPersonId.value === person.id) {
    finishEditing(person);
    return;
  }
  editingPersonId.value = person.id;
  editingDraft.value = person.name;
}

/**
 * 完成编辑，将草稿写回人物名
 * @param person 人物配置
 */
function finishEditing(person: PromptPerson): void {
  if (editingPersonId.value !== person.id) return;
  person.name = editingDraft.value;
  editingPersonId.value = null;
  editingDraft.value = '';
}

/**
 * 删除指定人物
 * @param person 人物配置
 */
async function deletePerson(person: PromptPerson): Promise<void> {
  const confirmed = await confirmDelete(person.name);
  if (!confirmed) return;
  removePerson(person.id);
}

/**
 * 请求删除确认
 * @param name 人物名称
 * @returns 是否确认删除
 */
async function confirmDelete(name: string): Promise<boolean> {
  if (!showConfirm) return true;
  return showConfirm({
    title: '删除人物',
    message: `确定要删除人物 "${name || '未命名人物'}" 吗？`,
    severity: 'danger',
    acceptLabel: '确认删除',
    cancelLabel: '取消',
  });
}

/**
 * 从设置中移除人物
 * @param id 人物 ID
 */
function removePerson(id: string): void {
  if (editingPersonId.value === id) editingPersonId.value = null;
  const index = settings.promptProfiles.profiles.findIndex(person => person.id === id);
  if (index !== -1) settings.promptProfiles.profiles.splice(index, 1);
}

/**
 * 打开固定 tag 解析弹窗
 * @param person 人物配置
 */
function openParseTagsDialog(person: PromptPerson): void {
  tagParseDialogPerson.value = person;
  tagParseMode.value = null;
  tagParseInput.value = '';
  tagParseDraft.value = '';
  isTagParseDialogVisible.value = true;
}

/**
 * 选择固定 tag 解析来源
 * @param mode 解析来源模式
 */
function selectTagParseMode(mode: TagParseMode): void {
  tagParseMode.value = mode;
}

/**
 * 关闭固定 tag 解析弹窗
 */
function closeParseTagsDialog(): void {
  taggerSource.value?.cancel();
  resetParseTagsDialog();
}

/**
 * 重置固定 tag 解析弹窗
 */
function resetParseTagsDialog(): void {
  tagParseRequestId += 1;
  isParsingTags.value = false;
  parsingPersonId.value = '';
  isTagParseDialogVisible.value = false;
  tagParseDialogPerson.value = null;
  tagParseMode.value = null;
  tagParseInput.value = '';
  tagParseDraft.value = '';
}

/**
 * 确认解析固定 tag
 */
async function confirmParseStaticTags(): Promise<void> {
  const person = tagParseDialogPerson.value;
  if (!person || !canConfirmTagParse.value) return;
  await parseStaticTags(person);
}

/**
 * 将所选资料解析为固定 tag 草稿
 * @param person 人物配置
 */
async function parseStaticTags(person: PromptPerson): Promise<void> {
  const requestId = ++tagParseRequestId;
  isParsingTags.value = true;
  parsingPersonId.value = person.id;
  try {
    const draft = await requestParsedStaticTags(person);
    if (requestId !== tagParseRequestId || !isTagParseDialogVisible.value) return;
    tagParseDraft.value = draft;
    toastr.success('人物 tag 草稿已生成');
  } catch (error) {
    if (requestId === tagParseRequestId) {
      showTagParseError(error instanceof Error ? error.message : '人物 tag 解析失败');
    }
  } finally {
    if (requestId === tagParseRequestId) {
      isParsingTags.value = false;
      parsingPersonId.value = '';
    }
  }
}

/**
 * 按当前模式请求固定 tag 草稿
 * @param person 人物配置
 * @returns 解析后的固定 tag 草稿
 */
function requestParsedStaticTags(person: PromptPerson): Promise<string> {
  if (tagParseMode.value === 'custom') {
    return parsePromptPersonStaticTagsFromText(
      person.name,
      tagParseInput.value,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
    );
  }
  return parsePromptPersonStaticTags(person, settings.promptLlm, settings.promptLlmMessagePresets);
}

/**
 * 显示图片分析生成的草稿
 * @param draft 可编辑 tag 草稿
 */
function showTagDraft(draft: string): void {
  if (!draft.trim()) {
    showTagParseError('未提取到符合当前阈值的标签，请降低阈值后重试');
    return;
  }
  tagParseDraft.value = draft;
  toastr.success('图片 tag 草稿已生成');
}

/**
 * 同步图片分析状态
 * @param value 当前是否请求中
 */
function updateTaggerParsing(value: boolean): void {
  isParsingTags.value = value;
  parsingPersonId.value = value ? (tagParseDialogPerson.value?.id ?? '') : '';
}

/**
 * 显示解析错误
 * @param message 可展示错误信息
 */
function showTagParseError(message: string): void {
  toastr.error(message || '人物 tag 解析失败');
}

/**
 * 复制当前草稿内容
 * @param draft 用户编辑后的草稿
 */
async function copyTagDraft(draft: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(draft);
    toastr.success('tag 草稿已复制');
  } catch {
    toastr.error('复制失败，请手动复制');
  }
}

/**
 * 用草稿替换锁定人物的固定 tag
 * @param draft 用户编辑后的草稿
 */
function replaceStaticTags(draft: string): void {
  const person = getLockedDialogPerson();
  if (!person) return;
  person.staticTags = draft.trim();
  toastr.success('固定 tag 已替换');
}

/**
 * 将草稿追加到锁定人物的固定 tag
 * @param draft 用户编辑后的草稿
 */
function appendToStaticTags(draft: string): void {
  const person = getLockedDialogPerson();
  if (!person) return;
  person.staticTags = appendStaticTags(person.staticTags, draft);
  toastr.success('固定 tag 已追加');
}

/**
 * 查找仍存在的弹窗锁定人物
 * @returns 当前锁定人物或 null
 */
function getLockedDialogPerson(): PromptPerson | null {
  const id = tagParseDialogPerson.value?.id;
  const person = settings.promptProfiles.profiles.find(item => item.id === id) ?? null;
  if (!person) toastr.error('人物已不存在，无法写入固定 tag');
  return person;
}
/**
 * 获取当前人物关联角色名
 * @param person 当前人物
 * @returns 角色名
 */
function getSelectedCharacterName(person: PromptPerson | undefined): string {
  if (!person) return '';
  return getCurrentCharacterKey() || (person.kind === 'character' ? person.name.trim() : '');
}

/**
 * 获取当前人物关联 persona key
 * @param person 当前人物
 * @returns persona key
 */
function getSelectedUserPersonaKey(person: PromptPerson | undefined): string {
  if (!person) return '';
  return getCurrentUserPersonaKey() || (person.kind === 'user' ? person.name.trim() : '');
}

/**
 * 清理并去重字符串列表
 * @param values 原始字符串
 * @returns 非空字符串列表
 */
function compactUniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.map(value => value?.trim() ?? '').filter(Boolean)));
}
</script>

<style scoped>
@reference '../../global.css';

.cv-profiles-tab,
.cv-person-editor {
  @apply flex flex-col gap-0;
}

.cv-profiles-layout {
  @apply mt-(--cv-space-5xl) flex flex-col;
  gap: var(--cv-space-4xl);
}

.cv-person-panel-list {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-person-editor {
  padding: var(--cv-space-2xl);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-person-item__name-input {
  flex: 0 1 auto;
  width: 12rem;
  min-width: 6rem;
  max-width: 100%;
  margin-right: var(--cv-space-lg);
}

.cv-person-section-header {
  @apply flex items-center justify-between;
  margin: var(--cv-space-5xl) 0 var(--cv-space-xl);
}

.cv-person-section-header > .cv-person-section-title {
  @apply m-0 shrink-0;
}

.cv-person-section-title {
  margin: var(--cv-space-5xl) 0 var(--cv-space-xl);
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-lg);
  font-weight: 700;
}

.cv-person-section-title:first-child {
  margin-top: 0;
}

.cv-trigger-inputchips {
  @apply w-full;
}

.cv-parse-tags-btn {
  flex: 0 0 auto;
  width: auto;
  color: var(--cv-on-surface-variant) !important;
  font-size: var(--cv-font-size-xs);
  opacity: 0.78;
}

.cv-parse-tags-btn:hover {
  background: var(--cv-surface-container-high) !important;
  color: var(--cv-on-surface) !important;
  opacity: 1;
}

.cv-full-textarea {
  @apply w-full;
  font-family: Consolas, Monaco, monospace;
}

.cv-tag-parse-panel {
  @apply flex flex-col;
  gap: var(--cv-space-md);
}

.cv-tag-parse-custom-block {
  @apply flex flex-col;
}

.cv-tag-parse-option {
  @apply grid w-full cursor-pointer text-left;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--cv-space-md);
  padding: var(--cv-space-lg);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
  color: var(--cv-on-surface);
}

.cv-tag-parse-option:hover,
.cv-tag-parse-option--active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 10%, var(--cv-surface-container-low));
}

.cv-tag-parse-option > i {
  margin-top: var(--cv-space-xs);
  color: var(--cv-on-surface-variant);
}

.cv-tag-parse-option--active > i {
  color: var(--p-primary-color);
}

.cv-tag-parse-option-content {
  @apply flex min-w-0 flex-col;
  gap: var(--cv-space-xs);
}

.cv-tag-parse-option-title {
  font-size: var(--cv-font-size-md);
  font-weight: 600;
}

.cv-tag-parse-option-desc {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
  line-height: 1.35;
}

.cv-tag-parse-input {
  margin-top: var(--cv-space-md);
}

.cv-tag-parse-textarea {
  @apply w-full resize-y;
  min-height: 9rem;
}

.cv-tag-parse-actions {
  @apply flex justify-end;
  gap: var(--cv-space-sm);
}

.cv-profiles-empty,
.cv-person-empty-panel {
  @apply p-(--cv-space-5xl) text-center;
  color: var(--cv-on-surface-variant);
}

.cv-person-empty-panel {
  @apply flex flex-col justify-center;
  gap: var(--cv-space-lg);
  min-height: 16rem;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}
</style>
