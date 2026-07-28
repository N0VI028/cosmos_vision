<template>
  <button
    v-bind="$attrs"
    type="button"
    class="mb-(--cv-space-5xl) flex w-full cursor-pointer items-center justify-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-md) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) transition-all duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--p-primary-color) hover:shadow-[0_var(--cv-space-sm)_var(--cv-space-3xl)_color-mix(in_srgb,var(--cv-on-surface)_10%,transparent)]"
  >
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
