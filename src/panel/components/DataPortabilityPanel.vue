<template>
    <h2 class="cv-section-title">导出数据</h2>
    <div class="cv-section-body flex flex-col">
      <div class="flex flex-col gap-(--cv-space-md)">
        <div class="flex flex-wrap items-center gap-(--cv-space-md)">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="cursor-pointer rounded-(--cv-radius-full) border border-solid px-[0.55rem] py-[0.25rem] text-(length:--cv-font-size-xs) leading-[1.2] transition-[opacity,color,border-color,background] duration-150 ease-in-out"
            :class="
              isExportSelected(section.id)
                ? 'border-(--p-primary-color) bg-[color-mix(in_srgb,var(--p-primary-color)_12%,transparent)] text-(--p-primary-color) opacity-100'
                : 'border-(--cv-surface-variant) bg-transparent text-(--cv-on-surface-variant) opacity-55 hover:border-(--p-primary-color) hover:text-(--p-primary-color) hover:opacity-85'
            "
            :aria-pressed="isExportSelected(section.id)"
            @click="toggleExportSection(section.id)"
          >
            {{ section.label }}
          </button>
        </div>
        <p v-if="exportDescription" class="m-0 text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">
          {{ exportDescription }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-(--cv-space-lg)">
        <Button
          label="导出 JSON"
          icon="fa-solid fa-file-import"
          :loading="exportBusy"
          :disabled="!exportSections.length"
          @click="exportData"
        />
      </div>
    </div>

    <h2 class="cv-section-title">导入数据</h2>
    <div class="cv-section-body flex flex-col">
      <div class="flex flex-wrap items-center justify-between gap-(--cv-space-lg)">
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="handleFileChange" />
        <Button label="选择 JSON" icon="fa-solid fa-file-import" severity="secondary" @click="openFilePicker" />
        <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
          >导入前只预览识别到的数据，不会自动覆盖当前设置。</span
        >
      </div>

      <div v-if="preview" class="flex flex-col gap-(--cv-space-2xl)">
        <div
          class="flex flex-wrap items-center justify-between gap-(--cv-space-lg) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
        >
          <span>识别到的数据</span>
          <span>{{ importSummaryText }}</span>
        </div>
        <div class="flex flex-col gap-(--cv-space-md)">
          <div class="flex flex-wrap items-center gap-(--cv-space-md)">
            <button
              v-for="section in preview.sections"
              :key="section.id"
              type="button"
              class="cursor-pointer rounded-(--cv-radius-full) border border-solid px-[0.55rem] py-[0.25rem] text-(length:--cv-font-size-xs) leading-[1.2] transition-[opacity,color,border-color,background] duration-150 ease-in-out"
              :class="
                isImportSelected(section.id)
                  ? 'border-(--p-primary-color) bg-[color-mix(in_srgb,var(--p-primary-color)_12%,transparent)] text-(--p-primary-color) opacity-100'
                  : 'border-(--cv-surface-variant) bg-transparent text-(--cv-on-surface-variant) opacity-55 hover:border-(--p-primary-color) hover:text-(--p-primary-color) hover:opacity-85'
              "
              :aria-pressed="isImportSelected(section.id)"
              @click="toggleImportSection(section.id)"
            >
              {{ section.label }}
            </button>
          </div>
          <p v-if="importDescription" class="m-0 text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">
            {{ importDescription }}
          </p>
        </div>
        <Message v-if="previewWarnings.length" severity="warn" size="small" class="w-full">
          {{ previewWarnings.join('；') }}
        </Message>
        <div class="flex flex-wrap items-center justify-end gap-(--cv-space-lg)">
          <Button
            label="导入选中"
            icon="fa-solid fa-upload"
            :loading="importBusy"
            :disabled="!importSections.length"
            @click="importData"
          />
        </div>
      </div>
    </div>

    <h2 class="cv-section-title">重置数据</h2>
    <div class="cv-section-body">
      <div class="cv-field">
        <div class="cv-field-control">
          <Button
            label="重置为默认设置"
            icon="fa-solid fa-rotate-left"
            severity="danger"
            @click="handleReset"
          />
          <div class="cv-field-hint">将所有设置恢复为默认值，此操作不可撤销</div>
        </div>
      </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { downloadPortableDataFile } from '@/services/data-portability/export';
import { applyDataImport, buildDataImportPreview } from '@/services/data-portability/import';
import {
  DATA_PORTABILITY_SECTIONS,
  getDefaultSelectedSections,
  type DataPortabilitySectionId,
} from '@/services/data-portability/sections';
import type { DataImportPreview } from '@/services/data-portability/types';
import { useSettingsStore } from '@/store/settings';
import manifest from '../../../manifest.json';

const emit = defineEmits<{ 'refresh-data': [] }>();
const settingsStore = useSettingsStore();
const { settings, applyImportedSettings, resetToDefaults } = settingsStore;
const { darkMode } = storeToRefs(settingsStore);
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
const sections = DATA_PORTABILITY_SECTIONS;
const exportSections = ref<DataPortabilitySectionId[]>(getDefaultSelectedSections());
const importSections = ref<DataPortabilitySectionId[]>([]);
const preview = ref<DataImportPreview | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const exportBusy = ref(false);
const importBusy = ref(false);

const describedExportSection = ref<DataPortabilitySectionId | null>(null);
const describedImportSection = ref<DataPortabilitySectionId | null>(null);

const previewWarnings = computed(() => preview.value?.warnings ?? []);

/** 导出集群当前描述：仅展示最近点击的 section 说明 */
const exportDescription = computed(() => {
  const id = describedExportSection.value;
  if (!id) return '';
  return sections.find(section => section.id === id)?.description ?? '';
});

/** 导入集群当前描述：section 说明 + 识别项数 */
const importDescription = computed(() => {
  const id = describedImportSection.value;
  if (!id) return '';
  const def = sections.find(section => section.id === id);
  const previewSection = preview.value?.sections.find(item => item.id === id);
  if (!def || !previewSection) return '';
  return `${def.description}（识别到 ${previewSection.count} 项，将按合并策略导入）`;
});

const importSummaryText = computed(() => {
  const count = preview.value?.sections.reduce((sum, section) => sum + section.count, 0) ?? 0;
  return `共 ${count} 项`;
});

/**
 * 判断导出 section 是否选中
 * @param section section id
 * @returns 是否选中
 */
function isExportSelected(section: DataPortabilitySectionId): boolean {
  return exportSections.value.includes(section);
}

/**
 * 切换导出 section 选中状态并展示其描述
 * @param section section id
 */
function toggleExportSection(section: DataPortabilitySectionId): void {
  setExportSelected(section, !isExportSelected(section));
  describedExportSection.value = section;
}

/**
 * 设置导出 section 选中状态
 * @param section section id
 * @param selected 是否选中
 */
function setExportSelected(section: DataPortabilitySectionId, selected: boolean): void {
  exportSections.value = toggleSection(exportSections.value, section, selected);
}

/**
 * 判断导入 section 是否选中
 * @param section section id
 * @returns 是否选中
 */
function isImportSelected(section: DataPortabilitySectionId): boolean {
  return importSections.value.includes(section);
}

/**
 * 切换导入 section 选中状态并展示其描述
 * @param section section id
 */
function toggleImportSection(section: DataPortabilitySectionId): void {
  setImportSelected(section, !isImportSelected(section));
  describedImportSection.value = section;
}

/**
 * 设置导入 section 选中状态
 * @param section section id
 * @param selected 是否选中
 */
function setImportSelected(section: DataPortabilitySectionId, selected: boolean): void {
  importSections.value = toggleSection(importSections.value, section, selected);
}

/**
 * 切换 section 列表
 * @param current 当前列表
 * @param section section id
 * @param selected 是否选中
 * @returns 新列表
 */
function toggleSection(
  current: readonly DataPortabilitySectionId[],
  section: DataPortabilitySectionId,
  selected: boolean,
): DataPortabilitySectionId[] {
  if (selected) return current.includes(section) ? [...current] : [...current, section];
  return current.filter(item => item !== section);
}

/**
 * 导出选中数据
 */
async function exportData(): Promise<void> {
  await runBusy(exportBusy, '导出数据失败', async () => {
    await downloadPortableDataFile(settings, darkMode.value, exportSections.value, manifest.version);
    toastr.success('已导出 CosmosVision 数据');
  });
}

/**
 * 打开文件选择器
 */
function openFilePicker(): void {
  fileInput.value?.click();
}

/**
 * 处理导入文件选择
 * @param event 文件输入事件
 */
async function handleFileChange(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await runBusy(importBusy, '解析导入文件失败', async () => parseImportFile(file));
  if (fileInput.value) fileInput.value.value = '';
}

/**
 * 解析导入文件
 * @param file 用户选择的文件
 */
async function parseImportFile(file: File): Promise<void> {
  const nextPreview = buildDataImportPreview(await file.text(), { fileName: file.name });
  preview.value = nextPreview;
  importSections.value = nextPreview.sections.map(section => section.id);
  describedImportSection.value = null;
}

/**
 * 执行导入
 */
async function importData(): Promise<void> {
  const currentPreview = preview.value;
  if (!currentPreview) return;
  await runBusy(importBusy, '导入数据失败', async () => {
    const result = await applyDataImport(currentPreview, importSections.value, settings);
    applyImportedSettings(result.settings);
    if (result.darkMode !== undefined) darkMode.value = result.darkMode;
    toastr.success(buildResultText(result.imported, result.skipped, result.failed));
    emit('refresh-data');
  });
}

/**
 * 运行带忙碌态的异步操作
 * @param busy 忙碌状态
 * @param errorMessage 错误提示
 * @param action 操作
 */
async function runBusy(busy: typeof exportBusy, errorMessage: string, action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : errorMessage);
    console.error(`[DataPortabilityPanel] ${errorMessage}`, error);
  } finally {
    busy.value = false;
  }
}

/**
 * 构建导入结果文案
 * @param imported 成功数
 * @param skipped 跳过数
 * @param failed 失败数
 * @returns 结果文案
 */
function buildResultText(imported: number, skipped: number, failed: number): string {
  return `导入完成：成功 ${imported} 项，跳过 ${skipped} 项，失败 ${failed} 项`;
}

/**
 * 确认后重置所有设置为默认值
 */
async function handleReset(): Promise<void> {
  const confirmed = await confirmReset();
  if (confirmed) {
    resetToDefaults();
    emit('refresh-data');
    toastr.success('已重置为默认设置');
  }
}

/**
 * 弹出重置确认弹窗
 * @returns 用户是否确认
 */
async function confirmReset(): Promise<boolean> {
  if (showConfirm) {
    return showConfirm({
      title: '重置设置',
      message: '确定要重置所有设置为默认值吗？此操作不可撤销。',
      acceptLabel: '确定',
      cancelLabel: '取消',
      severity: 'danger',
    });
  }
  return confirm('确定要重置所有设置为默认值吗？此操作不可撤销。');
}
</script>
