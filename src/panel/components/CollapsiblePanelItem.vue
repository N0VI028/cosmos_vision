<template>
  <Panel :class="['cv-collapsible-panel', { 'cv-collapsible-panel--disabled': disabled }]" :collapsed="collapsed">
    <template #header>
      <div class="cv-collapsible-panel-header" @click="$emit('toggle')">
        <div class="cv-collapsible-panel-title">
          <span>{{ title }}</span>
        </div>
        <div class="cv-collapsible-panel-actions-wrapper">
          <div v-if="$slots.actions" class="cv-collapsible-panel-actions" @click.stop @keydown.stop>
            <slot name="actions" />
          </div>
          <i
            :class="[
              'fa-solid',
              collapsed ? 'fa-caret-right' : 'fa-caret-down',
              'cv-collapsible-panel-toggle-icon',
            ]"
          />
        </div>
      </div>
    </template>

    <slot />
  </Panel>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    collapsed: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

defineEmits<{
  toggle: [];
}>();
</script>

<style scoped>
@reference '../../global.css';

.cv-collapsible-panel {
  @apply overflow-hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}

.cv-collapsible-panel--disabled :deep(.cv-prime-panel-header),
.cv-collapsible-panel--disabled :deep(.cv-prime-panel-content) {
  opacity: 0.62;
}

.cv-collapsible-panel-header {
  @apply flex w-full min-w-0 cursor-pointer items-center justify-between;
  flex: 1 1 auto;
  gap: var(--cv-space-lg);
}

.cv-collapsible-panel-title {
  @apply min-w-0 overflow-hidden;
  flex: 1 1 auto;
}

.cv-collapsible-panel-title > span {
  @apply block overflow-hidden text-ellipsis whitespace-nowrap;
  color: var(--cv-on-surface);
  font-weight: 600;
}

.cv-collapsible-panel-actions-wrapper,
.cv-collapsible-panel-actions {
  @apply flex items-center;
  gap: var(--cv-space-sm);
}

.cv-collapsible-panel-actions-wrapper {
  @apply min-w-0;
  flex: 0 0 auto;
}

.cv-collapsible-panel-toggle-icon {
  color: var(--cv-on-surface-variant);
  transition: transform 0.2s ease;
}

@media (max-width: 38rem) {
  .cv-collapsible-panel-actions {
    @apply flex-wrap justify-end;
  }
}
</style>
