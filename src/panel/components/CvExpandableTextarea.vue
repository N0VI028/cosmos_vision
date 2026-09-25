<template>
  <div class="relative w-full">
    <Textarea
      ref="fieldRef"
      v-bind="attrs"
      :model-value="modelValue"
      :rows="rows"
      :auto-resize="autoResize"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full resize-none!"
      :class="textareaClass"
      @update:model-value="value => emit('update:modelValue', value ?? '')"
    />
    <button
      type="button"
      class="cv-expandable-trigger"
      title="全屏编辑"
      aria-label="全屏编辑"
      @click="openDialog"
    >
      <i class="fa-solid fa-maximize" aria-hidden="true" />
    </button>
    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="dialogTitle"
      :style="EXPANDABLE_DIALOG_STYLE"
      :content-style="EXPANDABLE_DIALOG_CONTENT_STYLE"
      :pt="EXPANDABLE_DIALOG_PT"
      @hide="handleDialogHide"
    >
      <div class="flex h-full min-h-0 flex-1 flex-col p-(--cv-space-md)">
        <Textarea
          ref="dialogFieldRef"
          :model-value="modelValue"
          class="custom-scrollbar min-h-0 w-full flex-1 resize-none!"
          :placeholder="placeholder"
          :disabled="disabled"
          @update:model-value="value => emit('update:modelValue', value ?? '')"
        />
      </div>
      <template #footer>
        <div class="flex w-full items-center justify-between">
          <Button label="完成" icon="fa-solid fa-check" :fluid="false" @click="dialogVisible = false" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useAttrs } from 'vue';
import {
  EXPANDABLE_DIALOG_CONTENT_STYLE,
  EXPANDABLE_DIALOG_PT,
  EXPANDABLE_DIALOG_STYLE,
} from '@/panel/components/expandable-editor-dialog';
import { getTextareaElement, type TextareaRef } from '@/panel/components/textarea-token-insert';

defineOptions({ inheritAttrs: false });

/**
 * 透传属性与事件：class 与监听器全部落到内部 Textarea，布局与行为保持不变
 */
const attrs = useAttrs();

const props = withDefaults(
  defineProps<{
    /** 输入值（v-model） */
    modelValue: string;
    /** 行数 */
    rows?: number | string;
    /** 是否自动增高 */
    autoResize?: boolean;
    /** 占位提示 */
    placeholder?: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 追加给内部 Textarea 的额外 class */
    textareaClass?: string;
    /** 大窗标题 */
    dialogTitle?: string;
  }>(),
  { rows: 3, autoResize: false, placeholder: '', disabled: false, textareaClass: '', dialogTitle: '编辑内容' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const fieldRef = ref<TextareaRef>(null);
const dialogFieldRef = ref<TextareaRef>(null);
const dialogVisible = ref(false);
/** 打开大窗时记下的光标位置 */
let savedPosition = 0;

/** 内部 Textarea 原生元素（供外部 token 插入等逻辑取用） */
const textareaEl = computed(() => getTextareaElement(fieldRef.value));
defineExpose({ textareaEl });

/**
 * 打开全屏编辑大窗：记录小输入框光标位置并带到大窗
 */
function openDialog(): void {
  const el = textareaEl.value;
  savedPosition = el ? el.selectionStart : props.modelValue.length;
  dialogVisible.value = true;
  void nextTick(() => focusTextarea(readDialogTextareaElement(), savedPosition));
}

/**
 * 关闭大窗：把大窗光标位置带回小输入框
 */
function handleDialogHide(): void {
  const el = readDialogTextareaElement();
  const position = Math.min(el?.selectionStart ?? savedPosition, props.modelValue.length);
  focusTextarea(textareaEl.value, position);
}

/**
 * 读取大窗输入框原生元素
 * @returns 大窗文本框元素
 */
function readDialogTextareaElement(): HTMLTextAreaElement | null {
  return getTextareaElement(dialogFieldRef.value);
}

/**
 * 聚焦输入框并把光标定位到指定位置
 * @param el 目标输入框元素
 * @param position 光标位置
 */
function focusTextarea(el: HTMLTextAreaElement | null, position: number): void {
  if (!el) return;
  el.focus();
  el.setSelectionRange(position, position);
}
</script>
