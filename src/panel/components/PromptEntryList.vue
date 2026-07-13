<template>
  <div v-if="entries.length > 0" class="cv-message-list-container">
    <VirtualScroller
      ref="scroller"
      :items="entries"
      :item-size="entryItemHeight"
      :scroll-height="scrollHeight"
      class="cv-message-list-scroller custom-scrollbar"
      :pt="{
        content: { class: 'cv-message-list' }
      }"
    >
      <template #item="{ item: entry }">
        <section
          :key="entry.id"
          class="cv-message-row"
          :class="{ 'is-disabled': entry.enabled === false }"
          :data-role="getRole?.(entry)"
          draggable="true"
          @dragstart="onDragStart($event, entry)"
          @dragover.prevent="onDragOver"
          @drop="onDrop($event, entry)"
          @dragend="onDragEnd"
        >
          <button type="button" class="cv-message-handle" title="拖拽排序" aria-label="拖拽排序">
            <i class="fa-solid fa-grip-vertical" />
          </button>
          <div class="cv-message-entry">
            <div class="cv-message-item">
              <div class="cv-message-main">
                <slot name="main" :entry="entry" />
              </div>
              <div class="cv-message-actions">
                <slot name="actions" :entry="entry" />
              </div>
            </div>
            <slot :entry="entry" />
          </div>
        </section>
      </template>
    </VirtualScroller>
  </div>
  <div v-else class="cv-empty-hint">{{ emptyText }}</div>
</template>

<script setup lang="ts">
export interface PromptEntryListItem {
  id: string;
  enabled?: boolean;
}

defineProps<{
  emptyText: string;
  getRole?: (entry: PromptEntryListItem) => string;
}>();

const entries = defineModel<PromptEntryListItem[]>({ required: true });

/** 单个紧凑条目高度，包含行高、边框和行间距，用于 VirtualScroller 计算可视区域 */
const entryItemHeight = 48;

/** 虚拟列表默认显示 7 个条目高度 */
const visibleItemLimit = 7;

/** 按实际条目数计算虚拟列表高度，最多显示 7 个条目 */
const scrollHeight = computed(() => `${Math.min(entries.value.length, visibleItemLimit) * entryItemHeight}px`);

/** VirtualScroller 实例引用，用于程序化滚动 */
const scroller = ref<{ $el: HTMLElement } | null>(null);

/** 拖拽状态 */
let draggedEntry: PromptEntryListItem | null = null;

/**
 * 滚动到列表末尾，使新增条目可见
 */
function scrollToEnd(): void {
  nextTick(() => {
    const el = scroller.value?.$el;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}

defineExpose({ scrollToEnd });

/**
 * 处理拖拽开始
 * @param event 拖拽事件
 * @param entry 被拖拽的条目
 */
function onDragStart(event: DragEvent, entry: PromptEntryListItem): void {
  draggedEntry = entry;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
  const target = event.currentTarget as HTMLElement;
  target.classList.add('cv-message-row-dragging');
}

/**
 * 处理拖拽悬停
 * @param event 拖拽事件
 */
function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

/**
 * 处理放置
 * @param event 放置事件
 * @param targetEntry 放置目标条目
 */
function onDrop(event: DragEvent, targetEntry: PromptEntryListItem): void {
  event.preventDefault();
  if (!draggedEntry || draggedEntry.id === targetEntry.id) return;

  const oldIndex = entries.value.findIndex(e => e.id === draggedEntry!.id);
  const newIndex = entries.value.findIndex(e => e.id === targetEntry.id);

  if (oldIndex === -1 || newIndex === -1) return;

  const newEntries = [...entries.value];
  const [removed] = newEntries.splice(oldIndex, 1);
  newEntries.splice(newIndex, 0, removed);
  entries.value = newEntries;
}

/**
 * 处理拖拽结束
 * @param event 拖拽事件
 */
function onDragEnd(event: DragEvent): void {
  draggedEntry = null;
  const target = event.currentTarget as HTMLElement;
  target.classList.remove('cv-message-row-dragging');
}
</script>

<style scoped>
@reference '../../global.css';

.cv-message-list-container {
  @apply mb-(--cv-space-5xl);
}

.cv-message-list-scroller {
  @apply h-full w-full;
}

:deep(.cv-message-list) {
  @apply flex flex-col;
  gap: var(--cv-space-sm);
}

.cv-message-row {
  @apply grid overflow-hidden;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
  transition: all 0.15s ease;
}

.cv-message-row.is-disabled {
  opacity: 0.55;
  background: color-mix(in srgb, var(--cv-surface-container-low) 60%, transparent);
}

.cv-message-row.is-disabled :deep(.cv-indicator) {
  background: color-mix(in srgb, var(--cv-on-surface) 20%, transparent);
  box-shadow: none;
}

.cv-message-row:hover {
  border-color: var(--cv-outline);
  background: var(--cv-surface-container);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 12%, transparent);
}

.cv-message-row-dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.cv-message-handle {
  @apply flex cursor-grab select-none items-center justify-center;
  width: 2rem;
  padding: 0;
  border: none;
  border-right: var(--cv-border-width) solid var(--cv-surface-variant);
  background: transparent;
  color: color-mix(in srgb, var(--cv-on-surface) 25%, transparent);
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.cv-message-row:hover .cv-message-handle {
  background: color-mix(in srgb, var(--cv-on-surface) 3%, transparent);
  color: color-mix(in srgb, var(--cv-on-surface) 50%, transparent);
}

.cv-message-handle:hover {
  color: var(--p-primary-color) !important;
}

.cv-message-handle:active {
  cursor: grabbing;
}

.cv-message-entry {
  min-width: 0;
}

.cv-message-item {
  @apply flex min-w-0 items-center justify-between;
  gap: var(--cv-space-xl);
  min-width: 0;
  padding: var(--cv-space-md) var(--cv-space-xl);
}

.cv-message-main {
  @apply flex min-w-0 items-center;
  flex: 1 1 auto;
  gap: var(--cv-space-xl);
}

.cv-message-actions {
  @apply flex items-center;
  gap: var(--cv-space-xs);
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.cv-message-row:hover .cv-message-actions {
  opacity: 1;
}

.cv-message-actions :deep(.cv-prime-button) {
  @apply min-w-0 p-0;
  width: 1.8rem !important;
  height: 1.8rem !important;
}

.cv-empty-hint {
  @apply mb-(--cv-space-5xl) flex flex-col items-center justify-center text-center;
  gap: var(--cv-space-3xl);
  padding: var(--cv-space-8xl);
  color: var(--p-text-muted-color);
}
</style>
