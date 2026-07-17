<template>
  <div
    ref="rootEl"
    class="cv-workflow-canvas"
    :style="canvasStyle"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
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
        :class="nodeStates[node.id]?.classes"
        :style="nodeStyle(node)"
        @click.stop="emit('select', node.id)"
      >
        <span class="cv-workflow-canvas__node-title">
          <i v-if="nodeStates[node.id]?.icon" :class="['cv-workflow-canvas__node-icon', nodeStates[node.id].icon]" aria-hidden="true"></i>
          {{ node.title }}
        </span>
        <span class="cv-workflow-canvas__node-id">#{{ node.id }}</span>
      </button>
    </div>
    <div v-if="!layout.nodes.length" class="cv-workflow-canvas__empty">无可显示节点</div>
  </div>
</template>

<script setup lang="ts">
import { isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { readNodeMeta } from '@/services/comfyui/meta';
import type { ComfyUIGraphEdge, ComfyUILayoutNode, ComfyUIWorkflowLayout, ComfyUIWorkflow } from '@/services/comfyui/types';

const props = defineProps<{
  layout: ComfyUIWorkflowLayout;
  selectedNodeId: string | null;
  workflow?: ComfyUIWorkflow | null;
}>();

/** 节点绑定状态、样式类及对应图标名 */
interface NodeBindingState {
  classes: Record<string, boolean>;
  icon: string;
}

/**
 * 汇总并缓存所有节点的绑定状态、样式类及对应图标名
 */
const nodeStates = computed(() => {
  const states: Record<string, NodeBindingState> = {};
  const workflowObj = props.workflow;

  for (const node of props.layout.nodes) {
    const isSelected = node.id === props.selectedNodeId;
    const defaultState: NodeBindingState = {
      classes: { 'is-selected': isSelected },
      icon: '',
    };

    if (!workflowObj) {
      states[node.id] = defaultState;
      continue;
    }

    const rawNode = workflowObj[node.id];
    if (!rawNode) {
      states[node.id] = defaultState;
      continue;
    }

    const meta = readNodeMeta(rawNode);
    const promptBindings = Object.values(meta.promptBindings ?? {});
    const isLora = isSupportedLoraNode(rawNode);
    const isPositive = promptBindings.includes('positive');
    const isNegative = promptBindings.includes('negative');
    const isImageOutput = !!meta.imageOutput;

    let icon = '';
    if (isLora) icon = 'fa-solid fa-puzzle-piece';
    else if (isPositive) icon = 'fa-solid fa-circle-plus';
    else if (isNegative) icon = 'fa-solid fa-circle-minus';
    else if (isImageOutput) icon = 'fa-solid fa-image';

    states[node.id] = {
      classes: {
        'is-selected': isSelected,
        'is-lora': isLora,
        'is-positive-prompt': isPositive,
        'is-negative-prompt': isNegative,
        'is-image-output': isImageOutput,
      },
      icon,
    };
  }

  return states;
});

const emit = defineEmits<{
  select: [nodeId: string];
}>();

const SCALE_MIN = 0.2;
const SCALE_MAX = 2.5;

const rootEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);

/** 手势会话状态（不驱动模板，无需响应式） */
const pointers = new Map<number, { x: number; y: number }>();
let dragging = false;
let lastX = 0;
let lastY = 0;
let pinch: { dist: number; midX: number; midY: number; scale: number; ox: number; oy: number } | null = null;

const viewportStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  width: `${props.layout.width}px`,
  height: `${props.layout.height}px`,
}));

/**
 * 计算画布背景网格样式（随缩放切换主/次网格可见性）
 */
const canvasStyle = computed(() => {
  const majorColor =
    scale.value > 0.15 ? 'color-mix(in srgb, var(--cv-outline) 14%, transparent)' : 'transparent';
  const minorColor =
    scale.value > 0.35 ? 'color-mix(in srgb, var(--cv-outline) 6%, transparent)' : 'transparent';
  return {
    '--cv-offset-x': `${offsetX.value}px`,
    '--cv-offset-y': `${offsetY.value}px`,
    '--cv-scale': scale.value,
    '--cv-grid-major-color': majorColor,
    '--cv-grid-minor-color': minorColor,
  };
});

/**
 * 将缩放比例钳制在允许范围内
 * @param value 原始比例
 */
function clampScale(value: number): number {
  return Math.min(Math.max(value, SCALE_MIN), SCALE_MAX);
}

/**
 * 以容器内锚点为中心缩放，保持该点下图示不动
 * @param nextScale 目标缩放
 * @param anchorX 锚点本地 X
 * @param anchorY 锚点本地 Y
 */
function zoomAt(nextScale: number, anchorX: number, anchorY: number): void {
  const clamped = clampScale(nextScale);
  const ratio = clamped / scale.value;
  offsetX.value = anchorX - (anchorX - offsetX.value) * ratio;
  offsetY.value = anchorY - (anchorY - offsetY.value) * ratio;
  scale.value = clamped;
}

/**
 * 适配视图到容器
 */
function fitView(): void {
  const el = rootEl.value;
  if (!el || !props.layout.width || !props.layout.height) return;
  const pad = 24;
  const sx = (el.clientWidth - pad * 2) / props.layout.width;
  const sy = (el.clientHeight - pad * 2) / props.layout.height;
  const next = Math.min(Math.max(Math.min(sx, sy), SCALE_MIN), 2);
  scale.value = next;
  offsetX.value = (el.clientWidth - props.layout.width * next) / 2;
  offsetY.value = (el.clientHeight - props.layout.height * next) / 2;
}

/**
 * 计算节点定位样式
 * @param node 布局节点
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
 * 计算边的贝塞尔路径
 * @param edge 图边
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
 * 视口坐标转画布本地坐标
 * @param clientX 视口 X
 * @param clientY 视口 Y
 */
function toLocal(clientX: number, clientY: number): { x: number; y: number } {
  const rect = rootEl.value?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * 读取当前双指间距与中点
 */
function pinchMetrics(): { dist: number; midX: number; midY: number } | null {
  if (pointers.size < 2) return null;
  const [a, b] = [...pointers.values()];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  if (dist < 1) return null;
  const mid = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
  return { dist, midX: mid.x, midY: mid.y };
}

/**
 * 记录双指 pinch 基线并中止单指拖拽
 */
function startPinch(): void {
  const metrics = pinchMetrics();
  if (!metrics) {
    pinch = null;
    return;
  }
  pinch = {
    ...metrics,
    scale: scale.value,
    ox: offsetX.value,
    oy: offsetY.value,
  };
  dragging = false;
}

/**
 * 按双指间距与中点更新缩放与平移
 */
function updatePinch(): void {
  if (!pinch) return;
  const metrics = pinchMetrics();
  if (!metrics) return;
  const nextScale = clampScale(pinch.scale * (metrics.dist / pinch.dist));
  const ratio = nextScale / pinch.scale;
  scale.value = nextScale;
  offsetX.value = metrics.midX - (pinch.midX - pinch.ox) * ratio;
  offsetY.value = metrics.midY - (pinch.midY - pinch.oy) * ratio;
}

/**
 * 捕获指针到画布根节点
 * @param pointerId 指针 ID
 */
function capturePointer(pointerId: number): void {
  try {
    rootEl.value?.setPointerCapture(pointerId);
  } catch {
    // 目标可能已离开
  }
}

/**
 * 释放画布上的指针捕获
 * @param pointerId 指针 ID
 */
function releasePointer(pointerId: number): void {
  const el = rootEl.value;
  if (el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
}

/**
 * 滚轮缩放（指针位置为锚点）
 * @param event 滚轮事件
 */
function onWheel(event: WheelEvent): void {
  const { x, y } = toLocal(event.clientX, event.clientY);
  zoomAt(scale.value * (event.deltaY > 0 ? 0.9 : 1.1), x, y);
}

/**
 * 指针按下：空白处单指平移；双指 pinch；节点上单指仅登记便于后续 pinch
 * @param event 指针事件
 */
function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    for (const id of pointers.keys()) capturePointer(id);
    startPinch();
    return;
  }

  if ((event.target as HTMLElement).closest('.cv-workflow-canvas__node')) return;

  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  capturePointer(event.pointerId);
}

/**
 * 指针移动：单指平移或双指 pinch
 * @param event 指针事件
 */
function onPointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    if (!pinch) startPinch();
    updatePinch();
    return;
  }

  if (!dragging) return;
  offsetX.value += event.clientX - lastX;
  offsetY.value += event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
}

/**
 * 指针抬起/取消：清理会话；空白处单指拖可续接
 * @param event 指针事件
 */
function onPointerUp(event: PointerEvent): void {
  pointers.delete(event.pointerId);
  releasePointer(event.pointerId);

  if (pointers.size >= 2) {
    startPinch();
    return;
  }

  pinch = null;
  if (pointers.size === 1 && dragging) {
    const remaining = [...pointers.values()][0];
    lastX = remaining.x;
    lastY = remaining.y;
    return;
  }
  dragging = false;
}

/**
 * 定位并居中显示指定节点；过小时抬到可读比例
 * @param nodeId 节点 ID
 */
function focusNode(nodeId: string): void {
  const el = rootEl.value;
  if (!el) return;
  const node = props.layout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (scale.value < 0.7) scale.value = 0.7;
  offsetX.value = el.clientWidth / 2 - (node.x + node.width / 2) * scale.value;
  offsetY.value = el.clientHeight / 2 - (node.y + node.height / 2) * scale.value;
}

defineExpose({ fitView, focusNode });

/**
 * 仅拓扑（节点/边 ID）变化时自动适配；改参只换 layout 引用时不重置视口
 */
watch(
  () =>
    `${props.layout.nodes.map(node => node.id).join(',')}|${props.layout.edges.map(edge => edge.id).join(',')}`,
  () => nextTick(fitView),
  { immediate: true },
);
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-canvas {
  @apply relative overflow-hidden w-full h-full;
  border: var(--cv-border-width) solid var(--cv-outline);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container-low);
  background-image:
    linear-gradient(var(--cv-grid-major-color, transparent) 1px, transparent 1px),
    linear-gradient(90deg, var(--cv-grid-major-color, transparent) 1px, transparent 1px),
    linear-gradient(var(--cv-grid-minor-color, transparent) 1px, transparent 1px),
    linear-gradient(90deg, var(--cv-grid-minor-color, transparent) 1px, transparent 1px);
  background-size:
    calc(100px * var(--cv-scale, 1)) calc(100px * var(--cv-scale, 1)),
    calc(100px * var(--cv-scale, 1)) calc(100px * var(--cv-scale, 1)),
    calc(20px * var(--cv-scale, 1)) calc(20px * var(--cv-scale, 1)),
    calc(20px * var(--cv-scale, 1)) calc(20px * var(--cv-scale, 1));
  background-position:
    var(--cv-offset-x, 0px) var(--cv-offset-y, 0px),
    var(--cv-offset-x, 0px) var(--cv-offset-y, 0px),
    var(--cv-offset-x, 0px) var(--cv-offset-y, 0px),
    var(--cv-offset-x, 0px) var(--cv-offset-y, 0px);
  cursor: grab;
  touch-action: none;
}

.cv-workflow-canvas:active {
  cursor: grabbing;
}

.cv-workflow-canvas__viewport {
  @apply relative origin-top-left;
  transform-origin: 0 0;
  touch-action: none;
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
  touch-action: none;
}

.cv-workflow-canvas__node.is-selected {
  border-color: var(--cv-primary-container);
  box-shadow: 0 0 0 1px var(--cv-primary-container);
  background: color-mix(in srgb, var(--cv-primary-container) 16%, var(--cv-surface-container-lowest));
}

.cv-workflow-canvas__node-title {
  @apply truncate w-full flex items-center;
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
}

.cv-workflow-canvas__node-icon {
  margin-right: 0.375rem;
  flex-shrink: 0;
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

/* 特殊绑定节点高亮样式 */

/* Lora 节点 */
.cv-workflow-canvas__node.is-lora {
  border-color: color-mix(in srgb, #9333ea 45%, var(--cv-outline));
  background: linear-gradient(135deg, color-mix(in srgb, #9333ea 8%, var(--cv-surface-container-lowest)), color-mix(in srgb, #9333ea 2%, var(--cv-surface-container-lowest)));
}
.cv-workflow-canvas__node.is-lora .cv-workflow-canvas__node-icon {
  color: #a855f7;
}
.cv-workflow-canvas__node.is-lora.is-selected {
  border-color: #9333ea;
  box-shadow: 0 0 0 1px #9333ea;
  background: color-mix(in srgb, #9333ea 16%, var(--cv-surface-container-lowest));
}
.cv-workflow-canvas__node.is-lora:hover:not(.is-selected) {
  border-color: color-mix(in srgb, #9333ea 70%, var(--cv-outline));
}

/* 正提示词节点 */
.cv-workflow-canvas__node.is-positive-prompt {
  border-color: color-mix(in srgb, #10b981 45%, var(--cv-outline));
  background: linear-gradient(135deg, color-mix(in srgb, #10b981 8%, var(--cv-surface-container-lowest)), color-mix(in srgb, #10b981 2%, var(--cv-surface-container-lowest)));
}
.cv-workflow-canvas__node.is-positive-prompt .cv-workflow-canvas__node-icon {
  color: #10b981;
}
.cv-workflow-canvas__node.is-positive-prompt.is-selected {
  border-color: #10b981;
  box-shadow: 0 0 0 1px #10b981;
  background: color-mix(in srgb, #10b981 16%, var(--cv-surface-container-lowest));
}
.cv-workflow-canvas__node.is-positive-prompt:hover:not(.is-selected) {
  border-color: color-mix(in srgb, #10b981 70%, var(--cv-outline));
}

/* 负提示词节点 */
.cv-workflow-canvas__node.is-negative-prompt {
  border-color: color-mix(in srgb, #ef4444 45%, var(--cv-outline));
  background: linear-gradient(135deg, color-mix(in srgb, #ef4444 8%, var(--cv-surface-container-lowest)), color-mix(in srgb, #ef4444 2%, var(--cv-surface-container-lowest)));
}
.cv-workflow-canvas__node.is-negative-prompt .cv-workflow-canvas__node-icon {
  color: #ef4444;
}
.cv-workflow-canvas__node.is-negative-prompt.is-selected {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px #ef4444;
  background: color-mix(in srgb, #ef4444 16%, var(--cv-surface-container-lowest));
}
.cv-workflow-canvas__node.is-negative-prompt:hover:not(.is-selected) {
  border-color: color-mix(in srgb, #ef4444 70%, var(--cv-outline));
}

/* 输出图片节点 */
.cv-workflow-canvas__node.is-image-output {
  border-color: color-mix(in srgb, #3b82f6 45%, var(--cv-outline));
  background: linear-gradient(135deg, color-mix(in srgb, #3b82f6 8%, var(--cv-surface-container-lowest)), color-mix(in srgb, #3b82f6 2%, var(--cv-surface-container-lowest)));
}
.cv-workflow-canvas__node.is-image-output .cv-workflow-canvas__node-icon {
  color: #3b82f6;
}
.cv-workflow-canvas__node.is-image-output.is-selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
  background: color-mix(in srgb, #3b82f6 16%, var(--cv-surface-container-lowest));
}
.cv-workflow-canvas__node.is-image-output:hover:not(.is-selected) {
  border-color: color-mix(in srgb, #3b82f6 70%, var(--cv-outline));
}
</style>
