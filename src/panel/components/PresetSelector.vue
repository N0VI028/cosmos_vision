<template>
  <div class="cv-preset-selector">
    <Select
      :model-value="activePresetId"
      :options="presets"
      option-label="name"
      option-value="id"
      placeholder="选择预设"
      class="cv-preset-select"
      :pt="PRESET_SELECT_PT"
      @update:model-value="$emit('update:activePresetId', $event)"
    />
    <div class="cv-preset-actions">
      <button type="button" class="cv-preset-btn" title="新建预设" aria-label="新建预设" @click="$emit('create')">
        <i class="fa-solid fa-plus" />
      </button>
      <button
        type="button"
        class="cv-preset-btn"
        title="克隆当前预设"
        aria-label="克隆当前预设"
        @click="$emit('clone')"
      >
        <i class="fa-solid fa-copy" />
      </button>
      <button
        type="button"
        class="cv-preset-btn"
        title="重命名当前预设"
        aria-label="重命名当前预设"
        @click="$emit('rename')"
      >
        <i class="fa-solid fa-pen" />
      </button>
      <button
        type="button"
        class="cv-preset-btn cv-preset-btn-danger"
        title="删除当前预设"
        aria-label="删除当前预设"
        @click="handleDeleteActiveClick"
      >
        <i class="fa-solid fa-trash" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';

interface PresetOption {
  id: string;
  name: string;
}

const props = defineProps<{
  presets: PresetOption[];
  activePresetId: string;
  defaultPresetId: string;
}>();

const emit = defineEmits<{
  'update:activePresetId': [id: string];
  create: [];
  clone: [];
  rename: [];
  'delete-preset': [id: string];
}>();
const PRESET_SELECT_PT = {
  label: {
    class: 'cv-prime-field-text',
    style: { padding: '0 var(--cv-space-sm) 0 0', color: 'var(--p-primary-color)' },
  },
  dropdown: { style: { width: 'auto', color: 'var(--p-primary-color)' } },
} as const;

const showConfirm =
  inject<
    (options: {
      title?: string;
      message: string;
      acceptLabel?: string;
      cancelLabel?: string;
      severity?: string;
    }) => Promise<boolean>
  >('showConfirm');

/**
 * 触发删除当前预设，执行前置校验与二次确认
 */
async function handleDeleteActiveClick(): Promise<void> {
  if (props.activePresetId === props.defaultPresetId) {
    toastr.warning('默认预设不能删除');
    return;
  }
  if (props.presets.length <= 1) {
    toastr.warning('至少保留一个预设');
    return;
  }
  const current = props.presets.find(p => p.id === props.activePresetId);
  if (current && showConfirm) {
    const confirmed = await showConfirm({
      title: '删除预设',
      message: `确定要删除当前预设 "${current.name}" 吗？此操作无法撤销。`,
      severity: 'danger',
      acceptLabel: '确认删除',
      cancelLabel: '取消',
    });
    if (confirmed) {
      emit('delete-preset', props.activePresetId);
    }
  }
}
</script>

<style scoped>
.cv-preset-selector {
  display: flex;
  align-items: center;
  gap: var(--cv-space-md);
  padding: 0 var(--cv-space-xs);
}

.cv-preset-select {
  --p-select-focus-ring-color: transparent;
  --p-select-focus-ring-offset: 0;
  --p-select-focus-ring-shadow: none;
  --p-select-focus-ring-style: none;
  --p-select-focus-ring-width: 0;
  display: inline-flex;
  align-items: center;
  flex: 0 1 9em;
  width: 9em !important;
  height: auto !important;
  min-width: 0;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--p-primary-color) !important;
  cursor: pointer;
  font-size: calc(var(--mainFontSize) * 0.85) !important;
  font-weight: 600;
}

.cv-preset-actions {
  display: flex;
  align-items: center;
  gap: var(--cv-space-sm);
  margin-left: auto;
}

.cv-preset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2em;
  height: 2em;
  padding: 0;
  background: transparent;
  border: var(--cv-border-width) solid transparent;
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  font-size: calc(var(--mainFontSize) * 0.75);
  transition: all 0.15s ease;
}

.cv-preset-btn:hover {
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--p-primary-color) 40%, transparent);
}

.cv-preset-btn-danger:hover {
  color: var(--p-red-500);
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--p-red-500) 40%, transparent);
}

@media (max-width: 48rem) {
  .cv-preset-selector {
    flex-wrap: nowrap;
  }

  .cv-preset-select {
    flex: 1 1 auto;
    width: auto !important;
    min-width: 0;
  }

  .cv-preset-actions {
    flex-shrink: 0;
  }
}
</style>
