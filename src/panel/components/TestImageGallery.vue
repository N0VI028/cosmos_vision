<script setup lang="ts">
import { buildInlineActionHostClass } from '@/composables/inlineImageDom';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { InlineGalleryGroupView, type InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import { createTrackedObjectUrl, revokeTrackedObjectUrls } from '@/composables/inlineGalleryMountActions';
import { useSettingsStore } from '@/store/settings';

const props = defineProps<{
  imageBlobs: Blob[];
  snapshot?: InlinePromptSnapshot;
  placeholder: string;
}>();

const settingsStore = useSettingsStore();
const items = ref<InlineGalleryItem[]>([]);
const activeItemId = ref('');
const objectUrls = new Set<string>();

const galleryClass = computed(() =>
  buildInlineActionHostClass('cv-inline-img-wrap cv-inline-favorite-wrap', settingsStore.darkMode),
);

const stageClass = computed(() => [
  'cv-preview-stage w-full min-h-64 overflow-hidden rounded-(--cv-radius)',
  items.value.length > 0
    ? 'border-(length:--cv-border-width) border-solid border-(--cv-surface-variant)'
    : 'border-(length:--cv-border-width) border-dashed border-[color-mix(in_srgb,var(--cvp-content-border-color)_78%,transparent)] bg-[color-mix(in_srgb,var(--cvp-content-background)_92%,var(--cv-surface-container-low))]',
]);

watch(
  () => [props.imageBlobs, props.snapshot] as const,
  ([imageBlobs, snapshot]) => syncGallery(imageBlobs, snapshot),
  { immediate: true },
);

/**
 * 同步测试图片画廊
 * @param imageBlobs 图片数据
 * @param snapshot 提示词快照
 */
function syncGallery(imageBlobs: Blob[], snapshot?: InlinePromptSnapshot): void {
  clearGallery();
  if (!snapshot || !imageBlobs.length) return;
  const createdAt = Date.now();
  items.value = imageBlobs.map((imageBlob, index) => createGalleryItem(imageBlob, snapshot, createdAt, index));
  activeItemId.value = items.value[0]?.id ?? '';
}

/**
 * 构建测试画廊项
 * @param imageBlob 图片数据
 * @param snapshot 提示词快照
 * @param createdAt 生成时间
 * @param index 返回顺序
 * @returns 画廊项
 */
function createGalleryItem(
  imageBlob: Blob,
  snapshot: InlinePromptSnapshot,
  createdAt: number,
  index: number,
): InlineGalleryItem {
  return {
    id: `test-image-${createdAt}-${index}`,
    favoriteId: null,
    slotId: null,
    imageBlob,
    objectUrl: createTrackedObjectUrl(imageBlob, objectUrls),
    promptSnapshot: snapshot,
    createdAt,
  };
}

/**
 * 切换测试画廊焦点图片
 * @param item 画廊项
 */
function selectItem(item: InlineGalleryItem): void {
  activeItemId.value = item.id;
}

/**
 * 清空测试画廊并释放临时地址
 */
function clearGallery(): void {
  revokeTrackedObjectUrls(objectUrls);
  items.value = [];
  activeItemId.value = '';
}

/**
 * 提供只读测试画廊所需的空操作
 */
function noop(): void {}

onBeforeUnmount(clearGallery);
</script>

<template>
  <div :class="stageClass">
    <div v-if="items.length" :class="galleryClass">
      <InlineGalleryGroupView
        :items="items"
        :active-item-id="activeItemId"
        :dark-mode="settingsStore.darkMode"
        :can-generate="false"
        :show-corner-actions="false"
        :is-runtime-enabled="() => true"
        :select-item="selectItem"
        :toggle-favorite="noop"
        :remove-item="noop"
        :generate-last="noop"
        :generate-fresh="noop"
        :generate-with-editable-prompt="noop"
      />
    </div>
    <div
      v-else
      class="flex min-h-64 flex-col items-center justify-center gap-(--cv-space-lg) p-(--cv-space-8xl) text-center text-(--cv-on-surface-variant) [&_i]:text-(length:--cv-font-size-2xl) [&_i]:text-[color-mix(in_srgb,var(--cvp-primary-color)_60%,var(--cv-on-surface-variant))]"
    >
      <i class="fa-regular fa-image" />
      <span>{{ placeholder }}</span>
    </div>
  </div>
</template>
