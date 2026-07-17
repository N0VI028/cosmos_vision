<script setup lang="ts">
import { buildInlineActionHostClass } from '@/composables/inlineImageDom';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  InlineGalleryGroupView,
  type InlineGalleryItem,
} from '@/composables/inlineImageGalleryView';
import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrls,
} from '@/composables/inlineGalleryMountActions';
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
  <div class="cv-preview-stage" :class="{ 'has-image': items.length > 0 }">
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
    <div v-else class="cv-preview-placeholder">
      <i class="fa-regular fa-image" />
      <span>{{ placeholder }}</span>
    </div>
  </div>
</template>

<style scoped>
@reference '../../global.css';

.cv-preview-stage {
  @apply w-full overflow-hidden;
  width: 100%;
  min-height: 16rem;
  border: var(--cv-border-width) dashed color-mix(in srgb, var(--p-content-border-color) 78%, transparent);
  border-radius: var(--cv-radius);
  background: color-mix(in srgb, var(--p-content-background) 92%, var(--cv-surface-container-low));
}

.cv-preview-stage.has-image {
  border-style: solid;
  border-color: var(--cv-surface-variant);
}

.cv-preview-placeholder {
  @apply flex flex-col items-center justify-center text-center;
  gap: var(--cv-space-lg);
  min-height: 16rem;
  padding: var(--cv-space-8xl);
  color: var(--cv-on-surface-variant);
}

.cv-preview-placeholder > i {
  font-size: 1.5rem;
  color: color-mix(in srgb, var(--p-primary-color) 60%, var(--cv-on-surface-variant));
}
</style>
