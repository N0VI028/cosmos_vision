<template>
  <div v-if="entries.length > 0" class="cv-message-list-container">
    <div
      ref="listEl"
      class="cv-message-list custom-scrollbar"
      :class="{ 'is-dragging': isDragging }"
      :style="{ maxHeight: scrollHeight }"
    >
      <VueDraggable
        v-model="entries"
        v-bind="dragOptions"
        class="cv-message-list-body"
        @start="isDragging = true"
        @end="isDragging = false"
      >
        <section
          v-for="entry in entries"
          :key="entry.id"
          class="cv-message-row"
          :class="{ 'is-disabled': entry.enabled === false }"
          :data-role="getRole?.(entry)"
        >
          <button type="button" class="cv-message-handle" title="拖拽排序" aria-label="拖拽排序">
            <i class="fa-solid fa-grip-vertical" />
          </button>
          <div class="cv-message-item">
            <div class="cv-message-main">
              <slot name="main" :entry="entry" />
            </div>
            <div class="cv-message-actions">
              <slot name="actions" :entry="entry" />
            </div>
          </div>
        </section>
      </VueDraggable>
    </div>
  </div>
  <div v-else class="cv-empty-hint">{{ emptyText }}</div>
</template>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus';

export interface PromptEntryListItem {
  id: string;
  enabled?: boolean;
}

defineProps<{
  emptyText: string;
  getRole?: (entry: PromptEntryListItem) => string;
}>();

const entries = defineModel<PromptEntryListItem[]>({ required: true });

/** 单行高度（含间距），用于限制可视区域 */
const entryItemHeight = 48;
const visibleItemLimit = 7;

const scrollHeight = computed(() => `${Math.min(entries.value.length, visibleItemLimit) * entryItemHeight}px`);
const listEl = ref<HTMLElement | null>(null);
const isDragging = ref(false);

/** Sortable 配置：forceFallback 保证手机可用，fallback 浮层挂 body */
const dragOptions = {
  handle: '.cv-message-handle',
  animation: 150,
  ghostClass: 'cv-message-row-ghost',
  chosenClass: 'cv-message-row-chosen',
  forceFallback: true,
  fallbackClass: 'cv-message-row-fallback',
  fallbackOnBody: true,
  delayOnTouchOnly: true,
  delay: 120,
  touchStartThreshold: 5,
  bubbleScroll: true,
};

/**
 * 滚动到列表末尾，使新增条目可见
 */
function scrollToEnd(): void {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

defineExpose({ scrollToEnd });
</script>

<style scoped>
@reference '../../global.css';

.cv-message-list-container {
  @apply mb-(--cv-space-5xl);
}

.cv-message-list {
  @apply w-full overflow-y-auto;
}

.cv-message-list-body {
  @apply flex w-full flex-col;
  gap: var(--cv-space-sm);
}

.cv-message-row {
  @apply grid overflow-hidden;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.cv-message-list.is-dragging .cv-message-row {
  transition: none;
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
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 12%, transparent);
}

.cv-message-row-chosen {
  border-color: var(--p-primary-color);
  opacity: 0.85;
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
  touch-action: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
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

.cv-message-item {
  @apply flex min-w-0 items-center justify-between;
  gap: var(--cv-space-xl);
  padding: var(--cv-space-md) var(--cv-space-xl);
}

.cv-message-main {
  @apply flex min-w-0 flex-1 items-center;
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

.cv-message-list.is-dragging .cv-message-actions {
  opacity: 0.35;
  pointer-events: none;
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

<!-- ghost/fallback 可能挂到 body，需非 scoped -->
<style>
.cv-message-row-ghost {
  opacity: 1 !important;
  border-style: dashed !important;
  border-color: var(--p-primary-color) !important;
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  box-shadow: none !important;
}

.cv-message-row-ghost > * {
  opacity: 0;
}

.cv-message-row-fallback {
  z-index: 10000;
  opacity: 0.95 !important;
  border-color: var(--p-primary-color) !important;
  background: var(--cv-surface-container) !important;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--cv-on-surface) 24%, transparent) !important;
  pointer-events: none;
  cursor: grabbing !important;
}
</style>
