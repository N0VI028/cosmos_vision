<template>
  <Teleport to="body">
    <div
      ref="overlayRef"
      class="cv-onboarding cosmos-vision-root"
      :class="{ [DARK_CLASS]: darkMode }"
      role="dialog"
      aria-modal="true"
      aria-label="Cosmos Vision 使用教程"
    >
      <svg v-if="highlightRect" class="cv-onboarding__mask" aria-hidden="true">
        <path :d="maskPathD" fill-rule="evenodd" clip-rule="evenodd" />
      </svg>
      <div v-else class="cv-onboarding__backdrop" aria-hidden="true" />

      <!-- fixed 描边框贴洞口绘制，不受目标滚动容器裁剪；被裁剪边隐藏对应边框 -->
      <div v-if="highlightRect" class="cv-onboarding__ring" :style="ringStyle" aria-hidden="true" />

      <section
        ref="cardRef"
        v-focus-trap="{ autoFocus: true }"
        class="cv-onboarding__card"
        :style="cardStyle"
        data-cv-tutorial-surface
      >
        <header class="cv-onboarding__header">
          <span class="cv-onboarding__eyebrow">新手生图教程</span>
          <span class="cv-onboarding__progress">第 {{ stepNumber }} / {{ totalSteps }} 步</span>
        </header>

        <div class="cv-onboarding__content" aria-live="polite">
          <h2>{{ step.title }}</h2>
          <p>{{ step.description }}</p>
          <p v-if="fallbackText" class="cv-onboarding__fallback">
            <i class="fa-solid fa-circle-info" aria-hidden="true" />
            <span>{{ fallbackText }}</span>
          </p>
        </div>

        <div v-if="step.scene.kind === 'selection'" class="cv-onboarding__sources">
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

        <footer class="cv-onboarding__footer">
          <Button
            label="退出"
            icon="fa-solid fa-xmark"
            severity="secondary"
            text
            data-cv-tutorial-control
            @click="emit('exit')"
          />
          <div class="cv-onboarding__navigation">
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

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import FocusTrap from 'primevue/focustrap';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type CSSProperties } from 'vue';

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
const viewport = ref<TutorialSize>(readTutorialViewport());
const targetRect = ref<TutorialRect | null>(null);
const maskHoleRect = ref<TutorialRect | null>(null);
const targetRadius = ref('0px');
const cardSize = ref<TutorialSize>({ width: 384, height: 300 });
const inertSnapshots = new Map<HTMLElement, InertSnapshot>();
let trackingFrame = 0;
let lastTrackingSignature = '';

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
  return { top: `${position.top}px`, left: `${position.left}px` };
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
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

POINTER_EVENTS.forEach(eventName => {
  useEventListener(document, eventName, blockExternalInput, { capture: true, passive: false });
});
useEventListener(document, 'keydown', blockKeyboardInput, { capture: true });
useEventListener(document, 'keyup', blockKeyboardInput, { capture: true });
useEventListener(window, 'resize', refreshLayout, { passive: true });
useEventListener(window.visualViewport, 'resize', refreshLayout, { passive: true });
useEventListener(window.visualViewport, 'scroll', refreshLayout, { passive: true });

/** 阻止教程外的指针、触摸与滚轮输入 */
function blockExternalInput(event: Event): void {
  if (isAllowedExternalInput(event)) return;
  blockEvent(event);
}

/** 阻止教程外的键盘输入与隐式退出 */
function blockKeyboardInput(event: KeyboardEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const control = Boolean(target?.closest('[data-cv-tutorial-control]'));
  const allowed = event.key === 'Tab' || (control && ACTIVATION_KEYS.has(event.key));
  if (allowed) return;
  blockEvent(event);
}

/** 判断全局输入是否属于教程允许区域 */
function isAllowedExternalInput(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const control = Boolean(target?.closest('[data-cv-tutorial-control]'));
  const surfaceScroll = SURFACE_SCROLL_EVENTS.has(event.type) && Boolean(target?.closest('[data-cv-tutorial-surface]'));
  return control || surfaceScroll;
}

/** 彻底阻止事件触发底层界面 */
function blockEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/** 刷新视口尺寸与目标边界 */
function refreshLayout(): void {
  viewport.value = readTutorialViewport();
  updateBounds();
}

/** 同步目标矩形、圆角与卡片尺寸 */
function updateBounds(): void {
  const element = targetElement.value;
  // 卡片贴完整目标；遮罩洞口仍用可见交集，避免滚出面板外
  const fullRect = element ? readElementRect(element) : null;
  const visibleRect = element ? readVisibleElementRect(element, viewport.value) : null;
  targetRect.value = fullRect;
  maskHoleRect.value = visibleRect;
  targetRadius.value = element ? readElementBorderRadius(element) : '0px';
  const card = cardRef.value?.getBoundingClientRect();
  if (card && card.width > 0 && card.height > 0) {
    cardSize.value = { width: Math.round(card.width), height: Math.round(card.height) };
  }
}

/** 解析并滚动到当前教程目标 */
async function refreshTarget(): Promise<void> {
  await nextTick();
  await nextFrame();

  // 清理旧的模拟元素
  cleanupMockGallery();
  cleanupMockEntryEditor();

  // 同步模拟人物：需要时注入草稿，不需要时移除
  if (props.step.needsMockPerson) injectMockPerson();
  else cleanupMockPerson();

  // 如果需要条目编辑演示，请求人物页真实打开弹窗并等待渲染
  if (props.step.needsMockEntryEditor) {
    injectMockEntryEditor();
    await waitForElement('[data-cv-tutorial="prompt-profiles-entry-editor"]');
  }

  // 如果需要模拟选区，先注入
  if (props.step.needsMockSelection) {
    injectMockSelection();
    await nextFrame();
  }

  // 如果需要模拟画廊，先注入
  if (props.step.needsMockGallery) {
    injectMockGallery();
    await nextFrame();
  }

  // 等待模拟人物面板展开渲染
  if (props.step.needsMockPerson) {
    await nextTick();
    await nextFrame();
  }

  const resolution = resolveTutorialTarget(props.step);
  targetElement.value = resolution.element;
  lastTrackingSignature = '';
  usingFallback.value = resolution.fallback;
  resolution.element?.scrollIntoView({ block: 'center', inline: 'nearest' });
  await nextFrame();
  isolateBodyChildren();
  refreshLayout();
  focusPrimaryControl();
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

/** 位置签名未变化时跳过写入，避免每帧触发响应式更新 */
function syncBoundsIfChanged(): void {
  const signature = readTrackingSignature();
  if (signature === lastTrackingSignature) return;
  lastTrackingSignature = signature;
  refreshLayout();
}

/** 读取目标、卡片与视口的位置签名 */
function readTrackingSignature(): string {
  const size = readTutorialViewport();
  const target = targetElement.value?.getBoundingClientRect();
  const card = cardRef.value?.getBoundingClientRect();
  return [
    size.width,
    size.height,
    target?.top ?? -1,
    target?.left ?? -1,
    target?.width ?? -1,
    target?.height ?? -1,
    card?.width ?? 0,
    card?.height ?? 0,
  ]
    .map(Math.round)
    .join(',');
}

/**
 * 按候选选择器解析可见目标
 * @param step 当前教程步骤
 * @returns 目标元素与退化状态
 */
function resolveTutorialTarget(step: TutorialStep): TargetResolution {
  const matches = (step.target?.selectors ?? []).map(findVisibleElement);
  const index = matches.findIndex(Boolean);
  return {
    element: index >= 0 ? matches[index] : null,
    fallback: Boolean(step.target) && index !== 0,
  };
}

/**
 * 查找最后一个可见候选元素
 * @param selector CSS 选择器
 * @returns 可见元素或 null
 */
function findVisibleElement(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisibleElement).at(-1) ?? null;
}

/** 判断元素是否具有可见布局 */
function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

/** 聚焦当前步骤的主要教程控件 */
function focusPrimaryControl(): void {
  const selector = '[data-cv-tutorial-primary]:not([disabled]), [data-cv-tutorial-control]:not([disabled])';
  cardRef.value?.querySelector<HTMLElement>(selector)?.focus();
}

/** 等待浏览器完成一帧布局 */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/**
 * 逐帧等待目标元素出现（限制最大帧数，避免死等）
 * @param selector CSS 选择器
 * @param maxFrames 最大等待帧数
 */
async function waitForElement(selector: string, maxFrames = 30): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    if (findVisibleElement(selector)) return;
    await nextFrame();
  }
}

/** 隔离覆盖层之外的 body 根元素 */
function isolateBodyChildren(): void {
  const overlay = overlayRef.value;
  if (!overlay) return;
  Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(element => element !== overlay && !element.contains(overlay))
    .forEach(isolateElement);
}

/** 保存并隔离单个 body 根元素 */
function isolateElement(element: HTMLElement): void {
  if (inertSnapshots.has(element)) return;
  inertSnapshots.set(element, { inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') });
  element.inert = true;
  element.setAttribute('aria-hidden', 'true');
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

<style scoped>
/* 导入模拟画廊样式 */
@import './mock-gallery.css';

.cv-onboarding {
  position: fixed;
  inset: 0;

  /* SillyTavern 宿主 html 常带 transform + 高度 0，会让 fixed 的 inset 高度算成 0，必须显式撑满视口 */
  width: 100vw;
  height: 100vh;
  z-index: 2147482000;
  overflow: hidden;
  pointer-events: auto;
  isolation: isolate;
  font-family: var(--cv-font-body);
}

/* 相对 overlay 绝对定位：宿主 html 的 transform 会劫持 fixed 包含块导致高度塌 0 */
.cv-onboarding__backdrop,
.cv-onboarding__mask {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.cv-onboarding__backdrop {
  background: rgb(5 8 14 / 72%);
}

/* SVG evenodd 路径：外圈全屏遮罩、内圈按目标圆角挖洞 */
.cv-onboarding__mask path {
  fill: rgb(5 8 14 / 72%);
}

/* 描边框相对 overlay 绝对定位，坐标由 JS 从 fixed 包含块转换 */
.cv-onboarding__ring {
  position: absolute;
  z-index: 1;
  box-sizing: border-box;
  border: 2px solid var(--p-primary-color, #7c9cff);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--p-primary-color, #7c9cff) 28%, transparent);
  pointer-events: none;
}

.cv-onboarding__card {
  position: fixed;
  z-index: 2;
  display: flex;
  width: min(26rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  gap: var(--cv-space-4xl);
  overflow-y: auto;
  box-sizing: border-box;
  padding: var(--cv-space-7xl);
  border: var(--cv-border-width) solid var(--cv-outline);
  border-radius: var(--cv-radius-xl);
  background: var(--cv-surface-container-lowest);
  color: var(--cv-on-surface);
  box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 32%);
}

.cv-onboarding__header,
.cv-onboarding__footer,
.cv-onboarding__navigation {
  display: flex;
  align-items: center;
  gap: var(--cv-space-lg);
}

.cv-onboarding__header,
.cv-onboarding__footer {
  justify-content: space-between;
}

.cv-onboarding__eyebrow,
.cv-onboarding__progress {
  font-size: var(--cv-font-size-xs);
  color: var(--cv-on-surface-variant);
}

.cv-onboarding__eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
}

.cv-onboarding__content {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-onboarding__content h2,
.cv-onboarding__content p {
  margin: 0;
}

.cv-onboarding__content h2 {
  font-family: var(--cv-font-headline);
  font-size: var(--cv-font-size-2xl);
  line-height: 1.2;
}

.cv-onboarding__content p {
  font-size: var(--cv-font-size-md);
  line-height: 1.65;
  color: var(--cv-on-surface-variant);
}

.cv-onboarding__fallback {
  display: flex;
  align-items: flex-start;
  gap: var(--cv-space-md);
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-md);
  background: var(--cv-surface-container);
}

.cv-onboarding__sources {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-xl);
}

@media (max-width: 40rem) {
  .cv-onboarding__card {
    width: min(26rem, calc(100vw - 2rem));
    max-height: min(42vh, calc(100vh - 2rem));
    padding: var(--cv-space-4xl);
  }

  .cv-onboarding__sources {
    grid-template-columns: 1fr;
  }

  .cv-onboarding__footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .cv-onboarding__navigation {
    width: 100%;
  }

  .cv-onboarding__navigation > * {
    flex: 1;
  }
}
</style>

<!-- 模拟画廊样式（非 scoped） -->
<style>
@import './mock-gallery.css';
</style>
