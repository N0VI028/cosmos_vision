<template>
  <div class="cv-subtab-nav">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="cv-subtab-item"
      :class="{ 'cv-subtab-item--active': modelValue === tab.value }"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
interface SubTab<T> {
  value: T;
  label: string;
}

defineProps<{
  tabs: ReadonlyArray<SubTab<T>>;
  modelValue: T;
}>();

defineEmits<{
  'update:modelValue': [value: T];
}>();
</script>

<style scoped>
@reference '../../global.css';

/* 子标签导航 - 分段控制器样式 */
.cv-subtab-nav {
  @apply flex w-fit justify-start gap-0;
  padding: var(--cv-space-sm);
  background: var(--cv-surface-container-low);
  border-radius: var(--cv-radius-full);
}

.cv-subtab-item {
  @apply cursor-pointer border-0 bg-transparent;
  min-width: 6em;
  padding: var(--cv-space-md) var(--cv-space-5xl);
  border-radius: var(--cv-radius-full);
  font-family: var(--cv-font-body);
  font-size: calc(var(--mainFontSize) * 0.8667);
  font-weight: 400;
  color: var(--cv-on-surface-variant);
  transition: all 0.15s ease;
  text-transform: none;
}

.cv-subtab-item:hover:not(.cv-subtab-item--active) {
  color: var(--cv-on-surface);
}

.cv-subtab-item--active {
  background: var(--cv-surface-container-lowest, var(--cv-surface)) !important;
  color: var(--cv-on-surface) !important;
  font-weight: 500;
}

@media (max-width: 66.6667em) {
  .cv-subtab-nav {
    @apply w-full overflow-x-auto;
  }
  .cv-subtab-item {
    @apply flex-auto;
    flex: 1 1 auto;
    min-width: unset;
    padding: var(--cv-space-md) var(--cv-space-xl);
  }
}
</style>
