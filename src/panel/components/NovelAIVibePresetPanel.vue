<template>
  <div class="cv-field cv-vibe-preset-field">
    <PresetSelector
      :presets="presetOptions"
      :active-preset-id="props.presetSettings.activePresetId"
      :default-preset-id="defaultPresetId"
      show-portability
      @update:active-preset-id="updateActivePresetId"
      @create="createPreset"
      @clone="clonePreset"
      @rename="renamePreset"
      @export-preset="exportPreset"
      @import-presets="importPresetPackage"
      @delete-preset="deletePreset"
    />
  </div>
  <NovelAIVibePanel
    v-if="activePreset"
    :vibes="activePreset.vibes"
    :settings="props.settings"
    @update:vibes="updateActiveVibes"
  />
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import { DEFAULT_NOVELAI_VIBE_PRESET_ID } from '@/constants/default-settings';
import type { NovelAISettings } from '@/constants/novelai';
import {
  createNovelAIVibePreset,
  type ImagePromptVibeRef,
  type NovelAIVibePreset,
  type NovelAIVibePresetSettings,
} from '@/constants/novelai-vibe';
import NovelAIVibePanel from '@/panel/components/NovelAIVibePanel.vue';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import {
  downloadActiveNovelAIVibePresetPackage,
  importNovelAIVibePresetPackageFile,
} from '@/services/data-portability/preset-toolbar';
import type { DataImportResult } from '@/services/data-portability/types';
import { findNovelAIVibePreset } from '@/services/novelai/vibe-presets';
import { useSettingsStore } from '@/store/settings';
import manifest from '../../../manifest.json';

interface PresetOption {
  id: string;
  name: string;
}

const defaultPresetId = DEFAULT_NOVELAI_VIBE_PRESET_ID;

const props = defineProps<{
  presetSettings: NovelAIVibePresetSettings;
  settings: NovelAISettings;
}>();

const emit = defineEmits<{
  'update:preset-settings': [settings: NovelAIVibePresetSettings];
}>();

const { settings: draftSettings, stageImportedSettings } = useSettingsStore();
const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');

const presetOptions = computed<PresetOption[]>(() => props.presetSettings.presets.map(toPresetOption));
const activePreset = computed(() => findNovelAIVibePreset(props.presetSettings.presets, props.presetSettings.activePresetId));

/**
 * 转换预设选择器选项
 * @param preset vibe 预设
 * @returns 选择器选项
 */
function toPresetOption(preset: NovelAIVibePreset): PresetOption {
  return { id: preset.id, name: getPresetName(preset) };
}

/**
 * 更新当前激活的 vibe 预设 ID
 * @param activePresetId 新预设 ID
 */
function updateActivePresetId(activePresetId: string): void {
  emit('update:preset-settings', { ...props.presetSettings, activePresetId });
}

/**
 * 新建 vibe 预设
 */
async function createPreset(): Promise<void> {
  const name = await askPresetName('请输入新预设的名称：', '新 Vibe 预设');
  if (!name) return;
  const preset = createPresetRecord(name);
  emitPresetSettings([...props.presetSettings.presets, preset], preset.id);
  toastr.success(`预设 "${name}" 已创建`);
}

/**
 * 克隆当前激活的 vibe 预设
 */
async function clonePreset(): Promise<void> {
  if (!activePreset.value) return;
  const name = await askPresetName('请输入克隆预设的名称：', `${getPresetName(activePreset.value)} - 副本`);
  if (!name) return;
  const preset = {
    ...activePreset.value,
    id: uuidv4(),
    name,
    vibes: activePreset.value.vibes.map(cloneVibeRef),
  };
  emitPresetSettings([...props.presetSettings.presets, preset], preset.id);
  toastr.success(`已克隆到新预设 "${name}"`);
}

/**
 * 重命名当前激活的 vibe 预设
 */
async function renamePreset(): Promise<void> {
  if (!activePreset.value) return;
  const name = await askPresetName('请输入新的预设名称：', getPresetName(activePreset.value));
  if (!name) return;
  updatePreset(activePreset.value.id, preset => ({ ...preset, name }));
  toastr.success('预设已重命名');
}

/**
 * 删除指定 vibe 预设
 * @param id 预设 ID
 */
function deletePreset(id: string): void {
  if (id === defaultPresetId) {
    toastr.warning('默认预设不能删除');
    return;
  }
  const presets = props.presetSettings.presets.filter(preset => preset.id !== id);
  emitPresetSettings(presets, getFallbackPresetId(presets, props.presetSettings.activePresetId));
  toastr.success('预设已删除');
}

/**
 * 导出当前激活的 vibe 预设
 */
async function exportPreset(): Promise<void> {
  try {
    await downloadActiveNovelAIVibePresetPackage(draftSettings, manifest.version);
    toastr.success('已导出当前 Vibe 预设');
  } catch (error) {
    reportError('导出 Vibe 预设失败', error);
  }
}

/**
 * 导入 vibe 预设
 * @param file 用户选择的文件
 */
async function importPresetPackage(file: File): Promise<void> {
  try {
    const result = await importNovelAIVibePresetPackageFile(file, draftSettings);
    stageImportedSettings(result.settings);
    result.warnings.forEach(message => toastr.warning(message));
    toastr.success(buildImportResultText(result));
  } catch (error) {
    reportError('导入 Vibe 预设失败', error);
  }
}

/**
 * 构建 vibe 导入结果文案
 * @param result 导入结果
 * @returns 展示文案
 */
function buildImportResultText(result: DataImportResult): string {
  return `Vibe 预设导入完成：成功 ${result.imported} 项，跳过 ${result.skipped} 项，失败 ${result.failed} 项`;
}

/**
 * 更新当前激活预设的 vibe 列表
 * @param vibes 新 vibe 列表
 */
function updateActiveVibes(vibes: ImagePromptVibeRef[]): void {
  if (!activePreset.value) return;
  updatePreset(activePreset.value.id, preset => ({ ...preset, vibes }));
}

/**
 * 更新单个 vibe 预设
 * @param id 预设 ID
 * @param updater 更新函数
 */
function updatePreset(id: string, updater: (preset: NovelAIVibePreset) => NovelAIVibePreset): void {
  const presets = props.presetSettings.presets.map(preset => (preset.id === id ? updater(preset) : preset));
  emitPresetSettings(presets, props.presetSettings.activePresetId);
}

/**
 * 提交新的 vibe 预设集合
 * @param presets 新预设列表
 * @param activePresetId 新激活预设 ID
 */
function emitPresetSettings(presets: NovelAIVibePreset[], activePresetId: string): void {
  emit('update:preset-settings', { activePresetId, presets });
}

/**
 * 创建新的空白 vibe 预设
 * @param name 预设名称
 * @returns 预设对象
 */
function createPresetRecord(name: string): NovelAIVibePreset {
  return createNovelAIVibePreset(uuidv4(), name);
}

/**
 * 克隆单个 vibe 引用
 * @param vibe 原始 vibe 引用
 * @returns 克隆后的 vibe 引用
 */
function cloneVibeRef(vibe: ImagePromptVibeRef): ImagePromptVibeRef {
  return { ...vibe, id: uuidv4() };
}

/**
 * 请求用户输入预设名称
 * @param message 提示语
 * @param defaultValue 默认名称
 * @returns 预设名称
 */
async function askPresetName(message: string, defaultValue: string): Promise<string | null> {
  if (!showPrompt) return null;
  const name = await showPrompt({ message, defaultValue });
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) toastr.error('预设名称不能为空');
  return trimmed || null;
}

/**
 * 获取预设显示名称
 * @param preset vibe 预设
 * @returns 显示名
 */
function getPresetName(preset: NovelAIVibePreset): string {
  return preset.name?.trim() || '未命名预设';
}

/**
 * 获取可用的激活预设 ID
 * @param presets 预设列表
 * @param preferredId 期望使用的预设 ID
 * @returns 可用预设 ID
 */
function getFallbackPresetId(presets: NovelAIVibePreset[], preferredId: string): string {
  return (
    presets.find(preset => preset.id === preferredId)?.id ??
    presets.find(preset => preset.id === defaultPresetId)?.id ??
    presets[0]?.id ??
    defaultPresetId
  );
}

/**
 * 报告工具栏操作错误
 * @param fallback 默认错误文案
 * @param error 捕获异常
 */
function reportError(fallback: string, error: unknown): void {
  toastr.error(error instanceof Error ? error.message : fallback);
  console.error(`[NovelAIVibePresetPanel] ${fallback}`, error);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-vibe-preset-field {
  gap: var(--cv-space-3xl);
}
</style>
