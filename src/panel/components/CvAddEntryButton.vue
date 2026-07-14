<template>
  <button v-bind="$attrs" type="button" class="cv-add-entry-button">
    <i class="fa-solid fa-plus" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });

interface Props {
  label: string;
}

defineProps<Props>();
</script>

<style scoped>
@reference '../../global.css';

.cv-add-entry-button {
  @apply mb-(--cv-space-5xl) flex w-full cursor-pointer items-center justify-center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-sm);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-add-entry-button:hover {
  border-color: var(--cv-outline);
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 10%, transparent);
}
</style>
