<template>
  <StaticPanel title="图片管理" class="cv-favorite-panel">
    <template #actions>
      <CvMiniButton
        :label="isSelecting ? '取消选择' : '选择'"
        icon="fa-solid fa-check-double"
        :disabled="isSelectionToggleDisabled"
        size="small"
        @click="toggleSelectMode"
      />
    </template>

    <div v-if="loading" class="cv-favorite-grid">
      <CvDataCard v-for="index in 4" :key="index">
        <div class="cv-favorite-card">
          <Skeleton height="100%" class="cv-favorite-skeleton-thumb" :dt="SKELETON_TOKENS" />
          <div class="cv-favorite-card-body">
            <Skeleton height="1rem" width="70%" :dt="SKELETON_TOKENS" />
            <Skeleton height="0.9rem" width="52%" :dt="SKELETON_TOKENS" />
          </div>
        </div>
      </CvDataCard>
    </div>

    <div v-else-if="!items.length" class="cv-favorite-empty">暂无图片数据</div>

    <template v-else>
      <div class="cv-favorite-filter-row">
        <div class="cv-favorite-filter-block">
          <div class="cv-favorite-filter-label">类型</div>
          <Select
            v-model="selectedType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>

        <div class="cv-favorite-filter-block">
          <div class="cv-favorite-filter-label">角色</div>
          <Select
            v-model="selectedCharacterKey"
            :options="characterOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>

        <div class="cv-favorite-filter-block">
          <div class="cv-favorite-filter-label">聊天</div>
          <Select
            v-model="selectedChatId"
            :options="chatOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>
      </div>

      <div v-if="visibleItems.length" class="cv-favorite-grid">
        <CvDataCard
          v-for="item in visibleItems"
          :key="getPreviewUrl(item.key)"
          :selected="isItemSelected(item.key)"
          :selecting="isSelecting"
          :disabled="busy && isSelecting"
          @toggle="toggleItem(item.key)"
        >
          <div class="cv-favorite-card">
            <div
              v-if="isSelecting"
              class="absolute top-(--cv-space-lg) left-(--cv-space-lg) z-1"
              @click.stop
            >
              <Checkbox
                binary
                :model-value="isItemSelected(item.key)"
                :disabled="busy"
                @update:model-value="toggleItem(item.key)"
              />
            </div>

            <div class="cv-favorite-thumb-wrap">
              <span class="cv-favorite-kind-badge" :class="kindBadgeClass(item.kind)">{{ kindLabel(item.kind) }}</span>
              <LightboxImage
                :src="getPreviewUrl(item.key)"
                :snapshot="item.promptSnapshot"
                :download-action="() => $emit('download-items', [item.key])"
                :disabled="isSelecting"
                alt="图片预览"
                class="cv-favorite-thumb"
              />
            </div>

            <div class="cv-favorite-card-body">
              <div class="cv-favorite-title">{{ formatImageLabel(item.createdAt) }}</div>
              <div class="cv-favorite-meta">
                {{ stripPngExtension(item.characterKey) }} · {{ stripPngExtension(item.chatId) }}
              </div>
            </div>

            <div v-if="!isSelecting" class="cv-favorite-actions" @click.stop>
              <CvMiniButton
                class="cv-kind-toggle-button"
                :icon="item.kind === 'favorite' ? 'fa-solid fa-star-half-alt' : 'fa-solid fa-star'"
                :aria-label="kindToggleLabel(item.kind)"
                :title="kindToggleLabel(item.kind)"
                :disabled="busy"
                @click="$emit('toggle-kind', item.key)"
              />
              <CvMiniButton
                icon="fa-solid fa-download"
                aria-label="下载"
                :disabled="busy"
                @click="$emit('download-items', [item.key])"
              />
              <CvMiniButton
                icon="fa-solid fa-trash"
                tone="error"
                aria-label="删除"
                :disabled="busy"
                @click="$emit('delete-items', [item.key])"
              />
            </div>
          </div>
        </CvDataCard>
      </div>
      <div v-else class="cv-favorite-empty">当前筛选范围暂无图片</div>

      <div v-if="isSelecting" class="cv-favorite-batch-bar">
        <span class="cv-favorite-batch-count">已选 {{ selectedCount }} 张</span>
        <div class="cv-favorite-batch-actions">
          <CvMiniButton
            :label="isAllSelected ? '取消全选' : '全选'"
            :disabled="busy || !visibleItems.length"
            size="small"
            @click="toggleSelectAll"
          />
          <CvMiniButton label="下载" :disabled="!selectedCount || busy" size="small" @click="downloadSelected" />
          <CvMiniButton
            label="删除"
            tone="error"
            :disabled="!selectedCount || busy"
            size="small"
            @click="deleteSelected"
          />
          <CvMiniButton label="取消" :disabled="busy" size="small" @click="clearSelection" />
        </div>
      </div>
    </template>
  </StaticPanel>
</template>

<script setup lang="ts">
import type { SkeletonDesignTokens } from '@primeuix/themes/types/skeleton';
import Checkbox from 'primevue/checkbox';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CvDataCard from '@/panel/components/CvDataCard.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import LightboxImage from '@/panel/components/LightboxImage.vue';
import StaticPanel from '@/panel/components/StaticPanel.vue';
import {
  managedChatGroupId,
  type ManagedImageItem,
  type ManagedImageKind,
} from '@/services/inline-image/managed-images';

interface FilterOption {
  label: string;
  value: string;
}

type ManagedTypeFilter = 'all' | ManagedImageKind;

const ALL_CHARACTER_KEY = '__all_character__';
const ALL_CHAT_KEY = '__all_chat__';
const SKELETON_TOKENS = {
  root: {
    borderRadius: 'var(--cv-radius-sm)',
    background: 'var(--cv-surface-container-high)',
    animationBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 68%, var(--cv-surface-container))',
  },
} satisfies SkeletonDesignTokens;

const typeOptions: FilterOption[] = [
  { label: '全部', value: 'all' },
  { label: '收藏', value: 'favorite' },
  { label: '临时', value: 'temporary' },
];

const props = defineProps<{
  items: ManagedImageItem[];
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'download-items': [keys: string[]];
  'delete-items': [keys: string[]];
  'toggle-kind': [key: string];
}>();

const selectedType = ref<ManagedTypeFilter>('all');
const selectedCharacterKey = ref(ALL_CHARACTER_KEY);
const selectedChatId = ref(ALL_CHAT_KEY);
const isSelecting = ref(false);
const selectedKeys = ref<string[]>([]);
const previewUrlMap = ref<Record<string, string>>({});
const objectUrls = new Set<string>();

const typedItems = computed(() => filterItemsByType(props.items, selectedType.value));
const characterOptions = computed(() => buildCharacterOptions(typedItems.value));
const characterItems = computed(() => filterItemsByCharacter(typedItems.value, selectedCharacterKey.value));
const chatOptions = computed(() => buildChatOptions(characterItems.value));
const visibleItems = computed(() => filterItemsByChat(characterItems.value, selectedChatId.value));
const selectedCount = computed(() => selectedKeys.value.length);
const isAllSelected = computed(
  () => visibleItems.value.length > 0 && selectedCount.value === visibleItems.value.length,
);
const isSelectionToggleDisabled = computed(() => props.loading || props.busy || !visibleItems.value.length);

watch(
  () => props.items,
  (items, previous) => {
    syncPreviewUrls(items, previous ?? []);
    reconcileCharacterSelection(characterOptions.value.map(option => option.value));
  },
  { immediate: true },
);

watch(
  () => selectedType.value,
  () => {
    selectedCharacterKey.value = ALL_CHARACTER_KEY;
    selectedChatId.value = ALL_CHAT_KEY;
  },
);

watch(
  () => selectedCharacterKey.value,
  () => {
    selectedChatId.value = ALL_CHAT_KEY;
  },
);

watch(
  () => chatOptions.value.map(option => option.value),
  values => {
    if (values.includes(selectedChatId.value)) return;
    selectedChatId.value = values[0] ?? ALL_CHAT_KEY;
  },
  { immediate: true },
);

watch(
  () => visibleItems.value.map(item => item.key),
  keys => {
    selectedKeys.value = selectedKeys.value.filter(key => keys.includes(key));
    if (!keys.length) isSelecting.value = false;
  },
);

onBeforeUnmount(() => {
  clearPreviewUrls();
});

/** 切换显式多选模式 */
function toggleSelectMode(): void {
  if (isSelectionToggleDisabled.value) return;
  isSelecting.value = !isSelecting.value;
  if (!isSelecting.value) selectedKeys.value = [];
}

/** 退出多选并清空已选项 */
function clearSelection(): void {
  isSelecting.value = false;
  selectedKeys.value = [];
}

/**
 * 判断图片是否已被选中
 * @param key 复合 key
 */
function isItemSelected(key: string): boolean {
  return selectedKeys.value.includes(key);
}

/**
 * 切换单张图片选中状态
 * @param key 复合 key
 */
function toggleItem(key: string): void {
  if (!isSelecting.value || props.busy) return;
  selectedKeys.value = isItemSelected(key)
    ? selectedKeys.value.filter(itemKey => itemKey !== key)
    : [...selectedKeys.value, key];
}

/** 切换当前可见范围的全选状态 */
function toggleSelectAll(): void {
  if (props.busy) return;
  selectedKeys.value = isAllSelected.value ? [] : visibleItems.value.map(item => item.key);
}

/** 批量下载当前已选图片 */
function downloadSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('download-items', selectedKeys.value);
}

/** 批量删除当前已选图片 */
function deleteSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('delete-items', selectedKeys.value);
}

/**
 * 读取缩略图预览地址
 * @param key 复合 key
 */
function getPreviewUrl(key: string): string {
  return previewUrlMap.value[key] ?? '';
}

/**
 * 类型角标文案
 * @param kind 图片类型
 */
function kindLabel(kind: ManagedImageKind): string {
  return kind === 'favorite' ? '收藏' : '临时';
}

/**
 * 类型角标样式类
 * @param kind 图片类型
 */
function kindBadgeClass(kind: ManagedImageKind): string {
  return kind === 'favorite' ? 'cv-favorite-kind-badge--favorite' : 'cv-favorite-kind-badge--temporary';
}

/**
 * 状态互换按钮文案
 * @param kind 图片类型
 */
function kindToggleLabel(kind: ManagedImageKind): string {
  return kind === 'favorite' ? '转为临时' : '转为收藏';
}

/**
 * 格式化图片时间标题
 * @param createdAt 创建时间
 */
function formatImageLabel(createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 去除角色或聊天名称中的 .png 扩展名
 * @param name 原始名称
 */
function stripPngExtension(name: string): string {
  return name.replace('.png', '');
}

/**
 * 同步缩略图 URL 映射（按 key 复用；key 变化时按 blob 引用复用）
 * @param items 当前管理项
 * @param previous 上一批管理项
 */
function syncPreviewUrls(items: ManagedImageItem[], previous: ManagedImageItem[] = []): void {
  const blobToUrl = new Map<Blob, string>();
  previous.forEach(item => {
    const url = previewUrlMap.value[item.key];
    if (url) blobToUrl.set(item.imageBlob, url);
  });
  const nextMap: Record<string, string> = {};
  const keepUrls = new Set<string>();
  items.forEach(item => {
    const objectUrl = previewUrlMap.value[item.key] ?? blobToUrl.get(item.imageBlob) ?? createPreviewUrl(item.imageBlob);
    nextMap[item.key] = objectUrl;
    keepUrls.add(objectUrl);
  });
  Object.values(previewUrlMap.value).forEach(url => {
    if (keepUrls.has(url)) return;
    URL.revokeObjectURL(url);
    objectUrls.delete(url);
  });
  previewUrlMap.value = nextMap;
}

/**
 * 创建并登记缩略图 URL
 * @param imageBlob 图片数据
 * @returns object URL
 */
function createPreviewUrl(imageBlob: Blob): string {
  const objectUrl = URL.createObjectURL(imageBlob);
  objectUrls.add(objectUrl);
  return objectUrl;
}

/** 清理已创建的缩略图 URL */
function clearPreviewUrls(): void {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
  previewUrlMap.value = {};
}

/**
 * 校正角色筛选值
 * @param values 当前可选角色值
 */
function reconcileCharacterSelection(values: string[]): void {
  if (values.includes(selectedCharacterKey.value)) return;
  selectedCharacterKey.value = values[0] ?? ALL_CHARACTER_KEY;
}

/**
 * 按类型筛选
 * @param items 管理项
 * @param type 类型筛选
 */
function filterItemsByType(items: ManagedImageItem[], type: ManagedTypeFilter): ManagedImageItem[] {
  if (type === 'all') return items;
  return items.filter(item => item.kind === type);
}

/**
 * 按角色筛选
 * @param items 管理项
 * @param characterKey 角色 key
 */
function filterItemsByCharacter(items: ManagedImageItem[], characterKey: string): ManagedImageItem[] {
  if (characterKey === ALL_CHARACTER_KEY) return items;
  return items.filter(item => item.characterKey === characterKey);
}

/**
 * 按聊天筛选（已按时间倒序的输入保持顺序）
 * @param items 管理项
 * @param chatGroupId 聊天复合 id
 */
function filterItemsByChat(items: ManagedImageItem[], chatGroupId: string): ManagedImageItem[] {
  if (chatGroupId === ALL_CHAT_KEY) return items;
  return items.filter(item => managedChatGroupId(item) === chatGroupId);
}

/**
 * 构建角色筛选项
 * @param items 当前类型下的管理项
 */
function buildCharacterOptions(items: ManagedImageItem[]): FilterOption[] {
  return [{ label: '全部角色', value: ALL_CHARACTER_KEY }, ...collectCharacterOptions(items)];
}

/**
 * 收集去重角色选项
 * @param items 管理项
 */
function collectCharacterOptions(items: ManagedImageItem[]): FilterOption[] {
  return items.reduce((options, item) => {
    if (options.some(option => option.value === item.characterKey)) return options;
    return [...options, { label: stripPngExtension(item.characterKey), value: item.characterKey }];
  }, [] as FilterOption[]);
}

/**
 * 构建聊天筛选项
 * @param items 当前角色下的管理项
 */
function buildChatOptions(items: ManagedImageItem[]): FilterOption[] {
  const seen = new Set<string>();
  const chats: FilterOption[] = [];
  for (const item of items) {
    const id = managedChatGroupId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    chats.push({ label: stripPngExtension(item.chatId), value: id });
  }
  return [{ label: '全部聊天', value: ALL_CHAT_KEY }, ...chats];
}
</script>

<style scoped>
@reference '../../global.css';

.cv-favorite-panel {
  --cv-favorite-grid-max-h: 36rem;
}

.cv-favorite-filter-row {
  @apply flex flex-wrap items-end;
  gap: var(--cv-space-4xl);
  margin-bottom: var(--cv-space-4xl);
}

.cv-favorite-filter-block {
  @apply flex flex-col;
  flex: 1 1 12rem;
  min-width: 0;
  gap: var(--cv-space-md);
}

.cv-favorite-filter-label {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
  font-weight: 600;
}

.cv-favorite-grid {
  @apply grid overflow-y-auto;
  max-height: var(--cv-favorite-grid-max-h, 36rem);
  gap: var(--cv-space-4xl);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cv-favorite-card {
  @apply relative flex min-w-0 flex-col;
}


.cv-favorite-thumb-wrap {
  @apply relative overflow-hidden;
  aspect-ratio: 1;
  border-bottom: var(--cv-border-width) solid color-mix(in srgb, var(--cv-surface-variant) 72%, transparent);
  background: var(--cv-surface-container-high);
}

.cv-favorite-kind-badge {
  @apply absolute;
  top: var(--cv-space-md);
  right: var(--cv-space-md);
  z-index: 1;
  padding: 0.1rem 0.35rem;
  border-radius: var(--cv-radius-sm);
  font-size: var(--cv-font-size-2xs);
  font-weight: 600;
  line-height: 1.2;
  pointer-events: none;
}

.cv-favorite-kind-badge--favorite {
  background: color-mix(in srgb, var(--p-yellow-400) 78%, var(--cv-surface));
  color: color-mix(in srgb, var(--p-yellow-950, #422006) 88%, var(--cv-on-surface));
}

.cv-favorite-kind-badge--temporary {
  background: color-mix(in srgb, var(--cv-surface) 82%, transparent);
  color: var(--cv-on-surface-variant);
}

.cv-favorite-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cv-favorite-skeleton-thumb {
  display: block;
  aspect-ratio: 1;
}

.cv-favorite-card-body {
  @apply flex min-w-0 flex-col;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-4xl);
}

.cv-favorite-title {
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-xs);
  font-weight: 600;
}

.cv-favorite-meta {
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-2xs);
}

.cv-favorite-actions {
  @apply flex items-center justify-end;
  gap: var(--cv-space-2xl);
  padding: 0 var(--cv-space-4xl) var(--cv-space-4xl);
}

.cv-kind-toggle-button {
  @apply relative;
  color: var(--cv-on-surface-variant);
}



.cv-favorite-batch-bar {
  @apply sticky flex flex-wrap items-center justify-between;
  bottom: 0;
  gap: var(--cv-space-md);
  margin-top: var(--cv-space-4xl);
  padding: var(--cv-space-4xl) 0 0;
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-favorite-batch-count {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-favorite-batch-actions {
  @apply flex flex-wrap items-center justify-end;
  gap: var(--cv-space-3xl);
}

.cv-favorite-empty {
  @apply flex items-center justify-center text-center;
  min-height: 9rem;
  padding: var(--cv-space-2xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
}

@media (max-width: 56rem) {
  .cv-favorite-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 38rem) {
  .cv-favorite-filter-block {
    flex-basis: 100%;
  }

  .cv-favorite-grid {
    grid-template-columns: 1fr;
  }
}
</style>
