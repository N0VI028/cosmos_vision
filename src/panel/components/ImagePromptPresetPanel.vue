<template>
  <div v-for="section in promptPresetSections" :key="section.kind" class="cv-field cv-image-preset-field">
    <span>{{ section.label }}</span>
    <PresetSelector
      :presets="section.presets"
      :active-preset-id="section.activePresetId"
      :default-preset-id="section.defaultPresetId"
      @update:active-preset-id="updatePromptPresetId(section.kind, $event)"
      @create="createPromptPreset(section.kind)"
      @clone="clonePromptPreset(section.kind)"
      @rename="renamePromptPreset(section.kind)"
      @delete-preset="deletePromptPreset(section.kind, $event, section.defaultPresetId)"
    />
    <PromptPlaceholderEditor
      v-if="section.activePreset"
      :model-value="section.activePreset"
      @update:model-value="updateActivePromptPreset(section.kind, $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  clampImagePromptPlaceholderOffset,
  createImagePromptPreset,
  type ImagePromptPreset,
  type ImagePromptPresetSettings,
} from '@/constants/image-prompt';
import { DEFAULT_NEGATIVE_PROMPT_PRESET_ID, DEFAULT_POSITIVE_PROMPT_PRESET_ID } from '@/constants/default-settings';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import PromptPlaceholderEditor from '@/panel/components/PromptPlaceholderEditor.vue';
import { findImagePromptPreset } from '@/services/image-prompt/presets';

type ImagePromptPresetKind = keyof ImagePromptPresetSettings;

interface PromptPresetField {
  kind: ImagePromptPresetKind;
  label: string;
  defaultPresetId: string;
}

interface PromptPresetOption {
  id: string;
  name: string;
}

interface PromptPresetSection extends PromptPresetField {
  activePresetId: string;
  presets: PromptPresetOption[];
  activePreset?: ImagePromptPreset;
}

const PRESET_FIELDS = [
  {
    kind: 'positive',
    label: '正面提示词',
    defaultPresetId: DEFAULT_POSITIVE_PROMPT_PRESET_ID,
  },
  {
    kind: 'negative',
    label: '负面提示词',
    defaultPresetId: DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
  },
] as const satisfies ReadonlyArray<PromptPresetField>;

const props = defineProps<{
  presetSettings: ImagePromptPresetSettings;
  positivePresetId: string;
  negativePresetId: string;
}>();

const emit = defineEmits<{
  'update:presetSettings': [settings: ImagePromptPresetSettings];
  'update:positivePresetId': [id: string];
  'update:negativePresetId': [id: string];
}>();

const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');

const promptPresetSections = computed<PromptPresetSection[]>(() => {
  return PRESET_FIELDS.map(field => {
    const presets = getPromptPresetList(field.kind);
    const activePresetId = getActivePresetId(field.kind, field.defaultPresetId);
    return {
      ...field,
      activePresetId,
      presets: presets.map(toPromptPresetOption),
      activePreset: findImagePromptPreset(presets, activePresetId),
    };
  });
});

/**
 * 读取单侧生图提示词预设列表
 * @param kind 正面或负面
 * @returns 预设列表
 */
function getPromptPresetList(kind: ImagePromptPresetKind): ImagePromptPreset[] {
  return props.presetSettings[kind];
}

/**
 * 读取当前渠道引用的预设 ID
 * @param kind 正面或负面
 * @param defaultPresetId 默认预设 ID
 * @returns 有效预设 ID
 */
function getActivePresetId(kind: ImagePromptPresetKind, defaultPresetId: string): string {
  const presetId = kind === 'positive' ? props.positivePresetId : props.negativePresetId;
  return getFallbackPromptPresetId(getPromptPresetList(kind), presetId, defaultPresetId);
}

/**
 * 转换预设为选择器选项
 * @param preset 固定提示词预设
 * @returns 选择器选项
 */
function toPromptPresetOption(preset: ImagePromptPreset): PromptPresetOption {
  return { id: preset.id, name: getPromptPresetName(preset) };
}

/**
 * 更新当前渠道引用的生图提示词预设 ID
 * @param kind 正面或负面
 * @param activePresetId 新预设 ID
 */
function updatePromptPresetId(kind: ImagePromptPresetKind, activePresetId: string): void {
  if (kind === 'positive') {
    emit('update:positivePresetId', activePresetId);
    return;
  }
  emit('update:negativePresetId', activePresetId);
}

/**
 * 新建生图固定提示词预设
 * @param kind 正面或负面
 */
async function createPromptPreset(kind: ImagePromptPresetKind): Promise<void> {
  const name = await askPromptPresetName('请输入新预设的名称：', '新预设');
  if (!name) return;
  const preset = createImagePromptPreset(uuidv4(), name);
  const presets = getPromptPresetList(kind);
  updatePromptPresetList(kind, [...presets, preset]);
  updatePromptPresetId(kind, preset.id);
  toastr.success(`预设 "${name}" 已创建`);
}

/**
 * 克隆当前生图固定提示词预设
 * @param kind 正面或负面
 */
async function clonePromptPreset(kind: ImagePromptPresetKind): Promise<void> {
  const activePreset = findImagePromptPreset(getPromptPresetList(kind), getCurrentPresetId(kind));
  if (!activePreset) return;
  const name = await askPromptPresetName('请输入克隆预设的名称：', `${getPromptPresetName(activePreset)} - 副本`);
  if (!name) return;
  const preset = { ...activePreset, id: uuidv4(), name };
  updatePromptPresetList(kind, [...getPromptPresetList(kind), preset]);
  updatePromptPresetId(kind, preset.id);
  toastr.success(`已克隆到新预设 "${name}"`);
}

/**
 * 重命名当前生图固定提示词预设
 * @param kind 正面或负面
 */
async function renamePromptPreset(kind: ImagePromptPresetKind): Promise<void> {
  const activePreset = findImagePromptPreset(getPromptPresetList(kind), getCurrentPresetId(kind));
  if (!activePreset) return;
  const name = await askPromptPresetName('请输入新的预设名称：', getPromptPresetName(activePreset));
  if (!name) return;
  updatePromptPreset(kind, activePreset.id, preset => ({ ...preset, name }));
  toastr.success('预设已重命名');
}

/**
 * 删除指定生图固定提示词预设
 * @param kind 正面或负面
 * @param id 预设 ID
 * @param defaultPresetId 默认预设 ID
 */
function deletePromptPreset(kind: ImagePromptPresetKind, id: string, defaultPresetId: string): void {
  if (id === defaultPresetId) {
    toastr.warning('默认预设不能删除');
    return;
  }
  const presets = getPromptPresetList(kind).filter(preset => preset.id !== id);
  updatePromptPresetList(kind, presets);
  updatePromptPresetId(kind, getFallbackPromptPresetId(presets, getCurrentPresetId(kind), defaultPresetId));
  toastr.success('预设已删除');
}

/**
 * 更新当前生图固定提示词预设内容
 * @param kind 正面或负面
 * @param value 编辑器输出
 */
function updateActivePromptPreset(
  kind: ImagePromptPresetKind,
  value: Pick<ImagePromptPreset, 'text' | 'placeholderOffset'>,
): void {
  const activePreset = findImagePromptPreset(getPromptPresetList(kind), getCurrentPresetId(kind));
  if (!activePreset) return;
  updatePromptPreset(kind, activePreset.id, preset => ({
    ...preset,
    text: value.text,
    placeholderOffset: clampImagePromptPlaceholderOffset(value.text, value.placeholderOffset),
  }));
}

/**
 * 更新单个生图固定提示词预设
 * @param kind 正面或负面
 * @param id 预设 ID
 * @param updater 更新函数
 */
function updatePromptPreset(
  kind: ImagePromptPresetKind,
  id: string,
  updater: (preset: ImagePromptPreset) => ImagePromptPreset,
): void {
  const presets = getPromptPresetList(kind);
  updatePromptPresetList(
    kind,
    presets.map(preset => (preset.id === id ? updater(preset) : preset)),
  );
}

/**
 * 提交单侧生图固定提示词预设列表
 * @param kind 正面或负面
 * @param presets 新预设列表
 */
function updatePromptPresetList(kind: ImagePromptPresetKind, presets: ImagePromptPreset[]): void {
  emit('update:presetSettings', { ...props.presetSettings, [kind]: presets });
}

/**
 * 请求生图固定提示词预设名称
 * @param message 提示语
 * @param defaultValue 默认名称
 * @returns 预设名称
 */
async function askPromptPresetName(message: string, defaultValue: string): Promise<string | null> {
  if (!showPrompt) return null;
  const name = await showPrompt({ message, defaultValue });
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) toastr.error('预设名称不能为空');
  return trimmed || null;
}

/**
 * 读取当前渠道保存的预设 ID
 * @param kind 正面或负面
 * @returns 预设 ID
 */
function getCurrentPresetId(kind: ImagePromptPresetKind): string {
  return kind === 'positive' ? props.positivePresetId : props.negativePresetId;
}

/**
 * 读取生图固定提示词预设显示名
 * @param preset 固定提示词预设
 * @returns 显示名
 */
function getPromptPresetName(preset: ImagePromptPreset): string {
  return preset.name?.trim() || '未命名预设';
}

/**
 * 读取可用的预设 ID
 * @param presets 预设列表
 * @param preferredId 优先使用的预设 ID
 * @param defaultPresetId 默认预设 ID
 * @returns 可用预设 ID
 */
function getFallbackPromptPresetId(presets: ImagePromptPreset[], preferredId: string, defaultPresetId: string): string {
  return (
    presets.find(preset => preset.id === preferredId)?.id ??
    presets.find(preset => preset.id === defaultPresetId)?.id ??
    presets[0]?.id ??
    defaultPresetId
  );
}
</script>

<style scoped>
.cv-image-preset-field {
  gap: var(--cv-space-3xl);
}
</style>
