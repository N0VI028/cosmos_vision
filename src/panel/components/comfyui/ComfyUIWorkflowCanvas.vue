<template>
  <div
    ref="rootEl"
    class="cv-workflow-canvas"
    :style="canvasStyle"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
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
 * 计算画布背景网格的样式
 * 根据当前缩放比例动态计算大网格和细网格的颜色、大小与偏移量
 */
const canvasStyle = computed(() => {
  const showMinorGrid = scale.value > 0.35;
  const showMajorGrid = scale.value > 0.15;

  const majorColor = showMajorGrid ? 'color-mix(in srgb, var(--cv-outline) 14%, transparent)' : 'transparent';
  const minorColor = showMinorGrid ? 'color-mix(in srgb, var(--cv-outline) 6%, transparent)' : 'transparent';

  return {
    '--cv-offset-x': `${offsetX.value}px`,
    '--cv-offset-y': `${offsetY.value}px`,
    '--cv-scale': scale.value,
    '--cv-grid-major-color': majorColor,
    '--cv-grid-minor-color': minorColor,
  };
});

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

/**
 * 定位并居中显示指定节点，若缩放比例过小则调整到合适比例
 * @param nodeId 节点 ID
 */
function focusNode(nodeId: string): void {
  const el = rootEl.value;
  if (!el) return;
  const node = props.layout.nodes.find(n => n.id === nodeId);
  if (!node) return;

  // 保证缩放比例不小于 0.7 以确保节点内容可读
  if (scale.value < 0.7) {
    scale.value = 0.7;
  }

  const containerWidth = el.clientWidth;
  const containerHeight = el.clientHeight;

  offsetX.value = containerWidth / 2 - (node.x + node.width / 2) * scale.value;
  offsetY.value = containerHeight / 2 - (node.y + node.height / 2) * scale.value;
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
