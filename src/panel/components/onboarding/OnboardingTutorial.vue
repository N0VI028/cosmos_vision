<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import FocusTrap from 'primevue/focustrap';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type CSSProperties } from 'vue';

import { DARK_CLASS } from '@/constants/default-settings';
import {
  TUTORIAL_SOURCE_OPTIONS,
  type TutorialSource,
  type TutorialStep,
} from '@/panel/components/onboarding/tutorial-steps';
import {
  calculateCenteredCardPosition,
  calculateHighlightRect,
  calculateHoleCornerRadii,
  calculateMaskHolePath,
  calculateTutorialCardPosition,
  readElementBorderRadius,
  readElementRect,
  readTutorialViewport,
  readVisibleElementRect,
  type TutorialRect,
  type TutorialSize,
} from '@/panel/components/onboarding/tutorial-layout';
import { cleanupMockGallery, injectMockGallery, injectMockSelection } from '@/panel/components/onboarding/mock-gallery';
import {
  cleanupMockEntryEditor,
  cleanupMockPerson,
  injectMockEntryEditor,
  injectMockPerson,
} from '@/panel/components/onboarding/mock-person';

interface Props {
  step: TutorialStep;
  selectedSource: TutorialSource | null;
  stepNumber: number;
  totalSteps: number;
  canPrevious: boolean;
  canNext: boolean;
  isLastStep: boolean;
  darkMode: boolean;
}

interface TargetResolution {
  element: HTMLElement | null;
  fallback: boolean;
}

interface InertSnapshot {
  inert: boolean;
  ariaHidden: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'select-source': [source: TutorialSource];
  previous: [];
  next: [];
  exit: [];
}>();

const vFocusTrap = FocusTrap;
const overlayRef = ref<HTMLElement | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const targetElement = shallowRef<HTMLElement | null>(null);
const usingFallback = ref(false);
/** 目标与卡片坐标算完前不显示，避免先居中再跳位闪烁 */
const layoutReady = ref(false);
const viewport = ref<TutorialSize>(readTutorialViewport());
const targetRect = ref<TutorialRect | null>(null);
const maskHoleRect = ref<TutorialRect | null>(null);
const targetRadius = ref('0px');
const cardSize = ref<TutorialSize>({ width: 384, height: 300 });
const inertSnapshots = new Map<HTMLElement, InertSnapshot>();
let trackingFrame = 0;
let lastTrackingSignature = '';
/** 丢弃过期的异步定位结果，避免快速切步时旧布局回写 */
let targetRequestId = 0;

const fallbackText = computed(() => (usingFallback.value ? (props.step.target?.missingText ?? '') : ''));
const highlightRect = computed(() =>
  maskHoleRect.value ? calculateHighlightRect(maskHoleRect.value, viewport.value) : null,
);
const maskPathD = computed(() => {
  const hole = highlightRect.value;
  if (!hole) return '';
  return calculateMaskHolePath(hole, viewport.value, targetRadius.value, targetRect.value);
});
const cardStyle = computed<CSSProperties>(() => {
  const card = cardSize.value;
  const position = targetRect.value
    ? calculateTutorialCardPosition(targetRect.value, viewport.value, card)
    : calculateCenteredCardPosition(viewport.value, card);
  return {
    top: `${position.top}px`,
    left: `${position.left}px`,
    // 先算坐标再显示，避免默认居中位闪现
    visibility: layoutReady.value ? 'visible' : 'hidden',
  };
});
/** fixed 描边框样式：始终完整框住洞口可见区域，被裁剪边画直角直线 */
const ringStyle = computed<CSSProperties>(() => {
  const hole = highlightRect.value;
  if (!hole) return {};
  const radii = calculateHoleCornerRadii(hole, targetRect.value, targetRadius.value);
  return {
    top: `${hole.top}px`,
    left: `${hole.left}px`,
    width: `${hole.width}px`,
    height: `${hole.height}px`,
    borderRadius: `${radii.tl}px ${radii.tr}px ${radii.br}px ${radii.bl}px`,
  };
});

const POINTER_EVENTS = [
  'click',
  'dblclick',
  'contextmenu',
  'pointerdown',
  'pointermove',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchmove',
  'touchend',
  'wheel',
] as const;
const SURFACE_SCROLL_EVENTS = new Set([
  'pointerdown',
  'pointermove',
  'pointerup',
  'touchstart',
  'touchmove',
  'touchend',
  'wheel',
]);

/** 阻断所有穿透到底层页面的指针/滚轮/交互事件（除了对话框表面和目标元素） */
function handleGlobalPointerEvent(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('[data-cv-tutorial-surface]')) {
    if (SURFACE_SCROLL_EVENTS.has(event.type)) event.stopPropagation();
    return;
  }
  if (targetElement.value && target.closest('[data-cv-tutorial-control]')) return;
  if (targetElement.value && targetElement.value.contains(target)) return;
  event.preventDefault();
  event.stopPropagation();
}

POINTER_EVENTS.forEach(evt => useEventListener(window, evt, handleGlobalPointerEvent, { capture: true }));
useEventListener(window, 'resize', refreshLayout, { passive: true });
useEventListener(window.visualViewport, 'resize', refreshLayout, { passive: true });
useEventListener(window.visualViewport, 'scroll', refreshLayout, { passive: true });

/**
 * 读取阶段绑定的可用 Target
 * @param step 教程步骤
 * @returns 目标元素及回退标识
 */
function resolveTutorialTarget(step: TutorialStep): TargetResolution {
  if (!step.target?.selectors) return { element: null, fallback: false };
  for (const selector of step.target.selectors) {
    const el = findVisibleElement(selector);
    if (el) return { element: el, fallback: false };
  }
  return { element: null, fallback: true };
}

/**
 * 在选择器匹配集合中取第一个可见节点
 * @param selector CSS 选择器
 * @returns 可见元素；无可见匹配时返回 null
 */
function findVisibleElement(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisibleElement) ?? null;
}

/**
 * 检查元素是否在当前页面布局中可见
 * @param element 待检查元素
 * @returns 是否可见
 */
function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

/**
 * 等待元素被插入 DOM 并可见
 * @param selector CSS 选择器
 * @param timeoutMs 超时时间
 * @returns 目标元素
 */
async function waitForElement(selector: string, timeoutMs = 3000): Promise<HTMLElement | null> {
  const existing = findVisibleElement(selector);
  if (existing) return existing;
  return new Promise(resolve => {
    const start = performance.now();
    const check = (): void => {
      const el = findVisibleElement(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (performance.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/** 等待下一个渲染帧 */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/**
 * 定位引导卡片焦点到首个 primary 操作或首个 control
 */
function focusPrimaryControl(): void {
  const primary = cardRef.value?.querySelector<HTMLElement>('[data-cv-tutorial-primary]');
  if (primary) {
    primary.focus();
    return;
  }
  const firstControl = cardRef.value?.querySelector<HTMLElement>('[data-cv-tutorial-control]');
  firstControl?.focus();
}

/**
 * 刷新高亮镂空与提示框物理坐标（不改 layoutReady，避免追踪循环提前露出）
 */
function refreshLayout(): void {
  const currentViewport = readTutorialViewport();
  viewport.value = currentViewport;
  if (cardRef.value) {
    const rect = cardRef.value.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      cardSize.value = { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
  }

  const target = targetElement.value;
  if (!target || !target.isConnected) {
    targetRect.value = null;
    maskHoleRect.value = null;
    targetRadius.value = '0px';
    return;
  }

  targetRect.value = readElementRect(target);
  maskHoleRect.value = readVisibleElementRect(target, currentViewport);
  targetRadius.value = readElementBorderRadius(target);
}

/**
 * 比较矩形签名，变动时增量更新布局
 */
function syncBoundsIfChanged(): void {
  if (!layoutReady.value) return;
  const target = targetElement.value;
  const targetBounds = target && target.isConnected ? target.getBoundingClientRect() : null;
  const cardBounds = cardRef.value ? cardRef.value.getBoundingClientRect() : null;
  const currentViewport = readTutorialViewport();
  const signature = [
    currentViewport.width,
    currentViewport.height,
    targetBounds?.top ?? 0,
    targetBounds?.left ?? 0,
    targetBounds?.width ?? 0,
    targetBounds?.height ?? 0,
    cardBounds?.width ?? 0,
    cardBounds?.height ?? 0,
  ]
    .map(Math.round)
    .join(',');
  if (signature === lastTrackingSignature) return;
  lastTrackingSignature = signature;
  refreshLayout();
}

/** 逐帧追踪目标：Message 等提示插入或过渡动画会推移布局，观察器无法完整覆盖 */
function startTrackingLoop(): void {
  stopTrackingLoop();
  const track = (): void => {
    trackingFrame = requestAnimationFrame(track);
    syncBoundsIfChanged();
  };
  trackingFrame = requestAnimationFrame(track);
}

/** 停止逐帧追踪 */
function stopTrackingLoop(): void {
  if (!trackingFrame) return;
  cancelAnimationFrame(trackingFrame);
  trackingFrame = 0;
}

/**
 * 隔离 body 直接子节点的可访问性（支持 inert 的浏览器设 inert，不支持的设 aria-hidden）
 */
function isolateBodyChildren(): void {
  restoreBodyChildren();
  const overlay = overlayRef.value;
  if (!overlay) return;
  const children = Array.from(document.body.children) as HTMLElement[];
  for (const child of children) {
    if (child === overlay || child.contains(overlay)) continue;
    inertSnapshots.set(child, {
      inert: child.inert,
      ariaHidden: child.getAttribute('aria-hidden'),
    });
    child.inert = true;
    child.setAttribute('aria-hidden', 'true');
  }
}

/** 刷新目标元素及步骤模拟 DOM */
async function refreshTarget(): Promise<void> {
  const requestId = ++targetRequestId;
  layoutReady.value = false;

  cleanupMockGallery();
  cleanupMockEntryEditor();

  // 人物配置段内复用模拟人物，离开该段再清理
  if (props.step.needsMockPerson) injectMockPerson();
  else cleanupMockPerson();

  // 条目编辑演示：请求人物页真实打开弹窗并等待渲染
  if (props.step.needsMockEntryEditor) {
    injectMockEntryEditor();
    await waitForElement('[data-cv-tutorial="prompt-profiles-entry-editor"]');
    if (requestId !== targetRequestId) return;
  }

  if (props.step.needsMockSelection) {
    injectMockSelection();
    await nextFrame();
    if (requestId !== targetRequestId) return;
  }

  if (props.step.needsMockGallery) {
    injectMockGallery();
    await nextFrame();
    if (requestId !== targetRequestId) return;
  }

  // 模拟人物展开后，等目标锚点真正可见再定位
  const firstSelector = props.step.target?.selectors?.[0];
  if (props.step.needsMockPerson && firstSelector) {
    await waitForElement(firstSelector);
    if (requestId !== targetRequestId) return;
  }

  const resolution = resolveTutorialTarget(props.step);
  targetElement.value = resolution.element;
  lastTrackingSignature = '';
  usingFallback.value = resolution.fallback;
  resolution.element?.scrollIntoView({ block: 'center', inline: 'nearest' });
  await nextFrame();
  if (requestId !== targetRequestId) return;

  // 内容切换后先量真实卡片尺寸，再按尺寸算最终坐标后显示
  isolateBodyChildren();
  refreshLayout();
  await nextFrame();
  if (requestId !== targetRequestId) return;
  refreshLayout();
  layoutReady.value = true;
  focusPrimaryControl();
}

/** 恢复所有被隔离的 body 根元素 */
function restoreBodyChildren(): void {
  inertSnapshots.forEach(restoreElement);
  inertSnapshots.clear();
}

/** 恢复单个 body 根元素的可访问性状态 */
function restoreElement(snapshot: InertSnapshot, element: HTMLElement): void {
  element.inert = snapshot.inert;
  if (snapshot.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', snapshot.ariaHidden);
}

watch(
  () => props.step,
  () => void refreshTarget(),
  { flush: 'post' },
);
onMounted(() => {
  startTrackingLoop();
  void refreshTarget();
});
onBeforeUnmount(() => {
  stopTrackingLoop();
  restoreBodyChildren();
  cleanupMockGallery();
  cleanupMockEntryEditor();
  cleanupMockPerson();
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="overlayRef"
      class="cv-onboarding cosmos-vision-root fixed inset-0 z-2147482000 h-screen w-screen overflow-hidden pointer-events-auto isolate font-(family-name:--cv-font-body)"
      :class="{ [DARK_CLASS]: darkMode }"
      role="dialog"
      aria-modal="true"
      aria-label="Cosmos Vision 使用教程"
    >
      <!--
        宿主 html 常带 transform 会劫持 fixed 包含块；遮罩/背景用 absolute 贴 overlay，
        overlay 再显式 h/w-screen 撑满视口。
      -->
      <svg
        v-if="layoutReady && highlightRect"
        class="cv-onboarding__mask absolute inset-0 size-full pointer-events-auto"
        aria-hidden="true"
      >
        <path
          :d="maskPathD"
          fill="rgb(5 8 14 / 72%)"
          fill-rule="evenodd"
          clip-rule="evenodd"
        />
      </svg>
      <div
        v-else
        class="cv-onboarding__backdrop absolute inset-0 size-full bg-[rgb(5_8_14/72%)] pointer-events-auto"
        aria-hidden="true"
      />

      <!-- fixed 描边框贴洞口绘制，不受目标滚动容器裁剪；被裁剪边隐藏对应边框 -->
      <div
        v-if="layoutReady && highlightRect"
        class="cv-onboarding__ring absolute z-1 box-border border-2 border-solid border-(--p-primary-color) shadow-[0_0_0_4px_color-mix(in_srgb,var(--p-primary-color)_28%,transparent)] pointer-events-none"
        :style="ringStyle"
        aria-hidden="true"
      />

      <!-- visibility 隐藏仍参与布局，便于先量尺寸再显示，避免居中闪一下再跳位 -->
      <section
        ref="cardRef"
        v-focus-trap="{ autoFocus: true }"
        class="cv-onboarding__card fixed z-2 box-border flex w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex-col gap-(--cv-space-4xl) overflow-y-auto border-(length:--cv-border-width) border-solid border-(--cv-outline) rounded-(--cv-radius-lg) bg-(--cv-surface-container-lowest) p-(--cv-space-7xl) text-(--cv-on-surface) shadow-[0_1.5rem_4rem_rgb(0_0_0/32%)] whitespace-normal wrap-break-word max-[40rem]:max-h-[min(42vh,calc(100vh-2rem))] max-[40rem]:p-(--cv-space-4xl)"
        :style="cardStyle"
        data-cv-tutorial-surface
      >
        <header class="flex items-center justify-between gap-(--cv-space-lg)">
          <span
            class="text-(length:--cv-font-size-xs) font-bold tracking-[0.08em] text-(--cv-on-surface-variant)"
          >新手生图教程</span>
          <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">
            第 {{ stepNumber }} / {{ totalSteps }} 步
          </span>
        </header>

        <div class="flex flex-col gap-(--cv-space-xl)" aria-live="polite">
          <h2
            class="m-0 font-(family-name:--cv-font-headline) text-(length:--cv-font-size-2xl) leading-[1.2]"
          >{{ step.title }}</h2>
          <p class="m-0 whitespace-normal wrap-break-word text-(length:--cv-font-size-md) leading-[1.65] text-(--cv-on-surface-variant)">
            {{ step.description }}
          </p>
          <p
            v-if="step.tip"
            class="m-0 flex items-start gap-(--cv-space-md) rounded-(--cv-radius-md) border border-solid border-[color-mix(in_srgb,var(--p-yellow-500)_35%,transparent)] bg-[color-mix(in_srgb,var(--p-yellow-500)_10%,var(--cv-surface-container-low))] p-(--cv-space-xl) whitespace-normal wrap-break-word text-(length:--cv-font-size-md) leading-[1.65] text-(--cv-on-surface)"
          >
            <i class="fa-solid fa-triangle-exclamation text-[color-mix(in_srgb,var(--p-yellow-500)_90%,#f59e0b)] shrink-0 text-[1.1em] mt-[0.15em]" aria-hidden="true" />
            <span>{{ step.tip }}</span>
          </p>
          <p
            v-if="fallbackText"
            class="m-0 flex items-start gap-(--cv-space-md) rounded-(--cv-radius-md) bg-(--cv-surface-container) p-(--cv-space-xl) whitespace-normal wrap-break-word text-(length:--cv-font-size-md) leading-[1.65] text-(--cv-on-surface-variant)"
          >
            <i class="fa-solid fa-circle-info" aria-hidden="true" />
            <span>{{ fallbackText }}</span>
          </p>
        </div>

        <div
          v-if="step.scene.kind === 'selection'"
          class="grid grid-cols-2 gap-(--cv-space-xl) max-[40rem]:grid-cols-1"
        >
          <Button
            v-for="option in TUTORIAL_SOURCE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :icon="option.icon"
            :severity="selectedSource === option.value ? 'primary' : 'secondary'"
            :outlined="selectedSource !== option.value"
            :aria-pressed="selectedSource === option.value"
            data-cv-tutorial-control
            :data-cv-tutorial-primary="option.value === 'novelai' ? '' : undefined"
            @click="emit('select-source', option.value)"
          />
        </div>

        <footer
          class="flex items-center justify-between gap-(--cv-space-lg) max-[40rem]:flex-col-reverse max-[40rem]:items-stretch"
        >
          <Button
            label="退出"
            icon="fa-solid fa-xmark"
            severity="secondary"
            text
            data-cv-tutorial-control
            @click="emit('exit')"
          />
          <div class="flex items-center gap-(--cv-space-lg) max-[40rem]:w-full max-[40rem]:*:flex-1">
            <Button
              label="上一页"
              icon="fa-solid fa-arrow-left"
              severity="secondary"
              outlined
              :disabled="!canPrevious"
              data-cv-tutorial-control
              @click="emit('previous')"
            />
            <Button
              :label="isLastStep && step.scene.kind !== 'selection' ? '完成' : '下一页'"
              icon="fa-solid fa-arrow-right"
              icon-pos="right"
              :disabled="!canNext"
              data-cv-tutorial-control
              data-cv-tutorial-primary
              @click="emit('next')"
            />
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<!-- 模拟画廊注入到宿主 DOM，必须 unscoped -->
<style>
@import './mock-gallery.css';
</style>
