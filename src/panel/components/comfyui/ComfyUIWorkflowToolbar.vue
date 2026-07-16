<template>
  <div class="grid grid-cols-2 gap-(--cv-space-lg)">
    <Button label="导入 JSON" icon="fa-solid fa-download" size="small" @click="emit('import')" />
    <Button
      :label="showAdvancedJson ? '收起 JSON' : '编辑 JSON'"
      icon="fa-solid fa-code"
      severity="secondary"
      size="small"
      variant="outlined"
      @click="emit('toggle-json')"
    />
    <div v-if="statusText" class="text-(--cv-font-size-sm)" :class="statusClass">{{ statusText }}</div>
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
