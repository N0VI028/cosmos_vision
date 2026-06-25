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
          <template #actions>
            <ToggleSwitch v-model="person.enabled" :aria-label="getPersonEnabledLabel(person)" />
            <Button
              icon="fa-solid fa-trash"
              severity="danger"
              text
              rounded
              aria-label="删除人物"
              @click="deletePerson(person)"
            />
          </template>

          <section class="cv-person-editor">
            <div class="cv-field-grid">
              <label class="cv-field">
                <span>人物名称</span>
                <InputText v-model="person.name" />
              </label>
              <label class="cv-field">
                <span>触发模式</span>
                <Select
                  v-model="person.insertMode"
                  :options="INSERT_MODE_OPTIONS"
                  option-label="label"
                  option-value="value"
                />
              </label>
            </div>

            <h3 class="cv-person-section-title">关键词</h3>
            <div class="cv-token-input-row">
              <InputText
                v-model="keywordInput"
                placeholder="输入关键词后回车"
                @keydown.enter.prevent="addKeyword(person)"
              />
              <Button
                icon="fa-solid fa-plus"
                aria-label="添加关键词"
                rounded
                class="cv-add-keyword-btn"
                @click="addKeyword(person)"
              />
            </div>
            <div class="cv-chip-row">
              <Tag v-for="keyword in person.triggerKeywords" :key="keyword" :value="keyword" class="cv-keyword-tag">
                <template #icon>
                  <button type="button" class="cv-chip-remove" @click="removeKeyword(person, keyword)">
                    <i class="fa-solid fa-xmark" />
                  </button>
                </template>
              </Tag>
              <span v-if="person.triggerKeywords.length === 0" class="cv-muted">
                {{ getKeywordHint(person) }}
              </span>
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
              <Textarea v-model="person.staticTags" rows="3" auto-resize class="cv-full-textarea" />
              <div class="cv-field-hint" style="margin-top: 0">
                固定tag中的内容将在发送到LLM时，被强调原样保留在最终tag中
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
        <span>请选择或创建一个人物设置</span>
      </section>
    </div>
  </div>

  <Dialog
    v-model:visible="isTagParseDialogVisible"
    class="cv-tag-parse-dialog"
    modal
    :dismissable-mask="!isParsingTags"
    :closable="!isParsingTags"
    :draggable="false"
    header="从资料解析固定 tag"
    :style="tagParseDialogStyle"
    @hide="closeParseTagsDialog"
  >
    <div class="cv-tag-parse-panel">
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
          <span class="cv-tag-parse-option-desc">使用当前人物的模板条目生成固定 tag</span>
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
            <span class="cv-tag-parse-option-desc">输入一段资料或描述后生成固定 tag</span>
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
    </div>
    <template #footer>
      <div class="cv-tag-parse-actions">
        <Button label="取消" text :disabled="isParsingTags" @click="closeParseTagsDialog" />
        <Button
          label="确定"
          icon="fa-solid fa-check"
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
import PromptSourceEntryList from '@/panel/components/PromptSourceEntryList.vue';
import type { PromptPerson, PromptPersonInsertMode, PromptPersonKind } from '@/constants/novelai';
import { useSettingsStore } from '@/store/settings';
import { createPromptPerson } from '@/services/prompt-profiles/runtime';
import { getCurrentCharacterKey, getCurrentUserPersonaKey } from '@/services/tavern-helper/prompt-profiles-context';
import {
  parsePromptPersonStaticTags,
  parsePromptPersonStaticTagsFromText,
} from '@/services/tavern-helper/prompt-profiles-tags';

type TagParseMode = 'template' | 'custom';

const INSERT_MODE_OPTIONS: Array<{ label: string; value: PromptPersonInsertMode }> = [
  { label: '始终触发', value: 'always' },
  { label: '关键词触发', value: 'keyword' },
];

const { settings } = useSettingsStore();
const activeKind = defineModel<PromptPersonKind>('kind', { default: 'character' });
const activePersonId = ref('');
const keywordInput = ref('');
const isParsingTags = ref(false);
const parsingPersonId = ref('');
const isTagParseDialogVisible = ref(false);
const tagParseDialogPerson = ref<PromptPerson | null>(null);
const tagParseMode = ref<TagParseMode | null>(null);
const tagParseInput = ref('');
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

watch(activePersonId, () => {
  keywordInput.value = '';
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
  const index = settings.promptProfiles.profiles.findIndex(person => person.id === id);
  if (index !== -1) settings.promptProfiles.profiles.splice(index, 1);
}

/**
 * 添加关键词
 * @param person 人物配置
 */
function addKeyword(person: PromptPerson): void {
  const keyword = keywordInput.value.trim();
  if (!keyword) return;
  if (!person.triggerKeywords.includes(keyword)) person.triggerKeywords.push(keyword);
  keywordInput.value = '';
}

/**
 * 删除关键词
 * @param person 人物配置
 * @param keyword 关键词
 */
function removeKeyword(person: PromptPerson, keyword: string): void {
  const index = person.triggerKeywords.indexOf(keyword);
  if (index !== -1) person.triggerKeywords.splice(index, 1);
}

/**
 * 读取关键词提示文本
 * @param person 人物配置
 * @returns 提示文本
 */
function getKeywordHint(person: PromptPerson): string {
  if (person.insertMode === 'keyword') return '关键词触发模式至少需要一个关键词';
  return '可选，可添加别名、简称或剧情关键词';
}

/**
 * 打开固定 tag 解析弹窗
 * @param person 人物配置
 */
function openParseTagsDialog(person: PromptPerson): void {
  tagParseDialogPerson.value = person;
  tagParseMode.value = null;
  tagParseInput.value = '';
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
  if (isParsingTags.value) return;
  resetParseTagsDialog();
}

/**
 * 重置固定 tag 解析弹窗
 */
function resetParseTagsDialog(): void {
  isTagParseDialogVisible.value = false;
  tagParseDialogPerson.value = null;
  tagParseMode.value = null;
  tagParseInput.value = '';
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
 * 将所选资料解析为固定 tag
 * @param person 人物配置
 */
async function parseStaticTags(person: PromptPerson): Promise<void> {
  isParsingTags.value = true;
  parsingPersonId.value = person.id;
  try {
    person.staticTags = await requestParsedStaticTags(person);
    toastr.success('人物 tag 已解析');
    resetParseTagsDialog();
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : '人物 tag 解析失败');
  } finally {
    isParsingTags.value = false;
    parsingPersonId.value = '';
  }
}

/**
 * 按当前模式请求固定 tag
 * @param person 人物配置
 * @returns 解析后的固定 tag
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
  @apply mt-[var(--cv-space-5xl)] flex flex-col;
  gap: var(--cv-space-4xl);
}

.cv-person-empty-panel {
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
  padding: var(--cv-space-2xl);
}

.cv-person-panel-list {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-muted {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.78);
}

.cv-person-editor {
  padding: var(--cv-space-2xl);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-person-editor .cv-field {
  gap: var(--cv-space-md);
}

.cv-person-editor .cv-field-grid {
  gap: var(--cv-space-3xl) var(--cv-space-7xl);
  margin-bottom: 0;
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
  font-size: calc(var(--mainFontSize) * 0.95);
  font-weight: 700;
}

.cv-person-section-title:first-child {
  margin-top: 0;
}

.cv-token-input-row,
.cv-chip-row {
  @apply flex items-center;
  gap: var(--cv-space-sm);
}

.cv-parse-tags-btn {
  flex: 0 0 auto;
  width: auto;
  color: var(--cv-on-surface-variant) !important;
  font-size: calc(var(--mainFontSize) * 0.82);
  opacity: 0.78;
}

.cv-parse-tags-btn:hover {
  background: var(--cv-surface-container-high) !important;
  color: var(--cv-on-surface) !important;
  opacity: 1;
}

.cv-add-keyword-btn {
  padding: 0 !important;
  aspect-ratio: 1 / 1;
  border-radius: 50% !important;
}

.cv-token-input-row > .p-inputtext {
  @apply min-w-0 flex-auto;
}

.cv-chip-row {
  flex-wrap: wrap;
  margin-top: var(--cv-space-lg);
  margin-bottom: 0;
}

.cv-keyword-tag {
  padding: 0.125rem 0.35rem !important;
  font-size: calc(var(--mainFontSize) * 0.72) !important;
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  border: 1px solid var(--p-primary-color) !important;
  color: var(--p-primary-color) !important;
}

.cv-chip-remove {
  @apply cursor-pointer border-0 bg-transparent p-0;
  color: inherit;
  font-size: 0.85em;
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
  font-size: calc(var(--mainFontSize) * 0.92);
  font-weight: 600;
}

.cv-tag-parse-option-desc {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.78);
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
  @apply p-[var(--cv-space-6xl)] text-center;
  color: var(--cv-on-surface-variant);
}

.cv-person-empty-panel {
  @apply flex flex-col justify-center;
  gap: var(--cv-space-lg);
  min-height: 16rem;
}
</style>
