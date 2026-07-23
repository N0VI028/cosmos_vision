<template>
  <div
    class="cv-preset-selector flex items-center gap-(--cv-space-md) max-[48rem]:flex-nowrap"
  >
    <Select
      :model-value="activePresetId"
      :options="presets"
      option-label="name"
      option-value="id"
      placeholder="选择预设"
      class="cv-preset-select inline-flex h-auto! w-[9em]! min-w-0 flex-[0_1_9em] cursor-pointer items-center border-0 bg-transparent p-0 text-(length:--cv-font-size-sm)! font-semibold text-(--p-primary-color)! shadow-none max-[48rem]:w-auto! max-[48rem]:min-w-0 max-[48rem]:flex-[1_1_auto] [&_.cv-preset-select-dropdown]:w-auto [&_.cv-preset-select-dropdown]:text-(--p-primary-color) [&_.cv-preset-select-label]:pr-(--cv-space-sm) [&_.cv-preset-select-label]:pl-0 [&_.cv-preset-select-label]:text-(--p-primary-color)"
      :pt="PRESET_SELECT_PT"
      @update:model-value="$emit('update:activePresetId', $event)"
    />
    <div class="cv-preset-actions ml-auto flex items-center gap-(--cv-space-sm) max-[48rem]:shrink-0">
      <input
        ref="fileInput"
        type="file"
        :accept="importAccept"
        class="hidden"
        @change="handleFileChange"
      />
      <button
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-primary-color)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,transparent)] hover:text-(--p-primary-color)"
        title="新建预设"
        aria-label="新建预设"
        @click="$emit('create')"
      >
        <i class="fa-solid fa-plus" />
      </button>
      <button
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-primary-color)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,transparent)] hover:text-(--p-primary-color)"
        title="克隆当前预设"
        aria-label="克隆当前预设"
        @click="$emit('clone')"
      >
        <i class="fa-solid fa-copy" />
      </button>
      <button
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-primary-color)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,transparent)] hover:text-(--p-primary-color)"
        title="重命名当前预设"
        aria-label="重命名当前预设"
        @click="$emit('rename')"
      >
        <i class="fa-solid fa-pen" />
      </button>
      <button
        v-if="showPortability"
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-primary-color)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,transparent)] hover:text-(--p-primary-color)"
        title="导出当前预设"
        aria-label="导出当前预设"
        @click="$emit('export-preset')"
      >
        <i class="fa-solid fa-file-export" />
      </button>
      <button
        v-if="showPortability"
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-primary-color)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-primary-color)_10%,transparent)] hover:text-(--p-primary-color)"
        title="导入预设"
        aria-label="导入预设"
        @click="openFilePicker"
      >
        <i class="fa-solid fa-file-import" />
      </button>
      <button
        type="button"
        class="inline-flex size-[2em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent p-0 text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant) transition-all duration-150 ease-in-out hover:border-[color-mix(in_srgb,var(--p-red-500)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-red-500)_10%,transparent)] hover:text-(--p-red-500)"
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
