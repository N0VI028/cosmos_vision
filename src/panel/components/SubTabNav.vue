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
/* 子标签导航 - 分段控制器样式 */
.cv-subtab-nav {
  display: flex;
  gap: 0;
  justify-content: flex-start;
  padding: var(--cv-space-sm);
  background: var(--cv-surface-container-low);
  border-radius: var(--cv-radius-full);
  width: fit-content;
}

.cv-subtab-item {
  min-width: 6em;
  padding: var(--cv-space-md) var(--cv-space-5xl);
  border-radius: var(--cv-radius-full);
  font-family: var(--cv-font-body);
  font-size: calc(var(--mainFontSize) * 0.8667);
  font-weight: 400;
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  background: transparent;
  border: none;
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
    width: 100%;
    overflow-x: auto;
  }
  .cv-subtab-item {
    flex: 1 1 auto;
    min-width: unset;
    padding: var(--cv-space-md) var(--cv-space-xl);
  }
}
</style>
