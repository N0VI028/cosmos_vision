<template>
  <div class="flex flex-col gap-(--cv-space-sm)">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-(--cv-space-lg)">
      <Button label="导入 API JSON" icon="fa-solid fa-download" size="small" @click="emit('import')" />
      <Button
        :label="showAdvancedJson ? '收起 API JSON' : '编辑 API JSON'"
        icon="fa-solid fa-code"
        severity="secondary"
        size="small"
        variant="outlined"
        @click="emit('toggle-json')"
      />
    </div>
    <div v-if="statusText" class="cv-field-hint" :class="statusClass">{{ statusText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  showAdvancedJson: boolean;
  statusText?: string;
  statusTone?: 'info' | 'warn' | 'error';
}>();

const emit = defineEmits<{
  import: [];
  'toggle-json': [];
}>();

const statusClass = computed(() => {
  if (props.statusTone === 'error') return 'text-[var(--p-red-500,var(--cv-on-surface))]';
  if (props.statusTone === 'warn') return 'text-[var(--p-orange-500,var(--cv-on-surface))]';
  return 'text-(--cv-on-surface-variant)';
});
</script>
