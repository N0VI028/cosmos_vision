<template>
  <Card
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

/** 全局 card token 已是数据卡默认；局部仅叠业务状态 class 锚点 */
const cardPt = {
  root: { class: 'cv-data-card-root' },
  body: { class: 'cv-data-card-body' },
  content: { class: 'cv-data-card-content' },
} satisfies CardPassThroughOptions;

const cardClass = computed(() => [
  // 语义锚点 + 布局；选中/禁用/焦点用工具类表达
  'cv-data-card relative min-w-0 overflow-hidden border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) transition-[border-color,background] duration-150 ease-in-out',
  'focus-visible:outline focus-visible:outline-(length:--p-focus-ring-width,0.1333em) focus-visible:outline-(--p-focus-ring-style,solid) focus-visible:outline-[color:var(--p-focus-ring-color,color-mix(in_srgb,var(--cv-primary-container)_28%,transparent))] focus-visible:outline-offset-(--p-focus-ring-offset,0.1333em)',
  props.selecting && 'cursor-pointer',
  props.selected &&
    'border-(--cv-primary-container) bg-[color-mix(in_srgb,var(--cv-primary-container)_10%,var(--cv-surface-container-low))]',
  props.disabled && 'cursor-not-allowed opacity-[0.68]',
]);

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
