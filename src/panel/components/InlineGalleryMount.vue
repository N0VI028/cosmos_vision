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
import { removeSlotShortcodeFromMessage } from '@/services/inline-image/slot-bind';

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
const isLost = ref(false);

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
    isLost.value = !items.value.length;
  } catch (error) {
    console.error('[CosmosVision] 加载画廊项失败', error);
    items.value = [];
    isLost.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * 强行删除失效短码并卸载挂载容器
 */
async function onForceDeleteShortcode(): Promise<void> {
  if (!settingsStore.savedSettings.enabled) return;
  try {
    const target = props.mount.anchor.paragraph ?? props.mount.messageId;
    if (target) await removeSlotShortcodeFromMessage(target, props.mount.mountKey.slotId);
    removeMount(props.mount.key, props.mount.messageId);
    toastr.success('已成功移除失效短码并清理占位符');
  } catch (error) {
    console.error('[CosmosVision] 强制删除短码失败', error);
    toastr.error('删除失效短码失败');
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

onBeforeMount(() => {
  // 移除该容器下已经存在的其他画廊元素，防止因为重复挂载而产生多余画廊（与酒馆助手逻辑一致）
  const element = props.mount.element;
  const existing = element.querySelectorAll('.cv-inline-img-wrap');
  existing.forEach(el => el.remove());
});

void reloadItems();
onUnmounted(() => {
  revokeTrackedObjectUrls(objectUrls);
});
</script>

<template>
  <div
    v-if="!loading && (items.length || isLost)"
    :class="hostClass"
  >
    <!-- 图片源文件丢失占位符 -->
    <div v-if="isLost" class="cv-inline-favorite-content">
      <div class="cv-inline-favorite-galleria">
        <div class="cv-inline-favorite-stage">
          <div class="cv-lost-placeholder">
            <div class="cv-lost-warning">
              <span class="cv-lost-icon">⚠️</span>
              <span class="cv-lost-text">此段落绑定的图片源文件已被清理或丢失。</span>
            </div>
            <div class="cv-lost-actions">
              <button
                class="cv-delete-shortcode-btn"
                title="彻底从聊天原文中删除此短码并移除占位符"
                @click="void onForceDeleteShortcode()"
              >
                彻底删除图片定位码
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 正常画廊 -->
    <InlineGalleryGroupView
      v-else
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

<style scoped>
.cv-lost-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 20px;
  background: rgba(255, 193, 7, 0.05);
  border: 1px dashed rgba(255, 193, 7, 0.3);
  border-radius: 8px;
  margin: 8px 0;
  text-align: center;
  gap: 12px;
}

.cv-lost-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ffc107;
  font-size: 14px;
}

.cv-lost-icon {
  font-size: 18px;
}

.cv-lost-text {
  font-weight: 500;
  opacity: 0.9;
}

.cv-delete-shortcode-btn {
  display: inline-block;
  outline: none;
  border: 1px solid rgba(220, 53, 69, 0.3) !important;
  background: rgba(220, 53, 69, 0.15) !important;
  color: #dc3545 !important;
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  line-height: 1.4;
  text-align: center;
  transition: all 0.2s ease;
  margin: 0;
  box-shadow: none;
}

.cv-delete-shortcode-btn:hover {
  background: rgba(220, 53, 69, 0.3) !important;
  border-color: rgba(220, 53, 69, 0.6) !important;
  color: #ff4d5a !important;
  box-shadow: 0 0 8px rgba(220, 53, 69, 0.2);
}

.cv-delete-shortcode-btn:active {
  transform: scale(0.98);
}
</style>
