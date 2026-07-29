<template>
  <div
    ref="rootEl"
    class="relative h-full w-full cursor-grab overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-outline) bg-(--cv-surface-container-low) active:cursor-grabbing"
    :style="canvasStyle"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="relative origin-top-left" :style="viewportStyle">
      <svg class="pointer-events-none absolute inset-0 overflow-visible" :width="layout.width" :height="layout.height">
        <path
          v-for="edge in layout.edges"
          :key="edge.id"
          :d="edgePath(edge)"
          fill="none"
          stroke="color-mix(in srgb, var(--cv-primary-container) 55%, var(--cv-outline))"
          stroke-width="1.5"
        />
      </svg>
      <button
        v-for="node in layout.nodes"
        :key="node.id"
        type="button"
        class="absolute flex cursor-pointer flex-col items-start justify-center gap-(--cv-space-xs) border border-solid px-(--cv-space-lg) py-(--cv-space-md) text-left text-(--cv-on-surface)"
        :class="nodeStates[node.id]?.classes"
        :style="nodeStyle(node)"
        :data-cv-tutorial="nodeTutorialTarget(node.id)"
        @click.stop="emit('select', node.id)"
      >
        <span class="flex w-full items-center truncate text-(length:--cv-font-size-xs) font-semibold">
          <i
            v-if="nodeStates[node.id]?.icon"
            :class="['mr-1.5 shrink-0', nodeStates[node.id].iconColor, nodeStates[node.id].icon]"
            aria-hidden="true"
          ></i>
          {{ node.title }}
        </span>
        <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">#{{ node.id }}</span>
      </button>
    </div>
    <div
      v-if="!layout.nodes.length"
      class="absolute inset-0 flex items-center justify-center text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
    >
      无可显示节点
    </div>
  </div>
</template>

<script setup lang="ts">
import { isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { readNodeMeta } from '@/services/comfyui/meta';
import type {
  ComfyUIGraphEdge,
  ComfyUILayoutNode,
  ComfyUIWorkflowLayout,
  ComfyUIWorkflow,
} from '@/services/comfyui/types';

const props = defineProps<{
  layout: ComfyUIWorkflowLayout;
  selectedNodeId: string | null;
  workflow?: ComfyUIWorkflow | null;
}>();

/** 节点绑定状态、样式类及对应图标 */
interface NodeBindingState {
  classes: string;
  icon: string;
  iconColor: string;
}

/** 默认节点表面（与主题态互斥，避免 Tailwind 同属性冲突） */
const NODE_DEFAULT = 'rounded-(--cv-radius-sm) border-(--cv-outline) bg-(--cv-surface-container-lowest)';

const NODE_SELECTED =
  'rounded-(--cv-radius-sm) border-(--cv-primary-container) bg-[color-mix(in_srgb,var(--cv-primary-container)_16%,var(--cv-surface-container-lowest))] shadow-[0_0_0_1px_var(--cv-primary-container)]';

const NODE_THEMES = {
  lora: {
    idle: 'rounded-(--cv-radius-sm) border-[color-mix(in_srgb,var(--cvp-purple-500)_45%,var(--cv-outline))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cvp-purple-500)_8%,var(--cv-surface-container-lowest)),color-mix(in_srgb,var(--cvp-purple-500)_2%,var(--cv-surface-container-lowest)))] hover:border-[color-mix(in_srgb,var(--cvp-purple-500)_70%,var(--cv-outline))]',
    selected:
      'rounded-(--cv-radius-sm) border-(--cvp-purple-500) bg-[color-mix(in_srgb,var(--cvp-purple-500)_16%,var(--cv-surface-container-lowest))] shadow-[0_0_0_1px_var(--cvp-purple-500)]',
    icon: 'text-(--cvp-purple-400)',
  },
  positive: {
    idle: 'rounded-(--cv-radius-sm) border-[color-mix(in_srgb,var(--cvp-green-500)_45%,var(--cv-outline))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cvp-green-500)_8%,var(--cv-surface-container-lowest)),color-mix(in_srgb,var(--cvp-green-500)_2%,var(--cv-surface-container-lowest)))] hover:border-[color-mix(in_srgb,var(--cvp-green-500)_70%,var(--cv-outline))]',
    selected:
      'rounded-(--cv-radius-sm) border-(--cvp-green-500) bg-[color-mix(in_srgb,var(--cvp-green-500)_16%,var(--cv-surface-container-lowest))] shadow-[0_0_0_1px_var(--cvp-green-500)]',
    icon: 'text-(--cvp-green-500)',
  },
  negative: {
    idle: 'rounded-(--cv-radius-sm) border-[color-mix(in_srgb,var(--cvp-red-500)_45%,var(--cv-outline))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cvp-red-500)_8%,var(--cv-surface-container-lowest)),color-mix(in_srgb,var(--cvp-red-500)_2%,var(--cv-surface-container-lowest)))] hover:border-[color-mix(in_srgb,var(--cvp-red-500)_70%,var(--cv-outline))]',
    selected:
      'rounded-(--cv-radius-sm) border-(--cvp-red-500) bg-[color-mix(in_srgb,var(--cvp-red-500)_16%,var(--cv-surface-container-lowest))] shadow-[0_0_0_1px_var(--cvp-red-500)]',
    icon: 'text-(--cvp-red-500)',
  },
  image: {
    idle: 'rounded-(--cv-radius-sm) border-[color-mix(in_srgb,var(--cvp-blue-500)_45%,var(--cv-outline))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cvp-blue-500)_8%,var(--cv-surface-container-lowest)),color-mix(in_srgb,var(--cvp-blue-500)_2%,var(--cv-surface-container-lowest)))] hover:border-[color-mix(in_srgb,var(--cvp-blue-500)_70%,var(--cv-outline))]',
    selected:
      'rounded-(--cv-radius-sm) border-(--cvp-blue-500) bg-[color-mix(in_srgb,var(--cvp-blue-500)_16%,var(--cv-surface-container-lowest))] shadow-[0_0_0_1px_var(--cvp-blue-500)]',
    icon: 'text-(--cvp-blue-500)',
  },
} as const;

const PROMPT_NODE_TUTORIAL_TARGETS = {
  positive: 'comfyui-positive-node',
  negative: 'comfyui-negative-node',
} as const;

/** 返回当前选中绑定节点对应的教程锚点 */
function nodeTutorialTarget(nodeId: string): string | undefined {
  const node = props.workflow?.[nodeId];
  if (nodeId !== props.selectedNodeId || !node) return undefined;
  const meta = readNodeMeta(node);
  if (meta.imageOutput) return 'comfyui-output-node';
  const binding = Object.values(meta.promptBindings ?? {}).find(value => value in PROMPT_NODE_TUTORIAL_TARGETS);
  return binding ? PROMPT_NODE_TUTORIAL_TARGETS[binding] : undefined;
}

/**
 * 汇总并缓存所有节点的绑定状态、样式类及对应图标名
 */
const nodeStates = computed(() => {
  const states: Record<string, NodeBindingState> = {};
  const workflowObj = props.workflow;

  for (const node of props.layout.nodes) {
    const isSelected = node.id === props.selectedNodeId;
    if (!workflowObj?.[node.id]) {
      states[node.id] = {
        classes: isSelected ? NODE_SELECTED : NODE_DEFAULT,
        icon: '',
        iconColor: '',
      };
      continue;
    }

    const rawNode = workflowObj[node.id];
    const meta = readNodeMeta(rawNode);
    const promptBindings = Object.values(meta.promptBindings ?? {});
    const themeKey = resolveNodeThemeKey({
      isLora: isSupportedLoraNode(rawNode),
      isPositive: promptBindings.includes('positive'),
      isNegative: promptBindings.includes('negative'),
      isImageOutput: !!meta.imageOutput,
    });
    states[node.id] = buildNodeState(themeKey, isSelected);
  }

  return states;
});

/**
 * 解析节点主题键
 */
function resolveNodeThemeKey(flags: {
  isLora: boolean;
  isPositive: boolean;
  isNegative: boolean;
  isImageOutput: boolean;
}): keyof typeof NODE_THEMES | null {
  if (flags.isLora) return 'lora';
  if (flags.isPositive) return 'positive';
  if (flags.isNegative) return 'negative';
  if (flags.isImageOutput) return 'image';
  return null;
}

/**
 * 构建节点样式状态
 * @param themeKey 主题键
 * @param isSelected 是否选中
 */
function buildNodeState(themeKey: keyof typeof NODE_THEMES | null, isSelected: boolean): NodeBindingState {
  if (!themeKey) {
    return {
      classes: isSelected ? NODE_SELECTED : NODE_DEFAULT,
      icon: '',
      iconColor: '',
    };
  }
  const theme = NODE_THEMES[themeKey];
  const icons = {
    lora: 'fa-solid fa-puzzle-piece',
    positive: 'fa-solid fa-circle-plus',
    negative: 'fa-solid fa-circle-minus',
    image: 'fa-solid fa-image',
  } as const;
  return {
    classes: isSelected ? theme.selected : theme.idle,
    icon: icons[themeKey],
    iconColor: theme.icon,
  };
}

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
  transformOrigin: '0 0',
  touchAction: 'none',
}));

/**
 * 计算画布背景网格样式（随缩放切换主/次网格可见性）
 */
const canvasStyle = computed(() => {
  const majorColor = scale.value > 0.15 ? 'color-mix(in srgb, var(--cv-outline) 14%, transparent)' : 'transparent';
  const minorColor = scale.value > 0.35 ? 'color-mix(in srgb, var(--cv-outline) 6%, transparent)' : 'transparent';
  const majorSize = `calc(100px * ${scale.value})`;
  const minorSize = `calc(20px * ${scale.value})`;
  const pos = `${offsetX.value}px ${offsetY.value}px`;
  return {
    touchAction: 'none',
    backgroundImage: [
      `linear-gradient(${majorColor} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${majorColor} 1px, transparent 1px)`,
      `linear-gradient(${minorColor} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${minorColor} 1px, transparent 1px)`,
    ].join(', '),
    backgroundSize: [majorSize, majorSize, minorSize, minorSize].map(size => `${size} ${size}`).join(', '),
    backgroundPosition: [pos, pos, pos, pos].join(', '),
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
    touchAction: 'none',
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

  if ((event.target as HTMLElement).closest('button')) return;

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
  () => `${props.layout.nodes.map(node => node.id).join(',')}|${props.layout.edges.map(edge => edge.id).join(',')}`,
  () => nextTick(fitView),
  { immediate: true },
);
</script>
