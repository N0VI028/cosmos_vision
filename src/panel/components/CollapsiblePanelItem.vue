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
.cv-collapsible-panel {
  overflow: hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}

.cv-collapsible-panel--disabled :deep(.cv-prime-panel-header),
.cv-collapsible-panel--disabled :deep(.cv-prime-panel-content) {
  opacity: 0.62;
}

.cv-collapsible-panel-header {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--cv-space-lg);
  width: 100%;
  min-width: 0;
  cursor: pointer;
}

.cv-collapsible-panel-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.cv-collapsible-panel-title > span {
  display: block;
  overflow: hidden;
  color: var(--cv-on-surface);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-collapsible-panel-actions-wrapper,
.cv-collapsible-panel-actions {
  display: flex;
  align-items: center;
  gap: var(--cv-space-sm);
}

.cv-collapsible-panel-actions-wrapper {
  flex: 0 0 auto;
  min-width: 0;
}

.cv-collapsible-panel-toggle-icon {
  color: var(--cv-on-surface-variant);
  transition: transform 0.2s ease;
}

@media (max-width: 38rem) {
  .cv-collapsible-panel-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
</style>
