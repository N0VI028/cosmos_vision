<template>
  <Dialog
    v-model:visible="visible"
    modal
    :closable="false"
    :close-on-escape="false"
    :draggable="false"
    :class="dialogClass"
    :header="title"
    :style="dialogStyle"
    :content-style="contentStyle"
    @show="focusInput"
  >
    <div
      class="flex max-h-[min(68vh,34rem)] w-full flex-col gap-(--cv-space-3xl) overflow-x-hidden overflow-y-auto overscroll-contain *:shrink-0"
    >
      <div class="cv-confirm-message mb-2">{{ message }}</div>
      <div class="flex min-h-0 flex-col gap-(--cv-space-lg)">
        <div class="flex items-center justify-between gap-(--cv-space-md)">
          <label
            v-if="primaryLabel"
            class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)"
            >{{ primaryLabel }}</label
          >
          <div v-if="enablePresetSelector" class="w-48 max-w-[50%]">
            <Select
              v-model="positivePresetId"
              :options="positivePresetOptions"
              option-label="name"
              option-value="id"
              size="small"
              fluid
            />
          </div>
        </div>
        <Textarea
          ref="inputRef"
          v-model="value"
          class="custom-scrollbar max-h-[min(28vh,14rem)] min-h-28 w-full resize-none overflow-y-auto overscroll-contain"
          :rows="rows"
          @click="rememberSelection"
          @keyup="rememberSelection"
          @select="rememberSelection"
        />
      </div>
      <div v-if="quickPhrases !== undefined" class="flex min-h-0 flex-col gap-(--cv-space-sm)">
        <div class="flex items-center justify-between">
          <label class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)">
            常用短语
          </label>
          <div class="flex items-center gap-(--cv-space-md)">
            <button
              v-if="hasOverflow || isExpanded"
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0 text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) transition-colors hover:text-(--cvp-primary-color)"
              @click="toggleExpand"
            >
              {{ isExpanded ? '收起' : '展开' }}
            </button>
            <CvMiniButton icon="fa-regular fa-pen-to-square" aria-label="管理常用短语" @click="openManageDialog" />
          </div>
        </div>
        <div
          v-if="quickPhrases.length"
          ref="chipsContainerRef"
          class="flex flex-wrap gap-(--cv-space-xs)"
          :class="isExpanded ? 'custom-scrollbar max-h-40 overflow-y-auto' : 'max-h-[4.75rem] overflow-hidden'
        ">
          <button
            v-for="(phrase, index) in quickPhrases"
            :key="index"
            type="button"
            class="inline-flex cursor-pointer items-center rounded-(--cv-radius-full) border border-(--cv-surface-variant) bg-(--cv-surface-container-low) px-(--cv-space-lg) py-(--cv-space-xs) text-(length:--cv-font-size-xs) text-(--cv-on-surface) transition-colors duration-150 hover:border-(--cv-outline) hover:bg-(--cv-surface-container) hover:text-(--cvp-primary-color)"
            @pointerdown.prevent="rememberSelection"
            @click="insertQuickPhrase(phrase)"
          >
            {{ phrase }}
          </button>
        </div>
      </div>
      <div v-if="hasSecondaryField" class="flex min-h-0 flex-col gap-(--cv-space-lg)">
        <div class="flex items-center justify-between gap-(--cv-space-md)">
          <label class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)">{{
            secondaryLabel
          }}</label>
          <div v-if="enablePresetSelector" class="w-48 max-w-[50%]">
            <Select
              v-model="negativePresetId"
              :options="negativePresetOptions"
              option-label="name"
              option-value="id"
              size="small"
              fluid
            />
          </div>
        </div>
        <Textarea
          v-model="secondaryValue"
          class="custom-scrollbar max-h-[min(24vh,12rem)] min-h-[5.5rem] w-full resize-none overflow-y-auto overscroll-contain"
          :rows="secondaryRows"
        />
      </div>
      <div v-if="enableCharacters" class="flex flex-col gap-(--cv-space-xl)">
        <div class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)">
          角色提示词（{{ characters.length }}）
        </div>
        <div class="flex flex-col gap-(--cv-space-lg)">
          <CollapsiblePanelItem
            v-for="(character, index) in characters"
            :key="character.id"
            :title="getCharacterTitle(character, index)"
            :collapsed="!expandedIds.has(character.id)"
            @toggle="toggleCharacter(character.id)"
          >
            <template #actions>
              <CvMiniButton
                icon="fa-regular fa-trash"
                tone="danger"
                aria-label="删除角色"
                @click="removeCharacter(character.id)"
              />
            </template>
            <div class="flex flex-col gap-(--cv-space-xl) p-(--cv-space-xl)">
              <div class="flex min-h-0 flex-col gap-(--cv-space-sm)">
                <label class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)"
                  >角色正面</label
                >
                <Textarea
                  v-model="character.positivePrompt"
                  class="custom-scrollbar max-h-[min(18vh,9rem)] min-h-[4.5rem] w-full resize-none overflow-y-auto overscroll-contain"
                  :rows="3"
                />
              </div>
              <div class="flex min-h-0 flex-col gap-(--cv-space-sm)">
                <label class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)"
                  >角色负面</label
                >
                <Textarea
                  v-model="character.negativePrompt"
                  class="custom-scrollbar max-h-[min(18vh,9rem)] min-h-[4.5rem] w-full resize-none overflow-y-auto overscroll-contain"
                  :rows="2"
                />
              </div>
              <div class="grid grid-cols-2 gap-(--cv-space-xl)">
                <label class="flex min-h-0 flex-col gap-(--cv-space-sm)">
                  <span class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)"
                    >X 坐标</span
                  >
                  <InputNumber
                    v-model="character.x"
                    fluid
                    class="w-full min-w-0"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :max-fraction-digits="2"
                    :allow-empty="false"
                  />
                </label>
                <label class="flex min-h-0 flex-col gap-(--cv-space-sm)">
                  <span class="text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-(--cv-on-surface)"
                    >Y 坐标</span
                  >
                  <InputNumber
                    v-model="character.y"
                    fluid
                    class="w-full min-w-0"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :max-fraction-digits="2"
                    :allow-empty="false"
                  />
                </label>
              </div>
            </div>
          </CollapsiblePanelItem>
        </div>
        <div class="flow-root">
          <CvAddEntryButton label="添加角色" @click="addCharacter" />
        </div>
      </div>
    </div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button :label="cancelLabel" text @click="submit(false)" />
        <Button :label="acceptLabel" @click="submit(true)" />
      </div>
    </template>
  </Dialog>
  <Dialog
    v-model:visible="isManageDialogOpen"
    modal
    :draggable="false"
    :class="dialogClass"
    header="管理常用短语"
    :style="manageDialogStyle"
    :content-style="contentStyle"
  >
    <div
      class="flex max-h-[min(56vh,28rem)] w-full flex-col gap-(--cv-space-lg) overflow-x-hidden overflow-y-auto overscroll-contain p-(--cv-space-xs)"
    >
      <div v-if="draftPhrases.length === 0" class="cv-confirm-message text-(--cv-on-surface-variant)">
        暂无常用短语，点击下方按钮添加。
      </div>
      <div v-for="(_, index) in draftPhrases" :key="index" class="flex items-center gap-(--cv-space-sm)">
        <InputText v-model="draftPhrases[index]" fluid class="min-w-0" placeholder="输入常用短语..." />
        <CvMiniButton
          icon="fa-regular fa-trash"
          tone="danger"
          aria-label="删除短语"
          @click="removeDraftPhrase(index)"
        />
      </div>
      <div class="mt-(--cv-space-sm) flow-root">
        <CvAddEntryButton label="添加短语" @click="addDraftPhrase" />
      </div>
    </div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text @click="closeManageDialog" />
        <Button label="确定" @click="saveManageDialog" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';

import { buildEditableDisplayText } from '@/composables/inlineEditablePromptSnapshot';
import { DARK_CLASS } from '@/constants/default-settings';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import {
  focusTextareaAt,
  getTextareaElement,
  readTextareaInsertRange,
  replaceTextRange,
  type TextRange,
} from '@/panel/components/textarea-token-insert';
import { useSettingsStore } from '@/store/settings';

/** 编辑弹窗中的角色提示词草稿 */
export interface TextInputCharacterDraft {
  id: number;
  positivePrompt: string;
  negativePrompt: string;
  x: number;
  y: number;
}

/** 弹窗提交返回值 */
export interface TextInputDialogSubmitValue {
  value: string;
  secondaryValue: string;
  characters: TextInputCharacterDraft[];
  positivePresetId?: string;
  negativePresetId?: string;
}

type TextInputRef = { $el?: HTMLElement } | HTMLElement | null;

const visible = defineModel<boolean>('visible', { required: true });
const value = defineModel<string>('value', { required: true });
const secondaryValue = defineModel<string>('secondaryValue', { default: '' });
const characters = defineModel<TextInputCharacterDraft[]>('characters', { default: () => [] });
const positivePresetId = defineModel<string>('positivePresetId', { default: '' });
const negativePresetId = defineModel<string>('negativePresetId', { default: '' });
const positiveCore = defineModel<string>('positiveCore', { default: '' });
const negativeCore = defineModel<string>('negativeCore', { default: '' });

const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    primaryLabel?: string;
    secondaryLabel?: string;
    rows?: number;
    secondaryRows?: number;
    acceptLabel?: string;
    cancelLabel?: string;
    darkMode?: boolean;
    enableCharacters?: boolean;
    enablePresetSelector?: boolean;
    quickPhrases?: string[];
  }>(),
  {
    primaryLabel: '',
    secondaryLabel: '',
    rows: 4,
    secondaryRows: 4,
    acceptLabel: '确定',
    cancelLabel: '取消',
    darkMode: false,
    enableCharacters: false,
    enablePresetSelector: false,
    quickPhrases: undefined,
  },
);

const emit = defineEmits<{
  submit: [value: TextInputDialogSubmitValue | null];
  updateQuickPhrases: [phrases: string[]];
}>();

const { settings } = useSettingsStore();

const positivePresetOptions = computed(() => {
  const options = [
    { id: '', name: '原提示词' },
    ...settings.imagePromptPresets.positive.map(preset => ({
      id: preset.id,
      name: preset.name?.trim() || '未命名预设',
    })),
  ];
  if (positivePresetId.value && !options.some(opt => opt.id === positivePresetId.value)) {
    options.push({ id: positivePresetId.value, name: `${positivePresetId.value} (已失效)` });
  }
  return options;
});

const negativePresetOptions = computed(() => {
  const options = [
    { id: '', name: '原提示词' },
    ...settings.imagePromptPresets.negative.map(preset => ({
      id: preset.id,
      name: preset.name?.trim() || '未命名预设',
    })),
  ];
  if (negativePresetId.value && !options.some(opt => opt.id === negativePresetId.value)) {
    options.push({ id: negativePresetId.value, name: `${negativePresetId.value} (已失效)` });
  }
  return options;
});

const inputRef = ref<TextInputRef>(null);
const isMobile = useMediaQuery('(max-width: 87.5em)');
const expandedIds = ref(new Set<number>());
let nextCharacterId = 0;

const selectionRange = ref<TextRange | null>(null);
const chipsContainerRef = ref<HTMLElement | null>(null);
const isExpanded = ref(false);
const hasOverflow = ref(false);
const isManageDialogOpen = ref(false);
const draftPhrases = ref<string[]>([]);

const dialogClass = computed(() => ['cv-confirm-dialog', 'cv-text-input-dialog', { [DARK_CLASS]: props.darkMode }]);
const hasSecondaryField = computed(() => Boolean(props.secondaryLabel));
const dialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '32rem', maxHeight: 'calc(100vh - 2rem)' }
    : { width: '42rem', maxWidth: 'calc(100vw - 3rem)', maxHeight: 'calc(100vh - 3rem)' },
);
const manageDialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '30rem', maxHeight: 'calc(100vh - 2rem)' }
    : { width: '32rem', maxWidth: 'calc(100vw - 3rem)', maxHeight: 'calc(100vh - 3rem)' },
);
const contentStyle = { overflow: 'hidden' } as const;

watch(
  () => props.quickPhrases,
  () => {
    nextTick(checkOverflow);
  },
);

watch(positivePresetId, id => {
  if (!props.enablePresetSelector) return;
  value.value = buildEditableDisplayText(settings.imagePromptPresets.positive, id, positiveCore.value);
});

watch(negativePresetId, id => {
  if (!props.enablePresetSelector) return;
  secondaryValue.value = buildEditableDisplayText(settings.imagePromptPresets.negative, id, negativeCore.value);
});

/**
 * 记录主输入框当前光标选区
 */
function rememberSelection(): void {
  const el = getTextInputElement();
  if (!el) return;
  selectionRange.value = { start: el.selectionStart, end: el.selectionEnd };
}

/**
 * 切换常用短语展开/收起状态
 */
function toggleExpand(): void {
  isExpanded.value = !isExpanded.value;
}

/**
 * 检测常用短语是否溢出两行高度
 */
function checkOverflow(): void {
  const el = chipsContainerRef.value;
  if (!el) {
    hasOverflow.value = false;
    return;
  }
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const collapsedHeightPx = 4.75 * rootFontSize;
  const overflowing = el.scrollHeight > collapsedHeightPx + 1;
  hasOverflow.value = overflowing;
  if (!overflowing && isExpanded.value) {
    isExpanded.value = false;
  }
}

/**
 * 向主输入框光标处插入常用短语
 * @param phrase 待插入短语
 */
function insertQuickPhrase(phrase: string): void {
  const currentContent = value.value;
  const range = readTextareaInsertRange(getTextInputElement(), selectionRange.value, currentContent);
  const prevChar = range.start > 0 ? currentContent[range.start - 1] : '';
  const prefix = prevChar && !/\s/.test(prevChar) ? ' ' : '';
  const token = `${prefix}${phrase}`;
  const nextContent = replaceTextRange(currentContent, range, token);
  value.value = nextContent;
  const nextPosition = range.start + token.length;
  focusTextareaAt(getTextInputElement, nextPosition, nextRange => {
    selectionRange.value = nextRange;
  });
}

/**
 * 打开管理常用短语弹窗
 */
function openManageDialog(): void {
  draftPhrases.value = [...(props.quickPhrases ?? [])];
  isManageDialogOpen.value = true;
}

/**
 * 关闭管理常用短语弹窗
 */
function closeManageDialog(): void {
  isManageDialogOpen.value = false;
}

/**
 * 在管理弹窗中添加空短语草稿行
 */
function addDraftPhrase(): void {
  draftPhrases.value.push('');
}

/**
 * 在管理弹窗中删除指定短语草稿行
 * @param index 短语索引
 */
function removeDraftPhrase(index: number): void {
  draftPhrases.value.splice(index, 1);
}

/**
 * 保存常用短语并关闭管理弹窗
 */
function saveManageDialog(): void {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const raw of draftPhrases.value) {
    const trimmed = raw.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      sanitized.push(trimmed);
    }
  }
  emit('updateQuickPhrases', sanitized);
  isManageDialogOpen.value = false;
  nextTick(checkOverflow);
}

/**
 * 提交文本输入弹窗结果
 * @param accept 是否确认输入
 */
function submit(accept: boolean): void {
  visible.value = false;
  emit(
    'submit',
    accept
      ? {
          value: value.value.trim(),
          secondaryValue: secondaryValue.value.trim(),
          characters: characters.value.map(cloneCharacterDraft),
          positivePresetId: positivePresetId.value,
          negativePresetId: negativePresetId.value,
        }
      : null,
  );
}

/**
 * 桌面端聚焦文本输入框
 */
function focusInput(): void {
  syncCharacterIdSeed();
  nextTick(checkOverflow);
  if (isMobile.value) return;
  nextTick(() => {
    const el = getTextInputElement();
    if (!el) return;
    el.focus();
    el.select();
    rememberSelection();
  });
}

/**
 * 读取 PrimeVue Textarea 对应的原生元素
 * @returns 文本框元素
 */
function getTextInputElement(): HTMLTextAreaElement | null {
  return getTextareaElement(inputRef.value);
}

/**
 * 生成角色折叠标题
 * @param character 角色草稿
 * @param index 序号
 * @returns 标题
 */
function getCharacterTitle(character: TextInputCharacterDraft, index: number): string {
  const preview = character.positivePrompt.trim() || '(空)';
  const short = preview.length > 28 ? `${preview.slice(0, 28)}…` : preview;
  return `角色 ${index + 1} · ${short}`;
}

/**
 * 切换角色折叠
 * @param id 角色 id
 */
function toggleCharacter(id: number): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

/**
 * 添加空角色
 */
function addCharacter(): void {
  const character = createCharacterDraft();
  characters.value = [...characters.value, character];
  expandedIds.value = new Set([...expandedIds.value, character.id]);
}

/**
 * 删除角色
 * @param id 角色 id
 */
function removeCharacter(id: number): void {
  characters.value = characters.value.filter(item => item.id !== id);
  const next = new Set(expandedIds.value);
  next.delete(id);
  expandedIds.value = next;
}

/**
 * 创建空角色草稿
 * @returns 角色草稿
 */
function createCharacterDraft(): TextInputCharacterDraft {
  return { id: ++nextCharacterId, positivePrompt: '', negativePrompt: '', x: 0.5, y: 0.5 };
}

/**
 * 克隆角色草稿（提交用）
 * @param character 角色草稿
 * @returns 纯对象草稿
 */
function cloneCharacterDraft(character: TextInputCharacterDraft): TextInputCharacterDraft {
  return {
    id: character.id,
    positivePrompt: character.positivePrompt,
    negativePrompt: character.negativePrompt,
    x: clampCoordinate(character.x),
    y: clampCoordinate(character.y),
  };
}

/**
 * 将坐标夹到 0–1
 * @param value 坐标
 * @returns 合法坐标
 */
function clampCoordinate(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * 打开弹窗时同步角色 id 种子并默认展开首个角色
 */
function syncCharacterIdSeed(): void {
  nextCharacterId = characters.value.reduce((max, item) => Math.max(max, item.id), 0);
  expandedIds.value = new Set(characters.value.slice(0, 1).map(item => item.id));
}
</script>
