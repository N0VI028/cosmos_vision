<template>
  <div class="flex flex-col gap-(--cv-space-md)">
    <!-- 全选与统计 -->
    <div class="flex items-center justify-between pb-(--cv-space-lg) text-(length:--cv-font-size-xs)">
      <label class="inline-flex cursor-pointer items-center gap-(--cv-space-sm) select-none">
        <Checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate" binary @change="toggleSelectAll" />
        <span class="font-medium text-(--cv-on-surface)">全选</span>
      </label>
      <span class="text-(--cv-on-surface-variant)">已选 {{ selectedIds.size }} / 共 {{ props.rows.length }}</span>
    </div>

    <!-- 列表滚动区 -->
    <div
      class="custom-scrollbar flex max-h-[min(52dvh,26rem)] min-h-[10rem] flex-col gap-(--cv-space-md) overflow-y-auto overscroll-contain"
    >
      <div
        v-for="row in props.rows"
        :key="row.id"
        role="checkbox"
        :aria-checked="selectedIds.has(row.id)"
        tabindex="0"
        class="flex w-full cursor-pointer items-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent px-(--cv-space-md) py-(--cv-space-sm) transition-colors duration-150 hover:bg-(--cv-surface-container-highest)"
        :class="{ 'bg-(--cv-surface-container-low)': selectedIds.has(row.id) }"
        @click="toggleRow(row.id)"
        @keydown.space.prevent="toggleRow(row.id)"
        @keydown.enter.prevent="toggleRow(row.id)"
      >
        <Checkbox binary :model-value="selectedIds.has(row.id)" class="pointer-events-none" :tabindex="-1" />
        <img
          v-if="row.previewUrl && !failedPreviewIds.has(row.id)"
          :src="row.previewUrl"
          :alt="`${row.title} 预览图`"
          class="size-11 shrink-0 rounded-(--cv-radius-sm) object-cover"
          loading="lazy"
          @error="markPreviewFailed(row.id)"
        />
        <!-- 图片占位仅在配方列表开启；默认预设列表不显示图标 -->
        <span
          v-else-if="props.showPreviewPlaceholder"
          class="flex size-11 shrink-0 items-center justify-center rounded-(--cv-radius-sm) bg-(--cv-surface-container-highest) text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-image" aria-hidden="true" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-(--cv-space-2xs)">
          <span
            class="min-w-0 overflow-hidden text-(length:--cv-font-size-xs) font-medium text-ellipsis whitespace-nowrap text-(--cv-on-surface)"
            :title="row.title"
          >
            {{ row.title }}
          </span>
          <span
            class="min-w-0 overflow-hidden text-(length:--cv-font-size-xs) text-ellipsis whitespace-nowrap text-(--cv-on-surface-variant)"
          >
            {{ row.subtitle }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 导入勾选列表行模型 */
interface ImportSelectionRow {
  id: string;
  title: string;
  subtitle: string;
  previewUrl?: string | null;
}

const props = withDefaults(
  defineProps<{
    /** 可勾选的列表行 */
    rows: ImportSelectionRow[];
    /** 无预览图时是否显示图标占位（配方列表开启，默认预设列表关闭） */
    showPreviewPlaceholder?: boolean;
  }>(),
  {
    showPreviewPlaceholder: false,
  },
);

const selectedIds = defineModel<ReadonlySet<string>>('selectedIds', { required: true });

/** 预览图加载失败的行 ID */
const failedPreviewIds = ref<ReadonlySet<string>>(new Set());

const isAllSelected = computed(() => props.rows.length > 0 && selectedIds.value.size === props.rows.length);
const isIndeterminate = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < props.rows.length);

/**
 * 切换全选/全不选状态
 */
function toggleSelectAll(): void {
  selectedIds.value = isAllSelected.value ? new Set() : new Set(props.rows.map(row => row.id));
}

/**
 * 切换单个列表行的勾选状态
 * @param id 条目 ID
 */
function toggleRow(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

/**
 * 记录预览图加载失败的行 ID
 * @param id 行 ID
 */
function markPreviewFailed(id: string): void {
  const next = new Set(failedPreviewIds.value);
  next.add(id);
  failedPreviewIds.value = next;
}
</script>
