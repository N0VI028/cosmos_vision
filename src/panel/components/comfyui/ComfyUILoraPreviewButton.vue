<template>
  <span
    class="block min-w-0 flex-1 cursor-pointer overflow-hidden text-(length:--cv-font-size-sm) text-ellipsis whitespace-nowrap transition-colors duration-200 ease-in-out"
    :class="
      props.loraName.trim()
        ? 'hover:text-(--cvp-primary-color)'
        : 'pointer-events-none text-(--cv-on-surface-variant)'
    "
    :aria-label="props.loraName.trim() ? '预览 LoRA' : undefined"
    @pointerenter="onPreviewPointerEnter"
    @pointerleave="onPreviewPointerLeave"
    @click="onPreviewClick"
  >
    {{ formatLoraDisplayName(props.loraName) || '未选择 LoRA' }}
  </span>

  <Popover ref="previewPopoverRef" append-to="body" :base-z-index="3200" @hide="onPopoverHide">
    <div class="flex max-h-[24rem] w-[min(20rem,80vw)] flex-col gap-(--cv-space-sm) p-(--cv-space-xs)">
      <div
        v-if="previewState === 'loading'"
        class="flex items-center justify-center gap-(--cv-space-md) py-(--cv-space-2xl) text-(--cv-on-surface-variant)"
      >
        <i class="fa-solid fa-spinner animate-spin text-(length:--cv-font-size-base)" aria-hidden="true" />
        <span class="text-(length:--cv-font-size-xs)">正在加载预览图…</span>
      </div>
      <img
        v-else-if="previewState === 'ready'"
        :src="previewImageUrl"
        :alt="loraName.trim()"
        class="max-h-[20rem] w-full rounded-(--cv-radius-sm) object-contain"
        @error="onPreviewImageError"
      />
      <div
        v-else
        class="flex flex-col items-center justify-center gap-(--cv-space-sm) py-(--cv-space-xl) text-center text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      >
        <i class="fa-solid fa-circle-exclamation text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)" aria-hidden="true" />
        <span class="break-words">{{ previewErrorMessage }}</span>
      </div>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import Popover, { type PopoverMethods } from 'primevue/popover';
import { openInlineImageLightbox } from '@/composables/inlineImageLightbox';
import { fetchComfyUILoraPreviewUrl } from '@/services/comfyui/lora-preview';
import { formatLoraDisplayName } from '@/services/comfyui/lora-presets';

defineOptions({
  inheritAttrs: false,
});

type PreviewState = 'loading' | 'ready' | 'error';

const props = defineProps<{
  /** ComfyUI 服务地址 */
  comfyuiUrl: string;
  /** LoRA 名称 */
  loraName: string;
}>();

const previewPopoverRef = ref<PopoverMethods | null>(null);
const isPreviewOpen = ref(false);
const previewState = ref<PreviewState>('loading');
const previewImageUrl = ref('');
const previewErrorMessage = ref('');

const previewUrlCache = new Map<string, string | { error: string } | null>();
const inFlightRequests = new Map<string, Promise<string | { error: string } | null>>();

let lastTouchClickTime = 0;
let isUnmounted = false;

onUnmounted(() => {
  isUnmounted = true;
});

/** 当前环境是否支持鼠标悬停能力（用于区分桌面端与移动端触屏交互） */
const supportsHover = window.matchMedia('(hover: hover)').matches;

/**
 * 判断事件是否由触控或手写笔触发
 * @param event 用户输入事件
 * @returns 是否为移动端触控输入
 */
function isMobilePointer(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

/**
 * 将预览结果应用到响应式状态
 * @param result 预览图 URL、错误对象或 null
 */
function applyPreviewResult(result: string | { error: string } | null): void {
  if (typeof result === 'string') {
    previewState.value = 'ready';
    previewImageUrl.value = result;
    previewErrorMessage.value = '';
  } else {
    previewState.value = 'error';
    previewImageUrl.value = '';
    previewErrorMessage.value = result ? result.error : '该 LoRA 暂无预览图';
  }
}

/**
 * 获取或请求 LoRA 预览图（内存缓存与并发去重）
 * @param key 规范化后的 LoRA 名称
 * @returns 预览图 URL、错误对象或 null
 */
async function fetchPreviewWithCache(key: string): Promise<string | { error: string } | null> {
  if (previewUrlCache.has(key)) {
    return previewUrlCache.get(key)!;
  }
  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    const requestUrl = props.comfyuiUrl;
    try {
      const url = await fetchComfyUILoraPreviewUrl(requestUrl, key);
      // 请求期间 ComfyUI 地址被切换时不落缓存，避免旧地址混入新会话
      if (requestUrl === props.comfyuiUrl) previewUrlCache.set(key, url);
      return url;
    } catch (err) {
      const errorResult = { error: (err as Error).message || '获取预览图失败' };
      if (requestUrl === props.comfyuiUrl) previewUrlCache.set(key, errorResult);
      return errorResult;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * 打开 LoRA 预览浮窗（Popover）
 * @param event 触发事件
 */
async function openLoraPreview(event: Event): Promise<void> {
  const key = props.loraName.trim();
  if (!key) return;

  isPreviewOpen.value = true;
  const target = (event.currentTarget || event.target) as HTMLElement | null;
  previewPopoverRef.value?.show(event, target);

  const cached = previewUrlCache.get(key);
  if (cached !== undefined) {
    applyPreviewResult(cached);
    return;
  }

  previewState.value = 'loading';
  previewImageUrl.value = '';
  previewErrorMessage.value = '';

  const result = await fetchPreviewWithCache(key);
  if (isUnmounted || !isPreviewOpen.value) return;
  applyPreviewResult(result);
}

/**
 * 关闭 LoRA 预览浮窗并重置当前打开状态
 */
function closeLoraPreview(): void {
  previewPopoverRef.value?.hide();
  isPreviewOpen.value = false;
}

/**
 * 打开 LoRA 灯箱大图
 */
async function openLightboxForLora(): Promise<void> {
  const key = props.loraName.trim();
  if (!key) return;

  const result = await fetchPreviewWithCache(key);
  if (isUnmounted) return;
  if (typeof result === 'string') {
    closeLoraPreview();
    openInlineImageLightbox(result);
  }
}

/**
 * 鼠标悬停进入预览按钮
 * @param event 指针事件
 */
function onPreviewPointerEnter(event: PointerEvent): void {
  if (isMobilePointer(event)) return;
  void openLoraPreview(event);
}

/**
 * 鼠标离开预览按钮
 * @param event 指针事件
 */
function onPreviewPointerLeave(event: PointerEvent): void {
  if (isMobilePointer(event)) return;
  closeLoraPreview();
}

/**
 * 处理预览按钮点击（区分桌面端单击与移动端触屏单击/双击）
 * @param event 点击事件
 */
function onPreviewClick(event: MouseEvent | PointerEvent): void {
  if (supportsHover) {
    void openLightboxForLora();
    return;
  }

  const now = Date.now();
  const isDoubleClick = now - lastTouchClickTime < 300;

  if (isDoubleClick) {
    lastTouchClickTime = 0;
    void openLightboxForLora();
  } else {
    lastTouchClickTime = now;
    void openLoraPreview(event);
  }
}

/**
 * 预览图图片元素加载失败回调
 */
function onPreviewImageError(): void {
  previewState.value = 'error';
  previewErrorMessage.value = '预览图加载失败（缓存地址可能已失效）';
}

/**
 * Popover 关闭时的清理回调
 */
function onPopoverHide(): void {
  isPreviewOpen.value = false;
}

watch(
  () => props.comfyuiUrl,
  () => {
    previewUrlCache.clear();
  },
);
</script>
