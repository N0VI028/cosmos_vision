<template>
  <VueDraggable
    v-if="entries.length > 0"
    v-model="entries"
    class="cv-message-list"
    handle=".cv-message-handle"
    :animation="150"
    ghost-class="cv-message-row-ghost"
    :force-fallback="true"
    :fallback-on-body="true"
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
  </VueDraggable>
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
</script>

<style scoped>
.cv-message-list {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-sm);
  margin-bottom: var(--cv-space-5xl);
}

.cv-message-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  overflow: hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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

.cv-message-row-ghost {
  border: 1px dashed var(--p-primary-color) !important;
  background: rgba(255, 255, 255, 0.05) !important;
  opacity: 0.4;
}

.cv-message-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  padding: 0;
  border: none;
  border-right: var(--cv-border-width) solid var(--cv-surface-variant);
  background: transparent;
  color: color-mix(in srgb, var(--cv-on-surface) 25%, transparent);
  cursor: grab;
  font-size: 0.8rem;
  user-select: none;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cv-space-xl);
  min-width: 0;
  padding: var(--cv-space-md) var(--cv-space-xl);
}

.cv-message-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--cv-space-xl);
  min-width: 0;
}

.cv-message-actions {
  display: flex;
  align-items: center;
  gap: var(--cv-space-xs);
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.cv-message-row:hover .cv-message-actions {
  opacity: 1;
}

.cv-message-actions :deep(.p-button) {
  width: 1.8rem !important;
  min-width: 0 !important;
  height: 1.8rem !important;
  padding: 0 !important;
}

.cv-empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-3xl);
  margin-bottom: var(--cv-space-5xl);
  padding: var(--cv-space-9xl);
  color: var(--p-text-muted-color);
  text-align: center;
}
</style>
