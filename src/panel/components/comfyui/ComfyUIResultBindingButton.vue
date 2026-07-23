<template>
  <!--
    段落生图结果绑定按钮：状态 class 直接挂在根上。
    父级 .cv-workflow-inspector__port 需带 group/port，才能在 hover 媒体下显示 inactive。
  -->
  <button
    type="button"
    class="cv-workflow-action-btn flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-solid px-[0.4rem] py-[0.15rem] text-(length:--cv-font-size-2xs) leading-[1.2] select-none transition-all duration-200 w-fit min-h-auto"
    :class="rootStateClass"
    :disabled="disabled"
    @click="emit('click')"
  >
    <i :class="active ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle-dot'" aria-hidden="true" />
    <span>段落生图结果</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  active: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

/** 绑定按钮三态 + 禁用：样式挂在元素自身，避免父级 :deep */
const rootStateClass = computed(() => {
  if (props.disabled) {
    return 'is-disabled opacity-40! cursor-not-allowed!';
  }
  if (props.active) {
    return [
      'is-active opacity-100!',
      'bg-[color-mix(in_srgb,var(--p-primary-color)_12%,transparent)]!',
      'border-(--p-primary-color)! text-(--p-primary-color)!',
      'hover:bg-[color-mix(in_srgb,var(--p-primary-color)_20%,transparent)]!',
    ].join(' ');
  }
  return [
    'is-inactive',
    'bg-(--cv-surface-container-low)! border-(--cv-outline)! text-(--cv-on-surface-variant)!',
    'hover:bg-(--cv-surface-container-high)!',
    // 精确指针设备：默认隐藏，端口行 hover 时显现（父级需 group/port）
    '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none',
    '[@media(hover:hover)]:group-hover/port:opacity-60 [@media(hover:hover)]:group-hover/port:pointer-events-auto',
    '[@media(hover:hover)]:group-hover/port:hover:opacity-100',
  ].join(' ');
});
</script>
