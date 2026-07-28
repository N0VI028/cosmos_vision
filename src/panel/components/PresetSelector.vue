<template>
  <div class="cv-preset-selector">
    <Select
      :model-value="activePresetId"
      :options="presets"
      option-label="name"
      option-value="id"
      placeholder="选择预设"
      class="cv-preset-select"
      :dt="PRESET_SELECT_DT"
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
      <CvMiniButton
        icon="fa-regular fa-plus"
        title="新建预设"
        aria-label="新建预设"
        @click="$emit('create')"
      />
      <CvMiniButton
        icon="fa-regular fa-copy"
        title="克隆当前预设"
        aria-label="克隆当前预设"
        @click="$emit('clone')"
      />
      <CvMiniButton
        icon="fa-regular fa-pen"
        title="重命名当前预设"
        aria-label="重命名当前预设"
        @click="$emit('rename')"
      />
      <CvMiniButton
        v-if="showPortability"
        icon="fa-regular fa-file-export"
        title="导出当前预设"
        aria-label="导出当前预设"
        @click="$emit('export-preset')"
      />
      <CvMiniButton
        v-if="showPortability"
        icon="fa-regular fa-file-import"
        title="导入预设"
        aria-label="导入预设"
        @click="openFilePicker"
      />
      <CvMiniButton
        icon="fa-regular fa-trash"
        tone="danger"
        title="删除当前预设"
        aria-label="删除当前预设"
        @click="handleDeleteActiveClick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';

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
const PRESET_SELECT_DT = {
  background: 'transparent',
  disabledBackground: 'transparent',
  filledBackground: 'transparent',
  filledHoverBackground: 'transparent',
  filledFocusBackground: 'transparent',
  borderColor: 'transparent',
  hoverBorderColor: 'transparent',
  focusBorderColor: 'transparent',
  color: 'var(--p-primary-color)',
  placeholderColor: 'var(--p-primary-color)',
  shadow: 'none',
  paddingX: '0',
  paddingY: '0',
  dropdownColor: 'var(--p-primary-color)',
  fontSize: 'var(--cv-font-size-xs)',
} as const;

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

/**
 * 伪装链接式 Select：无边框、无底色，主色文字
 */
.cv-preset-select {
  @apply inline-flex min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 shadow-none;
  flex: 0 1 9em;
  width: 9em;
  height: auto;
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
  gap: var(--cv-space-xs);
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
    width: auto;
    @apply min-w-0;
  }

  .cv-preset-actions {
    @apply shrink-0;
  }
}
</style>
