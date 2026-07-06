<template>
  <Card
    :dt="cardTokens"
    :pt="cardPt"
    :class="cardClass"
    :tabindex="selecting && !disabled ? 0 : undefined"
    @click="handleClick"
    @keydown.enter.prevent="handleKeyboardToggle"
    @keydown.space.prevent="handleKeyboardToggle"
  >
    <template #content>
      <slot />
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { CardDesignTokens } from '@primeuix/themes/types/card';
import type { CardPassThroughOptions } from 'primevue/card';
import Card from 'primevue/card';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    selected?: boolean;
    selecting?: boolean;
    disabled?: boolean;
  }>(),
  {
    selected: false,
    selecting: false,
    disabled: false,
  },
);

const emit = defineEmits<{ toggle: [] }>();

const cardTokens = {
  root: {
    background: 'var(--cv-surface-container-low)',
    borderRadius: 'var(--cv-radius-sm)',
    color: 'var(--cv-on-surface)',
    shadow: 'none',
  },
  body: {
    padding: '0',
    gap: '0',
  },
} satisfies CardDesignTokens;
const cardPt = {
  root: { class: 'cv-data-card-root' },
  body: { class: 'cv-data-card-body' },
  content: { class: 'cv-data-card-content' },
} satisfies CardPassThroughOptions;
const cardClass = computed(() => ({
  'cv-data-card': true,
  'cv-data-card--selecting': props.selecting,
  'cv-data-card--selected': props.selected,
  'cv-data-card--disabled': props.disabled,
}));

/**
 * 处理选择模式下的卡片点击
 */
function handleClick(): void {
  if (!props.selecting || props.disabled) return;
  emit('toggle');
}

/**
 * 处理选择模式下的键盘切换
 */
function handleKeyboardToggle(): void {
  if (!props.selecting || props.disabled) return;
  emit('toggle');
}
</script>

<style scoped>
@reference '../../global.css';

.cv-data-card {
  @apply relative min-w-0 overflow-hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.cv-data-card--selecting {
  @apply cursor-pointer;
}

.cv-data-card--selected {
  border-color: var(--cv-primary-container);
  background: color-mix(in srgb, var(--cv-primary-container) 10%, var(--cv-surface-container-low));
}

.cv-data-card--disabled {
  @apply cursor-not-allowed;
  opacity: 0.68;
}

.cv-data-card:focus-visible {
  outline: var(--p-focus-ring-width, 0.1333em) var(--p-focus-ring-style, solid)
    var(--p-focus-ring-color, color-mix(in srgb, var(--cv-primary-container) 28%, transparent));
  outline-offset: var(--p-focus-ring-offset, 0.1333em);
}
</style>
