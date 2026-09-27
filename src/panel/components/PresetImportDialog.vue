<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    :header="props.title"
    :style="DIALOG_STYLE"
    :content-style="{ overflow: 'hidden' }"
  >
    <!-- 入口态：选择导入方式 -->
    <div v-if="mode === 'entry'" class="flex flex-col gap-(--cv-space-lg) py-(--cv-space-sm)">
      <input
        ref="fileInputRef"
        type="file"
        :accept="props.importAccept"
        class="hidden"
        @change="onFileSelected"
      >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-2xl) text-(length:--cv-font-size-sm) text-(--cv-on-surface) transition-all duration-200 ease-in-out hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--cvp-primary-color)"
        @click="triggerFileInput"
      >
        <i class="fa-solid fa-file-import text-(length:--cv-font-size-base)" />
        <span>导入文件</span>
      </button>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-2xl) text-(length:--cv-font-size-sm) text-(--cv-on-surface) transition-all duration-200 ease-in-out hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--cvp-primary-color)"
        @click="startSelectDefaults"
      >
        <i class="fa-solid fa-clock-rotate-left text-(length:--cv-font-size-base)" />
        <span>{{ props.defaultsEntryLabel }}</span>
      </button>
    </div>

    <!-- 列表态：勾选默认预设 -->
    <ImportSelectionList v-else v-model:selected-ids="selectedIds" :rows="defaultRows" />

    <!-- 底部操作栏（列表态下展示） -->
    <template v-if="mode === 'list'" #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text :fluid="false" @click="visible = false" />
        <Button
          :label="`导入所选 (${selectedCount})`"
          icon="fa-solid fa-file-import"
          :disabled="selectedCount === 0"
          :fluid="false"
          @click="confirmImportDefaults"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import ImportSelectionList from '@/panel/components/ImportSelectionList.vue';

/** 默认预设条目 */
interface PresetImportDefault {
  id: string;
  name: string;
  description?: string;
}

/** 弹窗样式 */
const DIALOG_STYLE = {
  width: '26rem',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

type DialogMode = 'entry' | 'list';

const visible = defineModel<boolean>('visible', { required: true });

const props = withDefaults(
  defineProps<{
    /** 弹窗标题 */
    title: string;
    /** 可导入的默认预设列表 */
    defaults: PresetImportDefault[];
    /** 当前已存在的预设 ID 列表 */
    existingIds: string[];
    /** 本地文件选择器接受的类型 */
    importAccept?: string;
    /** 入口态"导入默认预设"按钮文案，按领域替换（如"导入默认工作流"） */
    defaultsEntryLabel?: string;
  }>(),
  {
    importAccept: 'application/json,.json',
    defaultsEntryLabel: '导入默认预设',
  },
);

const emit = defineEmits<{
  /** 导入单个预设文件 */
  'import-file': [file: File];
  /** 导入勾选的默认预设 ID 列表 */
  'import-defaults': [ids: string[]];
}>();

const mode = ref<DialogMode>('entry');
const selectedIds = ref<ReadonlySet<string>>(new Set());
const fileInputRef = ref<HTMLInputElement | null>(null);

const selectedCount = computed(() => selectedIds.value.size);

/** 列表态的默认预设行 */
const defaultRows = computed(() =>
  props.defaults.map(preset => ({
    id: preset.id,
    title: preset.name,
    subtitle: describePreset(preset.id, preset.description),
  })),
);

watch(visible, opened => {
  if (opened) {
    resetState();
  }
});

/**
 * 触发本地预设文件选择
 */
function triggerFileInput(): void {
  fileInputRef.value?.click();
}

/**
 * 处理选中的本地文件
 * @param event 文件变更事件
 */
function onFileSelected(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    emit('import-file', file);
    visible.value = false;
  }
  target.value = '';
}

/**
 * 进入默认预设勾选列表态
 */
function startSelectDefaults(): void {
  selectedIds.value = new Set(
    props.defaults.filter(preset => !props.existingIds.includes(preset.id)).map(preset => preset.id),
  );
  mode.value = 'list';
}

/**
 * 描述默认预设副标题
 * @param id 预设 ID
 * @param description 预设自带描述
 * @returns 副标题文本
 */
function describePreset(id: string, description?: string): string {
  if (props.existingIds.includes(id)) return '已存在，导入将恢复初始内容';
  return description ?? '内置默认预设';
}

/**
 * 提交勾选的默认预设并关闭弹窗
 */
function confirmImportDefaults(): void {
  const ids = props.defaults.filter(preset => selectedIds.value.has(preset.id)).map(preset => preset.id);
  if (!ids.length) return;
  emit('import-defaults', ids);
  visible.value = false;
}

/**
 * 重置弹窗内部状态为初始入口态
 */
function resetState(): void {
  mode.value = 'entry';
  selectedIds.value = new Set();
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}
</script>
