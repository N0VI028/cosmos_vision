<script setup lang="ts">
import {
  InlineGalleryGroupView,
  type InlineGalleryItem,
} from '@/composables/inlineImageGalleryView';
import {
  invokeDownload,
  invokeGenerateEditable,
  invokeGenerateFresh,
  invokeGenerateLast,
  loadMountGalleryItems,
  removeMountItem,
  revokeTrackedObjectUrls,
  sessionItemToGalleryItem,
  toggleMountFavorite,
} from '@/composables/inlineGalleryMountActions';
import { buildInlineActionHostClass } from '@/composables/inlineImageDom';
import type { GalleryMountRuntime } from '@/store/gallery-runtimes';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { useSettingsStore } from '@/store/settings';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  mount: GalleryMountRuntime;
}>();

const settingsStore = useSettingsStore();
const { darkMode } = storeToRefs(settingsStore);
const { removeMount } = useGalleryRuntimesStore();

const items = ref<InlineGalleryItem[]>([]);
const activeItemId = ref('');
const loading = ref(true);
const objectUrls = new Set<string>();

/** 画廊宿主 class：随 darkMode 响应式切换 */
const hostClass = computed(() =>
  buildInlineActionHostClass('cv-inline-img-wrap cv-inline-favorite-wrap', darkMode.value),
);

/**
 * 加载 / 重载画廊图片
 */
async function reloadItems(): Promise<void> {
  revokeTrackedObjectUrls(objectUrls);
  loading.value = true;
  try {
    items.value = await loadMountGalleryItems(props.mount, objectUrls);
    activeItemId.value = items.value[0]?.id ?? '';
    if (!items.value.length) removeMount(props.mount.key, props.mount.messageId);
  } catch (error) {
    console.error('[CosmosVision] 加载画廊项失败', error);
    items.value = [];
  } finally {
    loading.value = false;
  }
}
/**
 * 切换焦点图
 * @param item 项
 */
function selectItem(item: InlineGalleryItem): void {
  activeItemId.value = item.id;
}

/**
 * 切换收藏
 * @param item 项
 */
async function onToggleFavorite(item: InlineGalleryItem): Promise<void> {
  if (!settingsStore.savedSettings.enabled) return;
  try {
    await toggleMountFavorite(props.mount, item, items.value);
  } catch (error) {
    console.error('[CosmosVision] 切换段落图片收藏失败', error);
    toastr.error(error instanceof Error ? error.message : '切换段落图片收藏失败');
  }
}

/**
 * 移除图片
 * @param item 项
 */
async function onRemoveItem(item: InlineGalleryItem): Promise<void> {
  if (!settingsStore.savedSettings.enabled) return;
  try {
    const keep = await removeMountItem(props.mount, item, items.value);
    items.value = items.value.filter(candidate => candidate.id !== item.id);
    activeItemId.value = resolveRemovedFocusId(items.value, activeItemId.value);
    if (!keep) items.value = [];
  } catch (error) {
    console.error('[CosmosVision] 删除段落图片失败', error);
    toastr.error('删除段落图片失败');
  }
}

/**
 * 解析删除后的焦点图片
 * @param remaining 剩余图片
 * @param currentId 当前焦点 ID
 * @returns 下一焦点 ID
 */
function resolveRemovedFocusId(remaining: InlineGalleryItem[], currentId: string): string {
  return remaining.some(item => item.id === currentId) ? currentId : (remaining[0]?.id ?? '');
}
/**
 * 把新生成图片直接插入当前画廊并切换焦点
 * @param item 新生成会话项
 */
function appendGeneratedItem(item: NonNullable<GalleryMountRuntime['generatedItem']>): void {
  if (items.value.some(candidate => candidate.id === item.id)) return;
  const galleryItem = sessionItemToGalleryItem(item, objectUrls);
  items.value = [galleryItem, ...items.value];
  activeItemId.value = galleryItem.id;
}

watch(
  () => props.mount.generatedItem,
  item => {
    if (item) appendGeneratedItem(item);
  },
);

void reloadItems();
onUnmounted(() => {
  revokeTrackedObjectUrls(objectUrls);
});
</script>

<template>
  <div
    v-if="!loading && items.length"
    :class="hostClass"
  >
    <InlineGalleryGroupView
      :items="items"
      :active-item-id="activeItemId"
      :dark-mode="darkMode"
      :can-generate="Boolean(mount.anchor.paragraph)"
      :is-runtime-enabled="() => settingsStore.savedSettings.enabled"
      :select-item="selectItem"
      :toggle-favorite="item => void onToggleFavorite(item)"
      :remove-item="item => void onRemoveItem(item)"
      :generate-last="item => invokeGenerateLast(mount, item)"
      :generate-fresh="() => invokeGenerateFresh(mount)"
      :generate-with-editable-prompt="item => invokeGenerateEditable(mount, item)"
      :download-image="item => invokeDownload(item)"
    />
  </div>
</template>
