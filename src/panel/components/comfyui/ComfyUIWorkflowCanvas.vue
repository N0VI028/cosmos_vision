<template>
  <div ref="rootEl" class="cv-workflow-canvas" @wheel.prevent="onWheel" @pointerdown="onPointerDown">
    <div class="cv-workflow-canvas__viewport" :style="viewportStyle">
      <svg class="cv-workflow-canvas__edges" :width="layout.width" :height="layout.height">
        <path
          v-for="edge in layout.edges"
          :key="edge.id"
          class="cv-workflow-canvas__edge"
          :d="edgePath(edge)"
          fill="none"
        />
      </svg>
      <button
        v-for="node in layout.nodes"
        :key="node.id"
        type="button"
        class="cv-workflow-canvas__node"
        :class="{ 'is-selected': node.id === selectedNodeId }"
        :style="nodeStyle(node)"
        @click.stop="emit('select', node.id)"
      >
        <span class="cv-workflow-canvas__node-title">{{ node.title }}</span>
        <span class="cv-workflow-canvas__node-id">#{{ node.id }}</span>
      </button>
    </div>
    <div v-if="!layout.nodes.length" class="cv-workflow-canvas__empty">无可显示节点</div>
  </div>
</template>

<script setup lang="ts">
import type { ComfyUIGraphEdge, ComfyUILayoutNode, ComfyUIWorkflowLayout } from '@/services/comfyui/types';

const props = defineProps<{
  layout: ComfyUIWorkflowLayout;
  selectedNodeId: string | null;
}>();

const emit = defineEmits<{
  select: [nodeId: string];
}>();

const rootEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const dragging = ref(false);
const lastPointer = ref({ x: 0, y: 0 });

const viewportStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  width: `${props.layout.width}px`,
  height: `${props.layout.height}px`,
}));

/**
 * 适配视图到容器
 */
function fitView(): void {
  const el = rootEl.value;
  if (!el || !props.layout.width || !props.layout.height) return;
  const pad = 24;
  const sx = (el.clientWidth - pad * 2) / props.layout.width;
  const sy = (el.clientHeight - pad * 2) / props.layout.height;
  const next = Math.min(Math.max(Math.min(sx, sy), 0.2), 2);
  scale.value = next;
  offsetX.value = (el.clientWidth - props.layout.width * next) / 2;
  offsetY.value = (el.clientHeight - props.layout.height * next) / 2;
}

/**
 * 计算节点样式
 * @param node 布局节点
 * @returns 定位样式
 */
function nodeStyle(node: ComfyUILayoutNode): Record<string, string> {
  return {
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${node.width}px`,
    height: `${node.height}px`,
  };
}

/**
 * 计算边路径
 * @param edge 图边
 * @returns SVG path
 */
function edgePath(edge: ComfyUIGraphEdge): string {
  const source = props.layout.nodes.find(node => node.id === edge.sourceNodeId);
  const target = props.layout.nodes.find(node => node.id === edge.targetNodeId);
  if (!source || !target) return '';
  const x1 = source.x + source.width;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * 滚轮缩放
 * @param event 滚轮事件
 */
function onWheel(event: WheelEvent): void {
  const delta = event.deltaY > 0 ? 0.9 : 1.1;
  scale.value = Math.min(Math.max(scale.value * delta, 0.2), 2.5);
}

/**
 * 指针按下开始平移
 * @param event 指针事件
 */
function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest('.cv-workflow-canvas__node')) return;
  dragging.value = true;
  lastPointer.value = { x: event.clientX, y: event.clientY };
  const el = rootEl.value;
  el?.setPointerCapture(event.pointerId);
  el?.addEventListener('pointermove', onPointerMove);
  el?.addEventListener('pointerup', onPointerUp);
}

/**
 * 指针移动平移画布
 * @param event 指针事件
 */
function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  offsetX.value += event.clientX - lastPointer.value.x;
  offsetY.value += event.clientY - lastPointer.value.y;
  lastPointer.value = { x: event.clientX, y: event.clientY };
}

/**
 * 指针抬起结束平移
 * @param event 指针事件
 */
function onPointerUp(event: PointerEvent): void {
  dragging.value = false;
  const el = rootEl.value;
  el?.releasePointerCapture(event.pointerId);
  el?.removeEventListener('pointermove', onPointerMove);
  el?.removeEventListener('pointerup', onPointerUp);
}

defineExpose({ fitView });

watch(
  () => props.layout,
  () => nextTick(fitView),
  { immediate: true },
);
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-canvas {
  @apply relative overflow-hidden;
  min-height: 16rem;
  height: 18rem;
  border: var(--cv-border-width) solid var(--cv-outline);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container-low);
  cursor: grab;
  touch-action: none;
}

.cv-workflow-canvas:active {
  cursor: grabbing;
}

.cv-workflow-canvas__viewport {
  @apply relative origin-top-left;
  transform-origin: 0 0;
}

.cv-workflow-canvas__edges {
  @apply absolute inset-0 pointer-events-none;
  overflow: visible;
}

.cv-workflow-canvas__edge {
  stroke: color-mix(in srgb, var(--cv-primary-container) 55%, var(--cv-outline));
  stroke-width: 1.5;
}

.cv-workflow-canvas__node {
  @apply absolute flex flex-col items-start justify-center text-left;
  gap: var(--cv-space-xs);
  padding: var(--cv-space-md) var(--cv-space-lg);
  border: var(--cv-border-width) solid var(--cv-outline);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-lowest);
  color: var(--cv-on-surface);
  cursor: pointer;
}

.cv-workflow-canvas__node.is-selected {
  border-color: var(--cv-primary-container);
  background: color-mix(in srgb, var(--cv-primary-container) 16%, var(--cv-surface-container-lowest));
}

.cv-workflow-canvas__node-title {
  @apply truncate w-full;
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
}

.cv-workflow-canvas__node-id {
  font-size: var(--cv-font-size-2xs);
  color: var(--cv-on-surface-variant);
}

.cv-workflow-canvas__empty {
  @apply absolute inset-0 flex items-center justify-center;
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-sm);
}
</style>
