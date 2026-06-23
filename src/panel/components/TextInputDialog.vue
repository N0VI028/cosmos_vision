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
    @show="focusInput"
  >
    <div class="flex w-full flex-col gap-2">
      <div class="cv-confirm-message mb-2">{{ message }}</div>
      <Textarea ref="inputRef" v-model="value" class="w-full custom-scrollbar" :rows="rows" auto-resize />
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

import { DARK_CLASS } from '@/constants/theme';

type TextInputRef = { $el?: HTMLElement } | HTMLElement | null;

const visible = defineModel<boolean>('visible', { required: true });
const value = defineModel<string>('value', { required: true });

const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    rows?: number;
    acceptLabel?: string;
    cancelLabel?: string;
    darkMode?: boolean;
  }>(),
  {
    rows: 4,
    acceptLabel: '确定',
    cancelLabel: '取消',
    darkMode: false,
  },
);

const emit = defineEmits<{
  submit: [value: string | null];
}>();

const inputRef = ref<TextInputRef>(null);
const isMobile = useMediaQuery('(max-width: 66.6667em)');

const dialogClass = computed(() => ['cv-confirm-dialog', { [DARK_CLASS]: props.darkMode }]);
const dialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '26rem' }
    : { width: '24rem', maxWidth: 'calc(100vw - 2rem)' },
);

/**
 * 提交文本输入弹窗结果
 * @param accept 是否确认输入
 */
function submit(accept: boolean): void {
  visible.value = false;
  emit('submit', accept ? value.value.trim() : null);
}

/**
 * 桌面端聚焦文本输入框
 */
function focusInput(): void {
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
</script>
