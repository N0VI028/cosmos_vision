<template>
  <div
    ref="thumbEl"
    class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--cv-radius-sm) bg-(--cv-surface-container-high)"
  >
    <img
      v-if="state === 'ready'"
      :src="previewUrl"
      :alt="props.loraName"
      class="size-full object-cover"
      @error="state = 'error'"
    />
    <i
      v-else-if="state === 'error'"
      class="fa-solid fa-image text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      aria-hidden="true"
    />
    <i
      v-else
      class="fa-solid fa-image animate-pulse text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';
import { fetchComfyUILoraPreviewUrl } from '@/services/comfyui/lora-preview';

type ThumbState = 'idle' | 'loading' | 'ready' | 'error';

/** 预览图地址缓存（key: `${comfyuiUrl}|${loraName}`） */
const previewUrlCache = new Map<string, string | null>();
/** in-flight 请求去重 */
const inFlightRequests = new Map<string, Promise<string | null>>();

const props = defineProps<{
  /** ComfyUI 服务地址 */
  comfyuiUrl: string;
  /** LoRA 名称 */
  loraName: string;
}>();

const thumbEl = ref<HTMLElement | null>(null);
const state = ref<ThumbState>('idle');
const previewUrl = ref('');

useIntersectionObserver(
  thumbEl,
  ([entry]) => {
    if (entry?.isIntersecting) void loadPreview();
  },
  { rootMargin: '96px' },
);

/**
 * 懒加载预览图：进入视口后取缓存或发起请求，失败/无图统一落错误态
 */
async function loadPreview(): Promise<void> {
  if (state.value === 'ready' || state.value === 'error') return;
  const key = `${props.comfyuiUrl}|${props.loraName}`;
  const cached = previewUrlCache.get(key);
  if (cached !== undefined) {
    applyResult(cached, key);
    return;
  }

  state.value = 'loading';
  const promise =
    inFlightRequests.get(key) ??
    fetchComfyUILoraPreviewUrl(props.comfyuiUrl, props.loraName)
      .catch(() => null)
      .finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, promise);
  applyResult(await promise, key);
}

/**
 * 将请求结果应用到组件状态并写入缓存
 * @param url 预览图地址，null 表示无图或失败
 * @param key 缓存键
 */
function applyResult(url: string | null, key: string): void {
  if (url) {
    state.value = 'ready';
    previewUrl.value = url;
  } else {
    state.value = 'error';
  }
  previewUrlCache.set(key, url);
}
</script>
