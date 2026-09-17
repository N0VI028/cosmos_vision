<template>
  <div class="block">
    <div
      class="min-h-24 rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cvp-content-border-color) bg-(--cvp-inputtext-background) p-(--cv-space-3xl) leading-[1.5] wrap-break-word whitespace-pre-wrap text-(--cvp-inputtext-color) outline-none focus-within:border-(--cvp-primary-color) focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--cvp-primary-color)_45%,transparent)]"
      :class="{ 'is-dragging': isDragging }"
      role="textbox"
      aria-multiline="true"
      @pointerdown="handleContainerPointerDown"
    >
      <span
        ref="beforeEl"
        class="min-w-[0.5em] outline-none"
        contenteditable="plaintext-only"
        data-part="before"
        @input="syncFromDom"
        @paste.prevent="pastePlainText"
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
  const nextOffset = getOffsetFromPoint(event.clientX, event.clientY);
  if (nextOffset === null || nextOffset === draftOffset.value) return;
  draftOffset.value = nextOffset;
  renderValue({ text: dragText.value, placeholderOffset: draftOffset.value });
}

/**
 * 完成占位符拖动
 * @param event 指针事件
 */
function finishMove(event: PointerEvent): void {
  if (event.pointerId !== pointerId.value) return;
  const wasDragging = isDragging.value;
  const nextOffset = wasDragging ? draftOffset.value : normalizeValue(props.modelValue).placeholderOffset;
  tokenEl.value?.releasePointerCapture(event.pointerId);
  resetPointerState();
  if (!wasDragging) focusEditableByTokenSide(event.clientX);
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
 * 容器兜底聚焦：仅点击落在空白区域时把光标交给相邻可编辑区
 * @param event 指针事件
 */
function handleContainerPointerDown(event: PointerEvent): void {
  if (eventPathHits(event, isInsideEditable) || eventPathHits(event, isInsideToken)) return;
  event.preventDefault();
  const caret = getCaretFromPoint(event.clientX, event.clientY);
  if (caret && focusEditableAtCaret(caret)) return;
  focusEditableByTokenSide(event.clientX);
}

/**
 * 判断事件路径中是否有节点满足命中条件
 * @param event 指针事件
 * @param hit 命中判定
 * @returns 是否命中
 */
function eventPathHits(event: PointerEvent, hit: (node: Node) => boolean): boolean {
  return event.composedPath().some((node) => node instanceof Node && hit(node));
}

/**
 * 判断命中节点是否为可编辑区
 * @param node 命中节点
 * @returns 是否属于可编辑区
 */
function isInsideEditable(node: Node): boolean {
  return resolveEditableSpan(node) !== null;
}

/**
 * 判断命中节点是否为徽章（含其内部子元素）
 * @param node 命中节点
 * @returns 是否属于徽章
 */
function isInsideToken(node: Node): boolean {
  return !!tokenEl.value?.contains(node);
}

/**
 * 定位节点所属的可编辑区
 * @param node 命中节点
 * @returns 可编辑区元素
 */
function resolveEditableSpan(node: Node): HTMLElement | null {
  if (beforeEl.value?.contains(node)) return beforeEl.value;
  if (afterEl.value?.contains(node)) return afterEl.value;
  return null;
}

/**
 * 按浏览器光标位置聚焦对应可编辑区
 * @param caret 浏览器光标位置
 * @returns 是否命中可编辑区
 */
function focusEditableAtCaret(caret: CaretPoint): boolean {
  const target = resolveEditableSpan(caret.offsetNode);
  if (!target) return false;
  target.focus();
  const range = document.createRange();
  range.setStart(caret.offsetNode, caret.offset);
  range.collapse(true);
  applySelection(range);
  return true;
}

/**
 * 按点击位置与徽章的关系聚焦相邻可编辑区
 * @param x 屏幕 X
 */
function focusEditableByTokenSide(x: number): void {
  const rect = tokenEl.value?.getBoundingClientRect();
  const onLeft = rect ? x < rect.left : false;
  const target = onLeft ? beforeEl.value : afterEl.value;
  if (!target) return;
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(!onLeft);
  applySelection(range);
}

/**
 * 应用光标选区
 * @param range 目标选区
 */
function applySelection(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
 * @returns 占位符 offset，命中点无法解析时为 null
 */
function getOffsetFromPoint(x: number, y: number): number | null {
  const caret = getCaretFromPoint(x, y);
  if (!caret) return null;
  const offset = getOffsetFromNode(caret.offsetNode, caret.offset);
  return offset === null ? null : clampImagePromptPlaceholderOffset(dragText.value, offset);
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
 * @returns 逻辑 offset，节点不在可编辑区内时为 null
 */
function getOffsetFromNode(node: Node, offset: number): number | null {
  const before = beforeEl.value;
  const after = afterEl.value;
  if (before?.contains(node)) return getLocalOffset(before, node, offset);
  if (after?.contains(node)) return getBeforeLength() + getLocalOffset(after, node, offset);
  return null;
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
