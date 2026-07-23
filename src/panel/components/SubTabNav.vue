<template>
  <div
    class="cv-subtab-nav flex w-fit justify-start gap-0 rounded-(--cv-radius-full) bg-(--cv-surface-container-low) p-(--cv-space-sm) max-[87.5em]:w-full max-[87.5em]:overflow-x-auto"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="cv-subtab-item cursor-pointer border-0 bg-transparent font-(family-name:--cv-font-body) text-(length:--cv-font-size-sm) normal-case transition-all duration-150 ease-in-out max-[87.5em]:min-w-0 max-[87.5em]:flex-auto max-[87.5em]:px-(--cv-space-xl)"
      :class="
        modelValue === tab.value
          ? 'min-w-[6em] rounded-(--cv-radius-full) bg-(--cv-surface-container-lowest,var(--cv-surface))! px-(--cv-space-5xl) py-(--cv-space-md) font-medium text-(--cv-on-surface)!'
          : 'min-w-[6em] rounded-(--cv-radius-full) px-(--cv-space-5xl) py-(--cv-space-md) font-normal text-(--cv-on-surface-variant) hover:text-(--cv-on-surface)'
      "
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
