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
      class="flex w-full max-h-[min(68vh,34rem)] flex-col gap-(--cv-space-3xl) overflow-x-hidden overflow-y-auto overscroll-contain *:shrink-0"
    >
      <div class="cv-confirm-message mb-2">{{ message }}</div>
      <div class="flex min-h-0 flex-col gap-(--cv-space-sm)">
        <label
          v-if="primaryLabel"
          class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)"
        >{{ primaryLabel }}</label>
        <Textarea
          ref="inputRef"
          v-model="value"
          class="custom-scrollbar max-h-[min(28vh,14rem)] min-h-28 w-full resize-none overflow-y-auto overscroll-contain"
          :rows="rows"
        />
      </div>
      <div v-if="hasSecondaryField" class="flex min-h-0 flex-col gap-(--cv-space-sm)">
        <label class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)">{{
          secondaryLabel
        }}</label>
        <Textarea
          v-model="secondaryValue"
          class="custom-scrollbar max-h-[min(24vh,12rem)] min-h-[5.5rem] w-full resize-none overflow-y-auto overscroll-contain"
          :rows="secondaryRows"
        />
      </div>
      <div v-if="enableCharacters" class="flex flex-col gap-(--cv-space-xl)">
        <div class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)">
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
                <label class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)"
                  >角色正面</label
                >
                <Textarea
                  v-model="character.positivePrompt"
                  class="custom-scrollbar max-h-[min(18vh,9rem)] min-h-[4.5rem] w-full resize-none overflow-y-auto overscroll-contain"
                  :rows="3"
                />
              </div>
              <div class="flex min-h-0 flex-col gap-(--cv-space-sm)">
                <label class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)"
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
                  <span class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)"
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
                  <span class="text-(length:--cv-font-size-xs) font-semibold leading-[1.4] text-(--cv-on-surface)"
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
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';

import { DARK_CLASS } from '@/constants/default-settings';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';

/** 编辑弹窗中的角色提示词草稿 */
export interface TextInputCharacterDraft {
  id: number;
  positivePrompt: string;
  negativePrompt: string;
  x: number;
  y: number;
}

type TextInputRef = { $el?: HTMLElement } | HTMLElement | null;

const visible = defineModel<boolean>('visible', { required: true });
const value = defineModel<string>('value', { required: true });
const secondaryValue = defineModel<string>('secondaryValue', { default: '' });
const characters = defineModel<TextInputCharacterDraft[]>('characters', { default: () => [] });

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
  },
);

const emit = defineEmits<{
  submit: [value: { value: string; secondaryValue: string; characters: TextInputCharacterDraft[] } | null];
}>();

const inputRef = ref<TextInputRef>(null);
const isMobile = useMediaQuery('(max-width: 87.5em)');
const expandedIds = ref(new Set<number>());
let nextCharacterId = 0;

const dialogClass = computed(() => ['cv-confirm-dialog', 'cv-text-input-dialog', { [DARK_CLASS]: props.darkMode }]);
const hasSecondaryField = computed(() => Boolean(props.secondaryLabel));
const dialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '32rem', maxHeight: 'calc(100vh - 2rem)' }
    : { width: '42rem', maxWidth: 'calc(100vw - 3rem)', maxHeight: 'calc(100vh - 3rem)' },
);
const contentStyle = { overflow: 'hidden' } as const;

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
        }
      : null,
  );
}

/**
 * 桌面端聚焦文本输入框
 */
function focusInput(): void {
  syncCharacterIdSeed();
  if (isMobile.value) return;
  nextTick(() => {
    const el = getTextInputElement();
    el?.focus();
    el?.select();
  });
}

/**
 * 读取 PrimeVue Textarea 对应的原生元素
 * @returns 文本框元素
 */
function getTextInputElement(): HTMLTextAreaElement | null {
  const el = inputRef.value instanceof HTMLElement ? inputRef.value : inputRef.value?.$el;
  return el instanceof HTMLTextAreaElement ? el : null;
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
