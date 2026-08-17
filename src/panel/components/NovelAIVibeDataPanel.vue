<template>
  <StaticPanel title="Vibe 数据" class="[--cv-vibe-grid-max-h:36rem]">
    <template #actions>
      <CvMiniButton
        :label="isSelecting ? '取消选择' : '选择'"
        icon="fa-regular fa-check-double"
        :disabled="isSelectionToggleDisabled"
        @click="toggleSelectMode"
      />
    </template>

    <div
      v-if="loading"
      class="grid max-h-(--cv-vibe-grid-max-h,36rem) grid-cols-3 gap-(--cv-space-4xl) overflow-y-auto max-[56rem]:grid-cols-2"
    >
      <CvDataCard v-for="index in 4" :key="index">
        <div class="relative flex min-w-0 flex-col">
          <Skeleton height="100%" class="block aspect-square" />
          <div class="flex min-w-0 flex-col gap-(--cv-space-sm) p-(--cv-space-4xl)">
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="0.9rem" width="52%" />
            <div class="flex flex-wrap items-center gap-(--cv-space-sm)">
              <Skeleton height="1.2rem" width="4rem" border-radius="999px" />
              <Skeleton height="1.2rem" width="4.5rem" border-radius="999px" />
            </div>
          </div>
        </div>
      </CvDataCard>
    </div>

    <div
      v-else-if="!items.length"
      class="flex min-h-36 items-center justify-center rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] p-(--cv-space-2xl) text-center text-(--cv-on-surface-variant)"
    >
      暂无 vibe 数据
    </div>

    <template v-else>
      <div
        class="mb-(--cv-space-4xl) flex flex-wrap items-center justify-between gap-(--cv-space-md) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      >
        <span>{{ isSelecting ? `已选 ${selectedCount} 个 / 共 ${items.length} 个` : `共 ${items.length} 个` }}</span>
      </div>

      <div v-bind="containerProps" class="max-h-(--cv-vibe-grid-max-h,36rem)">
        <div v-bind="wrapperProps">
          <div
            v-for="row in visibleRows"
            :key="row.rowIndex"
            :ref="rowRef(row.rowIndex)"
            class="grid grid-cols-3 gap-x-(--cv-space-4xl) pb-(--cv-space-4xl) max-[56rem]:grid-cols-2"
          >
            <CvDataCard
              v-for="item in row.items"
              :key="item.sourceHash"
              :selected="isItemSelected(item.sourceHash)"
              :selecting="isSelecting"
              :disabled="busy"
              @toggle="toggleItem(item.sourceHash)"
            >
              <div class="relative flex min-w-0 flex-col">
                <div v-if="isSelecting" class="absolute top-(--cv-space-lg) left-(--cv-space-lg) z-1" @click.stop>
                  <Checkbox
                    binary
                    :model-value="isItemSelected(item.sourceHash)"
                    :disabled="busy"
                    @update:model-value="toggleItem(item.sourceHash)"
                  />
                </div>

                <div
                  class="flex aspect-square items-center justify-center overflow-hidden border-(length:--cv-border-width) border-b border-solid border-[color-mix(in_srgb,var(--cv-surface-variant)_72%,transparent)] bg-(--cv-surface-container-high) text-(--cv-on-surface-variant)"
                  :class="!item.thumbnailData && 'flex-col gap-(--cv-space-sm)'"
                >
                  <img
                    v-if="item.thumbnailData"
                    :src="item.thumbnailData"
                    alt=""
                    class="block size-full object-cover"
                  />
                  <template v-else>
                    <span class="text-(length:--cv-font-size-2xl) leading-none font-bold text-(--cv-primary-container)"
                      >V</span
                    >
                    <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">
                      {{ item.hasImage ? 'HAS IMG' : 'NO IMG' }}
                    </span>
                  </template>
                </div>

                <div class="flex min-w-0 flex-col gap-(--cv-space-sm) p-(--cv-space-4xl)">
                  <div
                    class="overflow-hidden text-(length:--cv-font-size-xs) leading-[1.4] font-semibold text-ellipsis whitespace-nowrap text-(--cv-on-surface)"
                  >
                    {{ getNovelAIVibeDisplayFileName(item) }}
                  </div>
                  <div
                    class="overflow-hidden text-(length:--cv-font-size-xs) text-ellipsis whitespace-nowrap text-(--cv-on-surface-variant)"
                  >
                    {{ formatCreatedAt(item.createdAt) }} · {{ item.sourceHash.slice(0, 8) }}
                  </div>
                  <div class="flex flex-wrap items-center gap-(--cv-space-sm)">
                    <Tag
                      v-for="tagItem in buildTagItems(item)"
                      :key="tagItem.label"
                      :value="tagItem.label"
                      :severity="tagItem.severity"
                      class="leading-none text-wrap"
                    />
                  </div>
                </div>

                <div
                  v-if="!isSelecting"
                  class="flex items-center justify-end gap-(--cv-space-md) px-(--cv-space-4xl) pb-(--cv-space-4xl)"
                  @click.stop
                >
                  <CvMiniButton
                    icon="fa-regular fa-download"
                    aria-label="下载"
                    :disabled="busy"
                    @click="$emit('download-item', item)"
                  />
                  <CvMiniButton
                    icon="fa-regular fa-trash"
                    tone="error"
                    aria-label="删除"
                    :disabled="busy"
                    @click="$emit('delete-item', item)"
                  />
                </div>
              </div>
            </CvDataCard>
          </div>
        </div>
      </div>

      <div
        v-if="isSelecting"
        class="sticky bottom-0 mt-(--cv-space-4xl) flex flex-wrap items-center justify-between gap-(--cv-space-md) border-t border-(--cv-surface-variant) pt-(--cv-space-4xl)"
      >
        <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">已选 {{ selectedCount }} 个</span>
        <div class="flex flex-wrap items-center justify-end gap-(--cv-space-3xl)">
          <CvMiniButton :label="isAllSelected ? '取消全选' : '全选'" :disabled="busy" @click="toggleSelectAll" />
          <CvMiniButton label="下载" :disabled="!selectedCount || busy" @click="downloadSelected" />
          <CvMiniButton label="删除" tone="error" :disabled="!selectedCount || busy" @click="deleteSelected" />
          <CvMiniButton label="取消" :disabled="busy" @click="clearSelection" />
        </div>
      </div>
    </template>
  </StaticPanel>
</template>

<script setup lang="ts">
import Checkbox from 'primevue/checkbox';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { computed, ref, watch } from 'vue';
import { NOVELAI_MODELS, type NovelAIModel } from '@/constants/novelai';
import { useVirtualCardGrid } from '@/composables/useVirtualCardGrid';
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

const isSelecting = ref(false);
const selectedHashes = ref<string[]>([]);
const selectedCount = computed(() => selectedHashes.value.length);
const isAllSelected = computed(() => props.items.length > 0 && selectedCount.value === props.items.length);
const isSelectionToggleDisabled = computed(() => props.loading || props.busy || !props.items.length);
// 顶层解构以获得模板自动解包（嵌套在普通对象里的 ref 不会解包）
const { containerProps, wrapperProps, visibleRows, rowRef } = useVirtualCardGrid<NovelAIVibeCacheListItem>(
  () => props.items,
);

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
  return [...modelTags, { label: item.hasImage ? '有原图' : '仅编码', severity: item.hasImage ? 'info' : 'warn' }];
}

function formatCreatedAt(createdAt: number): string {
  const date = new Date(createdAt);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>
