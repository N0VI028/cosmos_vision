<template>
  <div class="cv-tab-content flex flex-col gap-0">
    <div class="mt-(--cv-space-5xl) flex flex-col gap-(--cv-space-4xl)">
      <div data-cv-tutorial="prompt-profiles-overview">
        <Button
          label="新建人物"
          icon="fa-solid fa-user-plus"
          outlined
          size="small"
          class="w-full"
          @click="createBlankPerson"
        />
      </div>

      <div v-if="filteredProfiles.length > 0" class="flex flex-col gap-(--cv-space-xl)">
        <CollapsiblePanelItem
          v-for="person in filteredProfiles"
          :key="person.id"
          :title="person.name || '未命名人物'"
          :collapsed="person.id !== activePersonId"
          :disabled="person.enabled === false"
          :is-editing="editingPersonId === person.id"
          @toggle="togglePerson(person.id)"
        >
          <template #title>
            <div v-if="editingPersonId === person.id" class="flex h-8 min-w-0 flex-1 items-center gap-(--cv-space-md)">
              <InputText
                v-model="editingDraft"
                class="h-8 min-w-0 flex-1"
                size="small"
                autofocus
                @click.stop
                @keydown.enter="finishEditing(person)"
                @keydown.esc="finishEditing(person)"
              />
              <CvMiniButton
                icon="fa-regular fa-check"
                aria-label="完成"
                @click.stop="finishEditing(person)"
              />
            </div>
            <div v-else class="flex h-8 min-w-0 items-center gap-(--cv-space-sm)">
              <span
                class="block min-w-0 flex-[0_1_auto] overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-(--cv-on-surface) leading-8"
              >
                {{ person.name || '未命名人物' }}
              </span>
              <CvMiniButton
                icon="fa-regular fa-pen"
                aria-label="重命名"
                @click.stop="toggleEditing(person)"
              />
            </div>
          </template>

          <template #actions>
            <CvMiniToggleSwitch
              v-model="person.enabled"
              :aria-label="getPersonEnabledLabel(person)"
            />
            <CvMiniButton
              icon="fa-regular fa-trash"
              tone="danger"
              aria-label="删除人物"
              @click="deletePerson(person)"
            />
          </template>

          <section class="flex flex-col gap-0 p-(--cv-space-2xl)">
            <label class="cv-field">
              <span>触发模式</span>
              <Select
                v-model="person.insertMode"
                :options="INSERT_MODE_OPTIONS"
                option-label="label"
                option-value="value"
                fluid
              />
            </label>

            <template v-if="person.insertMode === 'keyword'">
              <h3
                class="mt-(--cv-space-5xl) mb-(--cv-space-xl) text-(length:--cv-font-size-lg) font-bold text-(--cv-on-surface) first:mt-0"
              >
                关键词
              </h3>
              <div class="cv-field">
                <div class="cv-field-control">
                  <InputTags
                    v-model="person.triggerKeywords"
                    :allow-duplicate="false"
                    add-on-blur
                    delimiter=","
                    fluid
                  />
                  <div class="cv-field-hint">输入关键词，回车或逗号添加</div>
                </div>
              </div>
            </template>

            <div :data-cv-tutorial="isTutorialMockPersonId(person.id) ? 'prompt-profiles-static-tags' : undefined">
              <div class="mt-(--cv-space-5xl) mb-(--cv-space-xl) flex items-center justify-between">
                <h3 class="m-0 shrink-0 text-(length:--cv-font-size-lg) font-bold text-(--cv-on-surface)">固定 tag</h3>
                <CvMiniButton
                  label="从资料解析"
                  icon="fa-regular fa-dice-d20"
                  :loading="isParsingTags && person.id === parsingPersonId"
                  @click="openParseTagsDialog(person)"
                />
              </div>
              <div class="cv-field">
                <div class="cv-field-control">
                  <Textarea
                    v-model="person.staticTags"
                    rows="3"
                    auto-resize
                    class="w-full font-mono"
                  />
                  <div class="cv-field-hint">固定tag中的内容将在发送到LLM时，被强调原样保留在最终tag中</div>
                </div>
              </div>
            </div>

            <h3
              class="mt-(--cv-space-5xl) mb-(--cv-space-xl) text-(length:--cv-font-size-lg) font-bold text-(--cv-on-surface) first:mt-0"
            >
              人物模板条目
            </h3>
            <div
              :data-cv-tutorial="isTutorialMockPersonId(person.id) ? 'prompt-profiles-template-entries' : undefined"
            >
              <PromptSourceEntryList
                v-model="person.templateEntries"
                :kind="person.kind"
                :character-name="getSelectedCharacterName(person)"
                :user-persona-key="getSelectedUserPersonaKey(person)"
                :tutorial-target="isTutorialMockPersonId(person.id)"
              />
            </div>
          </section>
        </CollapsiblePanelItem>
      </div>

      <section
        v-else
        class="flex min-h-64 flex-col justify-center gap-(--cv-space-lg) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low) p-(--cv-space-5xl) text-center text-(--cv-on-surface-variant)"
      >
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
    <div v-else class="flex flex-col gap-(--cv-space-md)">
      <div v-for="option in TAG_PARSE_MODE_OPTIONS" :key="option.value" class="flex flex-col">
        <button
          type="button"
          class="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low) p-(--cv-space-lg) text-left text-(--cv-on-surface) hover:border-(--p-primary-color) hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,var(--cv-surface-container-low))]"
          :class="
            tagParseMode === option.value &&
            'border-(--p-primary-color) bg-[color-mix(in_srgb,var(--p-primary-color)_10%,var(--cv-surface-container-low))] [&_i]:text-(--p-primary-color)'
          "
          :aria-pressed="tagParseMode === option.value"
          @click="selectTagParseMode(option.value)"
        >
          <i :class="[option.icon, 'mt-(--cv-space-xs) text-(--cv-on-surface-variant)']" />
          <span class="flex min-w-0 flex-col gap-(--cv-space-xs)">
            <span class="text-(length:--cv-font-size-md) font-semibold">{{ option.label }}</span>
            <span class="text-(length:--cv-font-size-xs) leading-[1.35] text-(--cv-on-surface-variant) whitespace-normal">{{
              option.description
            }}</span>
          </span>
        </button>
        <label v-if="option.value === 'custom' && tagParseMode === 'custom'" class="cv-field mt-(--cv-space-5xl)">
          <span>输入内容</span>
          <Textarea
            v-model="tagParseInput"
            rows="6"
            auto-resize
            class="custom-scrollbar w-full min-h-36 resize-y"
            placeholder="输入人物资料、设定或描述..."
          />
        </label>
        <WdTaggerSource
          v-if="option.value === 'image' && tagParseMode === 'image' && tagParseDialogPerson"
          :ref="bindTaggerSource"
          v-model:general-threshold="taggerGeneralThreshold"
          v-model:character-threshold="taggerCharacterThreshold"
          :person-kind="tagParseDialogPerson.kind"
          class="mt-(--cv-space-md)"
          @draft="showTagDraft"
          @error="showTagParseError"
          @parsing="updateTaggerParsing"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-(--cv-space-sm)">
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
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import StaticTagsDraftResult from '@/panel/components/StaticTagsDraftResult.vue';
import WdTaggerSource from '@/panel/components/WdTaggerSource.vue';
import PromptSourceEntryList from '@/panel/components/PromptSourceEntryList.vue';
import type { PromptPerson, PromptPersonInsertMode, PromptPersonKind } from '@/constants/novelai';
import { useSettingsStore } from '@/store/settings';
import { appendStaticTags } from '@/services/prompt-profiles/static-tags-draft';
import { createPromptPerson } from '@/services/prompt-profiles/runtime';
import { isTutorialMockPersonId } from '@/panel/components/onboarding/mock-person';
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

/** 固定 tag 解析来源选项 */
const TAG_PARSE_MODE_OPTIONS: Array<{
  value: TagParseMode;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'template',
    label: '发送人物模板条目',
    description: '使用当前人物的模板条目生成固定 tag 草稿',
    icon: 'fa-solid fa-layer-group',
  },
  {
    value: 'custom',
    label: '手动输入内容',
    description: '输入资料或描述后生成固定 tag 草稿',
    icon: 'fa-solid fa-keyboard',
  },
  {
    value: 'image',
    label: '从图片提取',
    description: '使用 WD Tagger 提取 Danbooru 风格标签草稿',
    icon: 'fa-solid fa-image',
  },
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

/**
 * 绑定 v-for 内的 WD Tagger 组件实例
 * @param el 组件实例或卸载时的 null
 */
function bindTaggerSource(el: unknown): void {
  taggerSource.value = el && typeof el === 'object' && 'cancel' in el ? (el as { cancel: () => void }) : null;
}
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
    // 教程注入的模拟人物自动展开，便于高亮内部区域
    const mockPerson = filteredProfiles.value.find(person => isTutorialMockPersonId(person.id));
    if (mockPerson && activePersonId.value !== mockPerson.id) {
      activePersonId.value = mockPerson.id;
      return;
    }
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
