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
    <div class="cv-text-input-dialog__body">
      <div class="cv-confirm-message mb-2">{{ message }}</div>
      <div class="cv-text-input-dialog__field">
        <label v-if="primaryLabel" class="cv-text-input-dialog__label">{{ primaryLabel }}</label>
        <Textarea
          ref="inputRef"
          v-model="value"
          class="cv-text-input-dialog__textarea custom-scrollbar"
          :rows="rows"
        />
      </div>
      <div v-if="hasSecondaryField" class="cv-text-input-dialog__field cv-text-input-dialog__field--secondary">
        <label class="cv-text-input-dialog__label">{{ secondaryLabel }}</label>
        <Textarea
          v-model="secondaryValue"
          class="cv-text-input-dialog__textarea custom-scrollbar"
          :rows="secondaryRows"
        />
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

import { DARK_CLASS } from '@/constants/theme';

type TextInputRef = { $el?: HTMLElement } | HTMLElement | null;

const visible = defineModel<boolean>('visible', { required: true });
const value = defineModel<string>('value', { required: true });
const secondaryValue = defineModel<string>('secondaryValue', { default: '' });

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
  }>(),
  {
    primaryLabel: '',
    secondaryLabel: '',
    rows: 4,
    secondaryRows: 4,
    acceptLabel: '确定',
    cancelLabel: '取消',
    darkMode: false,
  },
);

const emit = defineEmits<{
  submit: [value: { value: string; secondaryValue: string } | null];
}>();

const inputRef = ref<TextInputRef>(null);
const isMobile = useMediaQuery('(max-width: 66.6667em)');

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
  emit('submit', accept ? { value: value.value.trim(), secondaryValue: secondaryValue.value.trim() } : null);
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

<style scoped>
@reference '../../global.css';

.cv-text-input-dialog__body {
  @apply flex w-full flex-col overflow-hidden;
  gap: var(--cv-space-3xl);
  max-height: min(68vh, 34rem);
}

.cv-text-input-dialog__field {
  @apply flex min-h-0 flex-col;
  gap: var(--cv-space-sm);
}

.cv-text-input-dialog__label {
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
  line-height: 1.4;
}

.cv-text-input-dialog__textarea {
  @apply w-full overflow-y-auto;
  min-height: 7rem;
  max-height: min(28vh, 14rem);
  resize: none;
  overscroll-behavior: contain;
}

.cv-text-input-dialog__field--secondary .cv-text-input-dialog__textarea {
  min-height: 5.5rem;
  max-height: min(24vh, 12rem);
}

:deep(.cv-text-input-dialog .p-dialog-content) {
  overflow: hidden;
}
</style>
