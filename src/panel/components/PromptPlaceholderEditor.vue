<template>
  <div class="cv-placeholder-editor-wrap">
    <div
      ref="editorEl"
      class="cv-placeholder-editor"
      :class="{ 'is-dragging': isDragging }"
      role="textbox"
      aria-multiline="true"
    >
      <span
        ref="beforeEl"
        class="cv-placeholder-text"
        contenteditable="plaintext-only"
        data-part="before"
        @input="syncFromDom"
        @paste.prevent="pastePlainText"
      />
      <span
        ref="tokenEl"
        class="cv-placeholder-token"
        contenteditable="false"
        tabindex="0"
        title="拖动调整 LLM 标签位置"
        aria-label="LLM 标签占位符"
        @pointerdown="startMove"
        @pointermove="movePlaceholder"
        @pointerup="finishMove"
        @pointercancel="cancelMove"
      >
        <span>LLM提取结果</span>
      </span>
      <span
        ref="afterEl"
        class="cv-placeholder-text"
        contenteditable="plaintext-only"
        data-part="after"
        @input="syncFromDom"
        @paste.prevent="pastePlainText"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';

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

const props = defineProps<{ modelValue: PromptPlaceholderValue }>();
const emit = defineEmits<{ 'update:modelValue': [PromptPlaceholderValue] }>();

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
  return fallbackOffsetFromPoint(x);
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

<style scoped>
.cv-placeholder-editor-wrap {
  display: block;
}

.cv-placeholder-editor {
  min-height: 6rem;
  padding: var(--cv-space-3xl);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius-sm);
  background: var(--p-inputtext-background);
  color: var(--p-inputtext-color);
  line-height: 1.5;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.cv-placeholder-editor:focus-within {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--p-primary-color) 45%, transparent);
}

.cv-placeholder-text {
  min-width: 0.5em;
  outline: none;
}

.cv-placeholder-token {
  display: inline-flex;
  align-items: center;
  gap: var(--cv-space-sm);
  min-height: 2rem;
  margin: 0 var(--cv-space-sm);
  padding: 0 var(--cv-space-lg);
  border: var(--cv-border-width) solid color-mix(in srgb, var(--p-primary-color) 60%, var(--p-content-border-color));
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  color: var(--p-primary-color);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.cv-placeholder-token:active {
  cursor: grabbing;
}

.cv-placeholder-editor.is-dragging .cv-placeholder-token {
  opacity: 0.75;
  pointer-events: none;
}

@media (max-width: 40rem) {
  .cv-placeholder-token {
    min-height: 2.25rem;
    padding: 0 var(--cv-space-3xl);
  }
}
</style>
