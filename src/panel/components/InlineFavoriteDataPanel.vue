<template>
  <StaticPanel title="收藏图片数据" class="cv-favorite-panel">
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

    <div v-else-if="!groups.length" class="cv-favorite-empty">暂无收藏图片数据</div>

    <template v-else>
      <div class="cv-favorite-filter-row">
        <div class="cv-favorite-filter-block">
          <div class="cv-favorite-filter-label">角色</div>
          <Select
            v-model="selectedCharacterKey"
            :options="characterOptions"
            option-label="label"
            option-value="value"
            class="cv-favorite-filter-select"
          />
        </div>

        <div class="cv-favorite-filter-block">
          <div class="cv-favorite-filter-label">聊天</div>
          <Select
            v-model="selectedChatId"
            :options="chatOptions"
            option-label="label"
            option-value="value"
            class="cv-favorite-filter-select"
          />
        </div>
      </div>

      <div v-if="visibleItems.length" class="cv-favorite-grid">
        <CvDataCard
          v-for="item in visibleItems"
          :key="item.id"
          :selected="isItemSelected(item.id)"
          :selecting="isSelecting"
          :disabled="busy"
          @toggle="toggleItem(item.id)"
        >
          <div class="cv-favorite-card">
            <div v-if="isSelecting" class="cv-favorite-select" @click.stop>
              <Checkbox
                binary
                :model-value="isItemSelected(item.id)"
                :disabled="busy"
                @update:model-value="toggleItem(item.id)"
              />
            </div>

            <div class="cv-favorite-thumb-wrap">
              <LightboxImage
                :src="getPreviewUrl(item.id)"
                :snapshot="item.promptSnapshot"
                :download-action="() => $emit('download-items', [item.id])"
                :disabled="isSelecting"
                alt="收藏图片预览"
                class="cv-favorite-thumb"
              />
            </div>

            <div class="cv-favorite-card-body">
              <div class="cv-favorite-title">{{ formatInlineFavoriteImageLabel(item.createdAt) }}</div>
              <div class="cv-favorite-meta">
                {{ stripPngExtension(item.characterKey) }} · {{ stripPngExtension(item.chatId) }}
              </div>
            </div>

            <div v-if="!isSelecting" class="cv-favorite-actions" @click.stop>
              <CvMiniButton
                icon="fa-solid fa-download"
                aria-label="下载"
                :disabled="busy"
                @click="$emit('download-items', [item.id])"
              />
              <CvMiniButton
                icon="fa-solid fa-trash"
                tone="error"
                aria-label="删除"
                :disabled="busy"
                @click="$emit('delete-items', [item.id])"
              />
            </div>
          </div>
        </CvDataCard>
      </div>
      <div v-else class="cv-favorite-empty">当前筛选范围暂无收藏图片</div>

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
import type { InlineImageFavoriteGroup, InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';

interface FavoriteFilterOption {
  label: string;
  value: string;
}

const ALL_CHARACTER_KEY = '__all_character__';
const ALL_CHAT_KEY = '__all_chat__';
const SKELETON_TOKENS = {
  root: {
    borderRadius: 'var(--cv-radius-sm)',
    background: 'var(--cv-surface-container-high)',
    animationBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 68%, var(--cv-surface-container))',
  },
} satisfies SkeletonDesignTokens;

const props = defineProps<{
  groups: InlineImageFavoriteGroup[];
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'download-items': [ids: number[]];
  'delete-items': [ids: number[]];
}>();

const selectedCharacterKey = ref(ALL_CHARACTER_KEY);
const selectedChatId = ref(ALL_CHAT_KEY);
const isSelecting = ref(false);
const selectedImageIds = ref<number[]>([]);
const previewUrlMap = ref<Record<number, string>>({});
const objectUrls = new Set<string>();
const characterOptions = computed(() => buildCharacterOptions(props.groups));
const filteredCharacterGroups = computed(() => filterGroupsByCharacter(props.groups, selectedCharacterKey.value));
const chatOptions = computed(() => buildChatOptions(filteredCharacterGroups.value));
const visibleGroups = computed(() => filterGroupsByChat(filteredCharacterGroups.value, selectedChatId.value));
const visibleItems = computed(() => flattenFavoriteItems(visibleGroups.value));
const selectedCount = computed(() => selectedImageIds.value.length);
const isAllSelected = computed(
  () => visibleItems.value.length > 0 && selectedCount.value === visibleItems.value.length,
);
const isSelectionToggleDisabled = computed(() => props.loading || props.busy || !visibleItems.value.length);

watch(
  () => props.groups,
  groups => {
    syncPreviewUrls(groups);
    reconcileCharacterSelection(characterOptions.value.map(option => option.value));
  },
  { immediate: true },
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
  () => visibleItems.value.map(item => item.id),
  ids => {
    selectedImageIds.value = selectedImageIds.value.filter(id => ids.includes(id));
    if (!ids.length) isSelecting.value = false;
  },
);

onBeforeUnmount(() => {
  clearPreviewUrls();
});

/**
 * 切换显式多选模式
 */
function toggleSelectMode(): void {
  if (isSelectionToggleDisabled.value) return;
  isSelecting.value = !isSelecting.value;
  if (!isSelecting.value) selectedImageIds.value = [];
}

/**
 * 退出多选并清空已选项
 */
function clearSelection(): void {
  isSelecting.value = false;
  selectedImageIds.value = [];
}

/**
 * 判断图片是否已被选中
 * @param id 收藏图片 ID
 * @returns 是否选中
 */
function isItemSelected(id: number): boolean {
  return selectedImageIds.value.includes(id);
}

/**
 * 切换单张图片选中状态
 * @param id 收藏图片 ID
 */
function toggleItem(id: number): void {
  if (!isSelecting.value || props.busy) return;
  selectedImageIds.value = isItemSelected(id)
    ? selectedImageIds.value.filter(itemId => itemId !== id)
    : [...selectedImageIds.value, id];
}

/**
 * 切换当前可见范围的全选状态
 */
function toggleSelectAll(): void {
  if (props.busy) return;
  selectedImageIds.value = isAllSelected.value ? [] : visibleItems.value.map(item => item.id);
}

/**
 * 批量下载当前已选图片
 */
function downloadSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('download-items', selectedImageIds.value);
}

/**
 * 批量删除当前已选图片
 */
function deleteSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('delete-items', selectedImageIds.value);
}

/**
 * 读取图片缩略图预览地址
 * @param id 收藏图片 ID
 * @returns 预览 URL
 */
function getPreviewUrl(id: number): string {
  return previewUrlMap.value[id] ?? '';
}

/**
 * 格式化收藏图片标题
 * @param createdAt 创建时间
 * @returns 时间风格标题
 */
function formatInlineFavoriteImageLabel(createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 去除角色或聊天名称中的 .png 扩展名
 * @param name 原始名称
 * @returns 处理后的名称
 */
function stripPngExtension(name: string): string {
  return name.replace('.png', '');
}

/**
 * 同步收藏缩略图 URL 映射
 * @param groups 收藏分组
 */
function syncPreviewUrls(groups: InlineImageFavoriteGroup[]): void {
  clearPreviewUrls();
  previewUrlMap.value = buildPreviewUrlMap(groups);
}

/**
 * 构建收藏缩略图 URL 映射
 * @param groups 收藏分组
 * @returns ID 到 URL 的映射
 */
function buildPreviewUrlMap(groups: InlineImageFavoriteGroup[]): Record<number, string> {
  return groups.reduce(
    (map, group) => {
      group.records.forEach(record => {
        const objectUrl = URL.createObjectURL(record.imageBlob);
        objectUrls.add(objectUrl);
        map[record.id] = objectUrl;
      });
      return map;
    },
    {} as Record<number, string>,
  );
}

/**
 * 清理已创建的收藏缩略图 URL
 */
function clearPreviewUrls(): void {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

/**
 * 校正角色筛选值，避免刷新后越界
 * @param values 当前可选角色值
 */
function reconcileCharacterSelection(values: string[]): void {
  if (values.includes(selectedCharacterKey.value)) return;
  selectedCharacterKey.value = values[0] ?? ALL_CHARACTER_KEY;
}

/**
 * 构建角色筛选项
 * @param groups 收藏分组
 * @returns Select 选项
 */
function buildCharacterOptions(groups: InlineImageFavoriteGroup[]): FavoriteFilterOption[] {
  return [{ label: '全部角色', value: ALL_CHARACTER_KEY }, ...collectCharacterOptions(groups)];
}

/**
 * 收集去重后的角色筛选项
 * @param groups 收藏分组
 * @returns 去重后的角色筛选项
 */
function collectCharacterOptions(groups: InlineImageFavoriteGroup[]): FavoriteFilterOption[] {
  return groups.reduce((options, group) => {
    if (options.some(option => option.value === group.characterKey)) return options;
    return [...options, { label: stripPngExtension(group.characterKey), value: group.characterKey }];
  }, [] as FavoriteFilterOption[]);
}

/**
 * 构建聊天筛选项
 * @param groups 当前角色下的收藏分组
 * @returns Select 选项
 */
function buildChatOptions(groups: InlineImageFavoriteGroup[]): FavoriteFilterOption[] {
  return [
    { label: '全部聊天', value: ALL_CHAT_KEY },
    ...groups.map(group => ({ label: stripPngExtension(group.chatId), value: group.id })),
  ];
}

/**
 * 按角色过滤收藏分组
 * @param groups 收藏分组
 * @param characterKey 当前角色筛选值
 * @returns 过滤后的分组
 */
function filterGroupsByCharacter(groups: InlineImageFavoriteGroup[], characterKey: string): InlineImageFavoriteGroup[] {
  if (characterKey === ALL_CHARACTER_KEY) return groups;
  return groups.filter(group => group.characterKey === characterKey);
}

/**
 * 按聊天范围过滤收藏分组
 * @param groups 当前角色下的收藏分组
 * @param chatId 当前聊天筛选值
 * @returns 过滤后的分组
 */
function filterGroupsByChat(groups: InlineImageFavoriteGroup[], chatId: string): InlineImageFavoriteGroup[] {
  if (chatId === ALL_CHAT_KEY) return groups;
  return groups.filter(group => group.id === chatId);
}

/**
 * 展开当前筛选范围内的图片列表
 * @param groups 当前可见收藏分组
 * @returns 按时间倒序的图片列表
 */
function flattenFavoriteItems(groups: InlineImageFavoriteGroup[]): InlineImageFavoriteListItem[] {
  return groups.flatMap(group => group.records).sort((left, right) => right.createdAt - left.createdAt);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-favorite-panel {
  --cv-static-panel-max-h: 36rem;
}

.cv-favorite-filter-row {
  @apply flex flex-wrap items-end;
  gap: var(--cv-space-4xl);
  margin-bottom: var(--cv-space-4xl);
}

.cv-favorite-filter-block {
  @apply flex flex-col;
  flex: 1 1 14rem;
  min-width: 0;
  gap: var(--cv-space-md);
}

.cv-favorite-filter-label {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
  font-weight: 600;
}

.cv-favorite-filter-select {
  @apply w-full;
}

.cv-favorite-grid {
  @apply grid;
  gap: var(--cv-space-4xl);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cv-favorite-card {
  @apply relative flex min-w-0 flex-col;
}

.cv-favorite-select {
  @apply absolute;
  top: var(--cv-space-lg);
  left: var(--cv-space-lg);
  z-index: 1;
}

.cv-favorite-thumb-wrap {
  @apply overflow-hidden;
  aspect-ratio: 1;
  border-bottom: var(--cv-border-width) solid color-mix(in srgb, var(--cv-surface-variant) 72%, transparent);
  background: var(--cv-surface-container-high);
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
