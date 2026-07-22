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
      <input
        ref="fileInput"
        type="file"
        :accept="importAccept"
        class="cv-preset-file-input"
        @change="handleFileChange"
      />
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
        v-if="showPortability"
        type="button"
        class="cv-preset-btn"
        title="导出当前预设"
        aria-label="导出当前预设"
        @click="$emit('export-preset')"
      >
        <i class="fa-solid fa-file-export" />
      </button>
      <button
        v-if="showPortability"
        type="button"
        class="cv-preset-btn"
        title="导入预设"
        aria-label="导入预设"
        @click="openFilePicker"
      >
        <i class="fa-solid fa-file-import" />
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
import { inject, ref } from 'vue';

interface PresetOption {
  id: string;
  name: string;
}

const props = withDefaults(
  defineProps<{
    presets: PresetOption[];
    activePresetId: string;
    defaultPresetId: string;
    showPortability?: boolean;
    importAccept?: string;
  }>(),
  {
    showPortability: false,
    importAccept: 'application/json,.json',
  },
);

const emit = defineEmits<{
  'update:activePresetId': [id: string];
  create: [];
  clone: [];
  rename: [];
  'export-preset': [];
  'import-presets': [file: File];
  'delete-preset': [id: string];
}>();
const PRESET_SELECT_PT = {
  label: { class: 'cv-prime-field-text cv-preset-select-label' },
  dropdown: { class: 'cv-preset-select-dropdown' },
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
const fileInput = ref<HTMLInputElement | null>(null);

/**
 * 打开预设文件选择器
 */
function openFilePicker(): void {
  fileInput.value?.click();
}

/**
 * 读取用户选择的预设文件
 * @param event 文件输入事件
 */
function handleFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) emit('import-presets', file);
  if (fileInput.value) fileInput.value.value = '';
}

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
@reference '../../global.css';

.cv-preset-selector {
  @apply flex items-center;
  gap: var(--cv-space-md);
}

/* 伪装链接式 Select：全局 focusRing 已清零，仅保留布局与主色 */
.cv-preset-select {
  @apply inline-flex min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 shadow-none;
  flex: 0 1 9em;
  width: 9em !important;
  height: auto !important;
  color: var(--p-primary-color) !important;
  font-size: var(--cv-font-size-sm) !important;
  font-weight: 600;
}

.cv-preset-select :deep(.cv-preset-select-label) {
  padding: 0 var(--cv-space-sm) 0 0;
  color: var(--p-primary-color);
}

.cv-preset-select :deep(.cv-preset-select-dropdown) {
  width: auto;
  color: var(--p-primary-color);
}

.cv-preset-actions {
  @apply ml-auto flex items-center;
  gap: var(--cv-space-sm);
}

.cv-preset-btn {
  @apply inline-flex cursor-pointer items-center justify-center;
  width: 2em;
  height: 2em;
  padding: 0;
  background: transparent;
  border: var(--cv-border-width) solid transparent;
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-2xs);
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

.cv-preset-file-input {
  @apply hidden;
}

@media (max-width: 48rem) {
  .cv-preset-selector {
    @apply flex-nowrap;
  }

  .cv-preset-select {
    flex: 1 1 auto;
    width: auto !important;
    @apply min-w-0;
  }

  .cv-preset-actions {
    @apply shrink-0;
  }
}
</style>
