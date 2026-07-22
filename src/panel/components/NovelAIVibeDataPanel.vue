<template>
  <StaticPanel title="Vibe 数据" class="cv-vibe-panel">
    <template #actions>
      <CvMiniButton
        :label="isSelecting ? '取消选择' : '选择'"
        icon="fa-solid fa-check-double"
        :disabled="isSelectionToggleDisabled"
        size="small"
        @click="toggleSelectMode"
      />
    </template>

    <div v-if="loading" class="cv-vibe-grid">
      <CvDataCard v-for="index in 4" :key="index">
        <div class="cv-vibe-card">
          <Skeleton height="100%" class="cv-vibe-skeleton-thumb" :dt="SKELETON_TOKENS" />
          <div class="cv-vibe-card-body">
            <Skeleton height="1rem" width="70%" :dt="SKELETON_TOKENS" />
            <Skeleton height="0.9rem" width="52%" :dt="SKELETON_TOKENS" />
            <div class="cv-vibe-tag-row">
              <Skeleton height="1.2rem" width="4rem" border-radius="999px" :dt="SKELETON_TOKENS" />
              <Skeleton height="1.2rem" width="4.5rem" border-radius="999px" :dt="SKELETON_TOKENS" />
            </div>
          </div>
        </div>
      </CvDataCard>
    </div>

    <div v-else-if="!items.length" class="cv-vibe-empty">暂无 vibe 数据</div>

    <template v-else>
      <div class="cv-vibe-summary">
        <span>{{ isSelecting ? `已选 ${selectedCount} 个 / 共 ${items.length} 个` : `共 ${items.length} 个` }}</span>
        <span class="cv-vibe-summary-hint">
          {{ isSelecting ? '点击卡片切换选中状态' : '缩略图缺失时会显示文件卡' }}
        </span>
      </div>

      <div class="cv-vibe-grid">
        <CvDataCard
          v-for="item in items"
          :key="item.sourceHash"
          :selected="isItemSelected(item.sourceHash)"
          :selecting="isSelecting"
          :disabled="busy"
          @toggle="toggleItem(item.sourceHash)"
        >
          <div class="cv-vibe-card">
            <div
              v-if="isSelecting"
              class="absolute top-(--cv-space-lg) left-(--cv-space-lg) z-1"
              @click.stop
            >
              <Checkbox
                binary
                :model-value="isItemSelected(item.sourceHash)"
                :disabled="busy"
                @update:model-value="toggleItem(item.sourceHash)"
              />
            </div>

            <div class="cv-vibe-thumb-wrap" :class="{ 'cv-vibe-thumb-wrap--file': !item.thumbnailData }">
              <img v-if="item.thumbnailData" :src="item.thumbnailData" alt="" class="cv-vibe-thumb" />
              <template v-else>
                <span class="cv-vibe-file-mark">V</span>
                <span class="cv-vibe-file-ext">{{ item.hasImage ? 'HAS IMG' : 'NO IMG' }}</span>
              </template>
            </div>

            <div class="cv-vibe-card-body">
              <div class="cv-vibe-name">{{ getNovelAIVibeDisplayFileName(item) }}</div>
              <div class="cv-vibe-meta">{{ formatCreatedAt(item.createdAt) }} · {{ item.sourceHash.slice(0, 8) }}</div>
              <div class="cv-vibe-tag-row">
                <Tag
                  v-for="tagItem in buildTagItems(item)"
                  :key="tagItem.label"
                  :value="tagItem.label"
                  :severity="tagItem.severity"
                  class="cv-vibe-tag"
                />
              </div>
            </div>

            <div v-if="!isSelecting" class="cv-vibe-actions" @click.stop>
              <CvMiniButton
                icon="fa-solid fa-download"
                aria-label="下载"
                :disabled="busy"
                @click="$emit('download-item', item)"
              />
              <CvMiniButton
                icon="fa-solid fa-trash"
                tone="error"
                aria-label="删除"
                :disabled="busy"
                @click="$emit('delete-item', item)"
              />
            </div>
          </div>
        </CvDataCard>
      </div>

      <div v-if="isSelecting" class="cv-vibe-batch-bar">
        <span class="cv-vibe-batch-count">已选 {{ selectedCount }} 个</span>
        <div class="cv-vibe-batch-actions">
          <CvMiniButton
            :label="isAllSelected ? '取消全选' : '全选'"
            :disabled="busy"
            size="small"
            @click="toggleSelectAll"
          />
          <CvMiniButton
            label="下载"
            :disabled="!selectedCount || busy"
            size="small"
            @click="downloadSelected"
          />
          <CvMiniButton
            label="删除"
            tone="error"
            :disabled="!selectedCount || busy"
            size="small"
            @click="deleteSelected"
          />
          <CvMiniButton
            label="取消"
            :disabled="busy"
            size="small"
            @click="clearSelection"
          />
        </div>
      </div>
    </template>
  </StaticPanel>
</template>

<script setup lang="ts">
import type { SkeletonDesignTokens } from '@primeuix/themes/types/skeleton';
import Checkbox from 'primevue/checkbox';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { computed, ref, watch } from 'vue';
import { NOVELAI_MODELS, type NovelAIModel } from '@/constants/novelai';
import CvDataCard from '@/panel/components/CvDataCard.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import StaticPanel from '@/panel/components/StaticPanel.vue';
import { getNovelAIVibeDisplayFileName } from '@/services/novelai/vibe-display';
import type { NovelAIVibeCacheListItem } from '@/services/novelai/vibe-types';

interface VibeTagItem {
  label: string;
  severity: 'secondary' | 'success' | 'info' | 'warn';
}

const NOVELAI_MODEL_LABEL_MAP = Object.fromEntries(
  NOVELAI_MODELS.map(item => [item.value, item.label.replace(/^NAI Diffusion\s+/i, '')]),
) as Record<NovelAIModel, string>;

const props = defineProps<{
  items: NovelAIVibeCacheListItem[];
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'download-item': [item: NovelAIVibeCacheListItem];
  'delete-item': [item: NovelAIVibeCacheListItem];
  'download-items': [hashes: string[]];
  'delete-items': [hashes: string[]];
}>();

const SKELETON_TOKENS = {
  root: {
    borderRadius: 'var(--cv-radius-sm)',
    background: 'var(--cv-surface-container-high)',
    animationBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 68%, var(--cv-surface-container))',
  },
} satisfies SkeletonDesignTokens;

const isSelecting = ref(false);
const selectedHashes = ref<string[]>([]);
const selectedCount = computed(() => selectedHashes.value.length);
const isAllSelected = computed(() => props.items.length > 0 && selectedCount.value === props.items.length);
const isSelectionToggleDisabled = computed(() => props.loading || props.busy || !props.items.length);

watch(
  () => props.items.map(item => item.sourceHash),
  hashes => {
    selectedHashes.value = selectedHashes.value.filter(hash => hashes.includes(hash));
    if (!hashes.length) isSelecting.value = false;
  },
);

function toggleSelectMode(): void {
  if (isSelectionToggleDisabled.value) return;
  isSelecting.value = !isSelecting.value;
  if (!isSelecting.value) selectedHashes.value = [];
}

function clearSelection(): void {
  isSelecting.value = false;
  selectedHashes.value = [];
}

function isItemSelected(sourceHash: string): boolean {
  return selectedHashes.value.includes(sourceHash);
}

function toggleItem(sourceHash: string): void {
  if (!isSelecting.value || props.busy) return;
  selectedHashes.value = isItemSelected(sourceHash)
    ? selectedHashes.value.filter(hash => hash !== sourceHash)
    : [...selectedHashes.value, sourceHash];
}

function toggleSelectAll(): void {
  if (props.busy) return;
  selectedHashes.value = isAllSelected.value ? [] : props.items.map(item => item.sourceHash);
}

function downloadSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('download-items', selectedHashes.value);
}

function deleteSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('delete-items', selectedHashes.value);
}

/**
 * 构建 vibe 状态标签：模型 + 是否有原图
 */
function buildTagItems(item: NovelAIVibeCacheListItem): VibeTagItem[] {
  const modelTags = item.models.length
    ? item.models.map(model => ({
        label: NOVELAI_MODEL_LABEL_MAP[model] ?? model,
        severity: 'secondary' as const,
      }))
    : [{ label: '未知模型', severity: 'warn' as const }];
  return [
    ...modelTags,
    { label: item.hasImage ? '有原图' : '仅编码', severity: item.hasImage ? 'info' : 'warn' },
  ];
}

function formatCreatedAt(createdAt: number): string {
  const date = new Date(createdAt);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
@reference '../../global.css';

.cv-vibe-panel {
  --cv-vibe-grid-max-h: 36rem;
}

.cv-vibe-summary {
  @apply flex flex-wrap items-center justify-between;
  gap: var(--cv-space-md);
  margin-bottom: var(--cv-space-4xl);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-vibe-summary-hint {
  @apply text-right;
}

.cv-vibe-grid {
  @apply grid overflow-y-auto;
  max-height: var(--cv-vibe-grid-max-h, 36rem);
  gap: var(--cv-space-4xl);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cv-vibe-card {
  @apply relative flex min-w-0 flex-col;
}


.cv-vibe-thumb-wrap {
  @apply flex items-center justify-center overflow-hidden;
  aspect-ratio: 1;
  border-bottom: var(--cv-border-width) solid color-mix(in srgb, var(--cv-surface-variant) 72%, transparent);
  background: var(--cv-surface-container-high);
  color: var(--cv-on-surface-variant);
}

.cv-vibe-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cv-vibe-thumb-wrap--file {
  @apply flex-col;
  gap: var(--cv-space-sm);
}

.cv-vibe-skeleton-thumb {
  display: block;
  aspect-ratio: 1;
}

.cv-vibe-file-mark {
  color: var(--cv-primary-container);
  font-size: var(--cv-font-size-3xl);
  font-weight: 700;
  line-height: 1;
}

.cv-vibe-file-ext {
  font-size: var(--cv-font-size-2xs);
  color: var(--cv-on-surface-variant);
}

.cv-vibe-card-body {
  @apply flex min-w-0 flex-col;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-4xl);
}

.cv-vibe-name {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-xs);
  font-weight: 600;
  line-height: 1.4;
  word-break: break-all;
}

.cv-vibe-tag-row {
  @apply flex flex-wrap items-center;
  gap: var(--cv-space-sm);
}

.cv-vibe-tag {
  --p-tag-font-size: var(--cv-font-size-2xs);
}

.cv-vibe-meta {
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-2xs);
}

.cv-vibe-actions {
  @apply flex items-center justify-end;
  gap: var(--cv-space-2xl);
  padding: 0 var(--cv-space-4xl) var(--cv-space-4xl);
}

.cv-vibe-batch-bar {
  @apply sticky flex flex-wrap items-center justify-between;
  bottom: 0;
  gap: var(--cv-space-md);
  margin-top: var(--cv-space-4xl);
  padding: var(--cv-space-4xl) 0 0;
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-vibe-batch-count {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-vibe-batch-actions {
  @apply flex flex-wrap items-center justify-end;
  gap: var(--cv-space-3xl);
}

.cv-vibe-empty {
  @apply flex items-center justify-center text-center;
  min-height: 9rem;
  padding: var(--cv-space-2xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
}

@media (max-width: 56rem) {
  .cv-vibe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 38rem) {
  .cv-vibe-grid {
    grid-template-columns: 1fr;
  }

  .cv-vibe-summary-hint {
    @apply text-left;
  }
}
</style>
