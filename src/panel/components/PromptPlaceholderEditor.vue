<template>
  <div class="relative" :class="embedded ? 'flex min-h-0 flex-1 flex-col' : 'block'">
    <div
      ref="editorEl"
      class="min-h-24 rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cvp-content-border-color) bg-(--cvp-inputtext-background) p-(--cv-space-3xl) leading-[1.5] wrap-break-word whitespace-pre-wrap text-(--cvp-inputtext-color) outline-none focus-within:border-(--cvp-primary-color) focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--cvp-primary-color)_45%,transparent)]"
      :class="{ 'is-dragging': isDragging, 'flex-1': embedded }"
      role="textbox"
      aria-multiline="true"
    >
      <span
        ref="beforeEl"
        class="min-w-[0.5em] outline-none"
        contenteditable="plaintext-only"
        data-part="before"
        @input="syncFromDom"
        @paste.prevent="pastePlainText"
        @keydown="handleBeforeKeydown"
      />
      <span
        ref="tokenEl"
        class="mx-(--cv-space-sm) inline-flex min-h-5 cursor-grab touch-none items-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-[color-mix(in_srgb,var(--cvp-primary-color)_60%,var(--cvp-content-border-color))] bg-[color-mix(in_srgb,var(--cvp-primary-color)_14%,transparent)] px-(--cv-space-lg) text-(--cvp-primary-color) select-none active:cursor-grabbing"
        :class="{ 'pointer-events-none opacity-75': isDragging }"
        contenteditable="false"
        tabindex="0"
        title="拖动调整 LLM 标签位置"
        aria-label="LLM 标签占位符"
        @pointerdown="startMove"
        @pointermove="movePlaceholder"
        @pointerup="finishMove"
        @pointercancel="cancelMove"
        @keydown="handleTokenKeydown"
      >
        <span>LLM提取结果</span>
      </span>
      <span
        ref="afterEl"
        class="min-w-[0.5em] outline-none"
        contenteditable="plaintext-only"
        data-part="after"
        @input="syncFromDom"
        @paste.prevent="pastePlainText"
        @keydown="handleAfterKeydown"
      />
    </div>
    <button
      v-if="!embedded"
      type="button"
      class="cv-expandable-trigger"
      title="全屏编辑"
      aria-label="全屏编辑"
      @click="openFullscreen()"
    >
      <i class="fa-solid fa-maximize" aria-hidden="true" />
    </button>
    <Dialog
      v-if="!embedded"
      v-model:visible="fullscreenVisible"
      modal
      :show-header="false"
      :style="EXPANDABLE_DIALOG_STYLE"
      :content-style="EXPANDABLE_DIALOG_CONTENT_STYLE"
      :pt="EXPANDABLE_DIALOG_PT"
    >
      <div class="flex h-full min-h-0 flex-1 flex-col p-(--cv-space-md)">
        <PromptPlaceholderEditor
          embedded
          :model-value="modelValue"
          @update:model-value="value => emit('update:modelValue', value)"
        />
      </div>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-(--cv-space-sm)">
          <Button label="取消" text :fluid="false" @click="cancelFullscreen" />
          <Button label="完成" icon="fa-solid fa-check" :fluid="false" @click="fullscreenVisible = false" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';
import {
  EXPANDABLE_DIALOG_CONTENT_STYLE,
  EXPANDABLE_DIALOG_PT,
  EXPANDABLE_DIALOG_STYLE,
} from '@/panel/components/expandable-editor-dialog';

interface PromptPlaceholderValue {
  text: string;
  placeholderOffset: number;
}

interface Point {
  x: number;
  y: number;
}

interface CaretPoint {
  offsetNode: Node;
  offset: number;
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => CaretPoint | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const props = withDefaults(
  defineProps<{
    /** 结构化值（v-model） */
    modelValue: PromptPlaceholderValue;
    /** 是否嵌入大窗内（嵌入实例不再渲染触发按钮，避免递归） */
    embedded?: boolean;
  }>(),
  { embedded: false },
);
const emit = defineEmits<{ 'update:modelValue': [PromptPlaceholderValue] }>();

const fullscreenVisible = ref(false);
/** 打开全屏大窗时的值快照，用于取消回滚 */
let fullscreenSnapshot: PromptPlaceholderValue = { text: '', placeholderOffset: 0 };

const editorEl = ref<HTMLElement | null>(null);
const beforeEl = ref<HTMLElement | null>(null);
const afterEl = ref<HTMLElement | null>(null);
const tokenEl = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const skipNextRender = ref(false);
const pointerId = ref<number | null>(null);
const startPoint = ref<Point | null>(null);
const dragText = ref('');
const draftOffset = ref(0);

const MOVE_THRESHOLD = 6;

watch(
  () => [props.modelValue.text, props.modelValue.placeholderOffset] as const,
  () => {
    if (skipNextRender.value) {
      skipNextRender.value = false;
      return;
    }
    renderValue(props.modelValue);
  },
);

onMounted(() => {
  renderValue(props.modelValue);
});

/**
 * 渲染当前结构化文本
 * @param value 结构化值
 */
function renderValue(value: PromptPlaceholderValue): void {
  const normalized = normalizeValue(value);
  if (beforeEl.value) beforeEl.value.textContent = normalized.text.slice(0, normalized.placeholderOffset);
  if (afterEl.value) afterEl.value.textContent = normalized.text.slice(normalized.placeholderOffset);
}

/**
 * 规范化外部值
 * @param value 原始值
 * @returns 合法结构化值
 */
function normalizeValue(value: PromptPlaceholderValue): PromptPlaceholderValue {
  const text = value.text ?? '';
  return {
    text,
    placeholderOffset: clampImagePromptPlaceholderOffset(text, value.placeholderOffset),
  };
}

/**
 * 打开全屏大窗并快照当前值，供取消时回滚
 */
function openFullscreen(): void {
  fullscreenSnapshot = { ...normalizeValue(props.modelValue) };
  fullscreenVisible.value = true;
}

/**
 * 取消全屏编辑并回滚到打开时的快照（直接 emit，不走 emitValue，确保外层编辑器回渲染快照内容）
 */
function cancelFullscreen(): void {
  emit('update:modelValue', fullscreenSnapshot);
  fullscreenVisible.value = false;
}

/**
 * 从 DOM 同步文本到外部模型
 */
function syncFromDom(): void {
  const before = beforeEl.value?.textContent ?? '';
  const after = afterEl.value?.textContent ?? '';
  emitValue({ text: before + after, placeholderOffset: before.length });
}

/**
 * 提交结构化值
 * @param value 结构化值
 */
function emitValue(value: PromptPlaceholderValue): void {
  skipNextRender.value = true;
  emit('update:modelValue', normalizeValue(value));
}

/**
 * 处理纯文本粘贴
 * @param event 粘贴事件
 */
function pastePlainText(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain') ?? '';
  insertTextAtSelection(text);
  syncFromDom();
}

/**
 * 开始拖动占位符
 * @param event 指针事件
 */
function startMove(event: PointerEvent): void {
  event.preventDefault();
  pointerId.value = event.pointerId;
  startPoint.value = { x: event.clientX, y: event.clientY };
  dragText.value = readFullText();
  draftOffset.value = normalizeValue(props.modelValue).placeholderOffset;
  tokenEl.value?.setPointerCapture(event.pointerId);
}

/**
 * 移动占位符预览位置
 * @param event 指针事件
 */
function movePlaceholder(event: PointerEvent): void {
  if (event.pointerId !== pointerId.value || !startPoint.value) return;
  if (!isDragging.value && !hasMovedEnough(event, startPoint.value)) return;
  event.preventDefault();
  isDragging.value = true;
  draftOffset.value = getOffsetFromPoint(event.clientX, event.clientY);
  renderValue({ text: dragText.value, placeholderOffset: draftOffset.value });
}

/**
 * 完成占位符拖动
 * @param event 指针事件
 */
function finishMove(event: PointerEvent): void {
  if (event.pointerId !== pointerId.value) return;
  const nextOffset = isDragging.value ? draftOffset.value : normalizeValue(props.modelValue).placeholderOffset;
  tokenEl.value?.releasePointerCapture(event.pointerId);
  resetPointerState();
  emitValue({ text: dragText.value || readFullText(), placeholderOffset: nextOffset });
}

/**
 * 取消占位符拖动
 * @param event 指针事件
 */
function cancelMove(event: PointerEvent): void {
  if (event.pointerId !== pointerId.value) return;
  tokenEl.value?.releasePointerCapture(event.pointerId);
  renderValue(props.modelValue);
  resetPointerState();
}

/**
 * 清理拖动状态
 */
function resetPointerState(): void {
  pointerId.value = null;
  startPoint.value = null;
  isDragging.value = false;
  dragText.value = '';
}

/**
 * 判断拖动距离是否超过阈值
 * @param event 指针事件
 * @param point 起始点
 * @returns 是否进入拖动
 */
function hasMovedEnough(event: PointerEvent, point: Point): boolean {
  return Math.hypot(event.clientX - point.x, event.clientY - point.y) >= MOVE_THRESHOLD;
}

/**
 * 读取完整固定文本
 * @returns 固定文本
 */
function readFullText(): string {
  return `${beforeEl.value?.textContent ?? ''}${afterEl.value?.textContent ?? ''}`;
}

/**
 * 根据屏幕坐标计算占位符位置
 * @param x 屏幕 X
 * @param y 屏幕 Y
 * @returns 占位符 offset
 */
function getOffsetFromPoint(x: number, y: number): number {
  const caret = getCaretFromPoint(x, y);
  if (caret) {
    return clampImagePromptPlaceholderOffset(dragText.value, getOffsetFromNode(caret.offsetNode, caret.offset, x));
  }
  return fallbackOffsetFromPoint(x);
}

/**
 * 读取屏幕坐标对应的浏览器光标位置
 * @param x 屏幕 X
 * @param y 屏幕 Y
 * @returns 光标位置
 */
function getCaretFromPoint(x: number, y: number): CaretPoint | null {
  const doc = document as CaretDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return position;
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { offsetNode: range.startContainer, offset: range.startOffset } : null;
}

/**
 * 把 DOM 节点位置换算为逻辑 offset
 * @param node DOM 节点
 * @param offset 节点内 offset
 * @param x 屏幕 X
 * @returns 逻辑 offset
 */
function getOffsetFromNode(node: Node, offset: number, x = 0): number {
  const before = beforeEl.value;
  const after = afterEl.value;
  if (before?.contains(node)) return getLocalOffset(before, node, offset);
  if (after?.contains(node)) return getBeforeLength() + getLocalOffset(after, node, offset);
  if (editorEl.value?.contains(node)) return getBoundaryOffset(node, offset);
  return fallbackOffsetFromPoint(x);
}

/**
 * 命中徽章本体或编辑器容器时维持占位符当前位置，避免拖动振荡
 * @param node 命中节点
 * @param offset 节点内 offset
 * @returns 逻辑 offset
 */
function getBoundaryOffset(node: Node, offset: number): number {
  if (node === editorEl.value && offset === 0) return 0;
  return getBeforeLength();
}

/**
 * 读取局部文本 offset
 * @param root 文本容器
 * @param node 命中节点
 * @param offset 命中 offset
 * @returns 局部 offset
 */
function getLocalOffset(root: HTMLElement, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return clampImagePromptPlaceholderOffset(root.textContent ?? '', offset);
  }
  return offset <= 0 ? 0 : (root.textContent ?? '').length;
}

/**
 * 粗粒度回退落点
 * @param x 屏幕 X
 * @returns 逻辑 offset
 */
function fallbackOffsetFromPoint(x: number): number {
  const rect = editorEl.value?.getBoundingClientRect();
  if (!rect) return normalizeValue(props.modelValue).placeholderOffset;
  return x < rect.left + rect.width / 2 ? 0 : readFullText().length;
}

/**
 * 把光标放置到元素文本的开头或末尾
 * @param el 目标元素
 * @param position 放置位置
 */
function placeCaret(el: HTMLElement, position: 'start' | 'end'): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(position === 'start');
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
  el.focus();
}

/**
 * before 段按键处理：末尾按 → 直接越过徽章落到 after 开头
 * @param event 键盘事件
 */
function handleBeforeKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowRight') return;
  event.stopPropagation();
  const el = beforeEl.value;
  const selection = window.getSelection();
  if (!el || !selection) return;
  if (selection.focusOffset >= (el.textContent ?? '').length) {
    event.preventDefault();
    if (afterEl.value) placeCaret(afterEl.value, 'start');
  }
}

/**
 * 徽章按键处理：方向键把光标送到前后段，像越过一个字符
 * @param event 键盘事件
 */
function handleTokenKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.stopPropagation();
  if (event.key === 'ArrowRight' && afterEl.value) {
    event.preventDefault();
    placeCaret(afterEl.value, 'start');
  } else if (event.key === 'ArrowLeft' && beforeEl.value) {
    event.preventDefault();
    placeCaret(beforeEl.value, 'end');
  }
}

/**
 * after 段按键处理：开头按 ← 直接越过徽章落到 before 末尾
 * @param event 键盘事件
 */
function handleAfterKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft') return;
  event.stopPropagation();
  const selection = window.getSelection();
  if (!selection) return;
  if (selection.focusOffset <= 0) {
    event.preventDefault();
    if (beforeEl.value) placeCaret(beforeEl.value, 'end');
  }
}

/**
 * 在当前选择区插入纯文本
 * @param text 插入文本
 */
function insertTextAtSelection(text: string): void {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 读取占位符前文本长度
 * @returns 前文本长度
 */
function getBeforeLength(): number {
  return beforeEl.value?.textContent?.length ?? 0;
}
</script>
