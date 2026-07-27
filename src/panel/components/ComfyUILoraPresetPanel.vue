<template>
  <div data-cv-tutorial="comfyui-lora-binding">
    <div class="mb-(--cv-space-3xl) flex items-end gap-(--cv-space-md) [&_.cv-section-title]:mb-0">
    <h2 class="cv-section-title">LoRA 库</h2>
    <i
      class="fa-solid fa-rotate cursor-pointer text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) transition-colors duration-200 ease-in-out hover:text-(--p-primary-color)"
      :class="{ 'animate-spin': props.isLoadingLoras }"
      role="button"
      tabindex="0"
      aria-label="刷新 LoRA 库"
      @click="emit('refresh-options')"
      @keydown.enter="emit('refresh-options')"
    />
  </div>
  <div class="cv-section-body">
    <div class="cv-field p-0!">
      <PresetSelector
        :presets="presetOptions"
        :active-preset-id="props.presetSettings.activePresetId"
        :default-preset-id="defaultPresetId"
        @update:active-preset-id="updateActivePresetId"
        @create="createPreset"
        @clone="clonePreset"
        @rename="renamePreset"
        @delete-preset="deletePreset"
      />

      <Fluid v-if="activePreset?.loras.length" class="flex flex-col gap-(--cv-space-xl)">
        <div
          v-for="lora in activePreset.loras"
          :key="lora.id"
          class="grid items-center gap-(--cv-space-md) border-b border-(--cv-surface-variant) pb-(--cv-space-lg) last:border-b-0 last:pb-0 max-[32rem]:grid-cols-[auto_minmax(0,1fr)_auto] max-[32rem]:[&_.cv-lora-strength]:col-start-2 grid-cols-[auto_minmax(0,1fr)_5.75rem_auto]"
        >
          <ToggleSwitch
            :model-value="lora.enabled"
            class="self-center"
            :aria-label="`${lora.name || '未命名 LoRA'} 启用状态`"
            @update:model-value="updateLora(lora.id, { enabled: Boolean($event) })"
          />
          <Select
            :model-value="lora.name"
            :options="props.loraOptions"
            option-label="label"
            option-value="value"
            placeholder="选择 ComfyUI LoRA"
            class="min-w-0 w-full max-w-full"
            fluid
            :loading="props.isLoadingLoras"
            aria-label="LoRA 文件"
            filter
            @update:model-value="updateLora(lora.id, { name: String($event ?? '') })"
          />
          <InputNumber
            :model-value="lora.strength"
            :min="-5"
            :max="5"
            :step="0.05"
            :min-fraction-digits="0"
            :max-fraction-digits="3"
            :use-grouping="false"
            fluid
            placeholder="强度"
            class="cv-lora-strength min-w-0"
            :pt="loraStrengthPt"
            aria-label="LoRA 强度"
            @update:model-value="updateLora(lora.id, { strength: normalizeStrength($event) })"
          />
          <Button
            icon="fa-solid fa-trash"
            severity="danger"
            variant="outlined"
            rounded
            class="self-center"
            aria-label="删除 LoRA"
            @click="removeLora(lora.id)"
          />
        </div>
      </Fluid>
      <div
        v-else
        class="rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) p-(--cv-space-xl) text-center text-(--cv-on-surface-variant)"
      >
        当前分组暂无 LoRA
      </div>

      <button
        type="button"
        class="mb-(--cv-space-lg) flex w-full cursor-pointer items-center justify-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-md) text-(length:--cv-font-size-sm) text-(--cv-on-surface-variant) transition-all duration-200 ease-in-out hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--p-primary-color)"
        @click="addLora"
      >
        <i class="fa-solid fa-plus" />
        添加 LoRA
      </button>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  DEFAULT_COMFYUI_LORA_PRESET_ID,
  createComfyUILoraPreset,
  createComfyUILoraSetting,
  type ComfyUILoraPreset,
  type ComfyUILoraPresetSettings,
  type ComfyUILoraSetting,
} from '@/constants/comfyui';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import { findComfyUILoraPreset } from '@/services/comfyui/lora-presets';

interface TextOption {
  value: string;
  label: string;
}

interface PresetOption {
  id: string;
  name: string;
}

const defaultPresetId = DEFAULT_COMFYUI_LORA_PRESET_ID;

/** LoRA 强度 InputNumber：内嵌 input 全宽居中，避免 :deep(.cv-prime-field) */
const loraStrengthPt = {
  pcInputText: { root: { class: 'cv-prime-field w-full text-center' } },
} as const;

const props = defineProps<{
  presetSettings: ComfyUILoraPresetSettings;
  loraOptions: TextOption[];
  isLoadingLoras: boolean;
}>();

const emit = defineEmits<{
  'update:preset-settings': [settings: ComfyUILoraPresetSettings];
  'refresh-options': [];
}>();

const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');

const presetOptions = computed<PresetOption[]>(() => props.presetSettings.presets.map(toPresetOption));
const activePreset = computed(() => findComfyUILoraPreset(props.presetSettings.presets, props.presetSettings.activePresetId));

/**
 * 转换预设选择器选项
 * @param preset LoRA 预设组
 * @returns 预设选择器选项
 */
function toPresetOption(preset: ComfyUILoraPreset): PresetOption {
  return { id: preset.id, name: getPresetName(preset) };
}

/**
 * 切换当前激活的 LoRA 预设组
 * @param activePresetId 新预设组 ID
 */
function updateActivePresetId(activePresetId: string): void {
  emit('update:preset-settings', { ...props.presetSettings, activePresetId });
}

/**
 * 新建 LoRA 预设组
 */
async function createPreset(): Promise<void> {
  const name = await askPresetName('请输入新预设组的名称：', '新 LoRA 组');
  if (!name) return;
  const preset = createComfyUILoraPreset(uuidv4(), name);
  emitPresetSettings([...props.presetSettings.presets, preset], preset.id);
  toastr.success(`预设组 "${name}" 已创建`);
}

/**
 * 克隆当前激活的 LoRA 预设组
 */
async function clonePreset(): Promise<void> {
  if (!activePreset.value) return;
  const name = await askPresetName('请输入克隆预设组的名称：', `${getPresetName(activePreset.value)} - 副本`);
  if (!name) return;
  const preset = {
    ...activePreset.value,
    id: uuidv4(),
    name,
    loras: activePreset.value.loras.map(cloneLoraSetting),
  };
  emitPresetSettings([...props.presetSettings.presets, preset], preset.id);
  toastr.success(`已克隆到新预设组 "${name}"`);
}

/**
 * 重命名当前激活的 LoRA 预设组
 */
async function renamePreset(): Promise<void> {
  if (!activePreset.value) return;
  const name = await askPresetName('请输入新的预设组名称：', getPresetName(activePreset.value));
  if (!name) return;
  updatePreset(activePreset.value.id, preset => ({ ...preset, name }));
  toastr.success('预设组已重命名');
}

/**
 * 删除指定 LoRA 预设组
 * @param id 预设组 ID
 */
function deletePreset(id: string): void {
  const presets = props.presetSettings.presets.filter(preset => preset.id !== id);
  emitPresetSettings(presets, getFallbackPresetId(presets, props.presetSettings.activePresetId));
  toastr.success('预设组已删除');
}

/**
 * 在当前激活组内新增空白 LoRA
 */
function addLora(): void {
  if (!activePreset.value) return;
  updatePreset(activePreset.value.id, preset => ({ ...preset, loras: [...preset.loras, createBlankLora()] }));
}

/**
 * 删除当前激活组中的 LoRA
 * @param id LoRA 条目 ID
 */
function removeLora(id: string): void {
  if (!activePreset.value) return;
  updatePreset(activePreset.value.id, preset => ({ ...preset, loras: preset.loras.filter(lora => lora.id !== id) }));
}

/**
 * 更新当前激活组中的单个 LoRA
 * @param id LoRA 条目 ID
 * @param overrides 需要覆写的字段
 */
function updateLora(id: string, overrides: Partial<Omit<ComfyUILoraSetting, 'id'>>): void {
  if (!activePreset.value) return;
  updatePreset(activePreset.value.id, preset => ({
    ...preset,
    loras: preset.loras.map(lora => (lora.id === id ? { ...lora, ...overrides } : lora)),
  }));
}

/**
 * 更新单个 LoRA 预设组
 * @param id 预设组 ID
 * @param updater 更新函数
 */
function updatePreset(id: string, updater: (preset: ComfyUILoraPreset) => ComfyUILoraPreset): void {
  const presets = props.presetSettings.presets.map(preset => (preset.id === id ? updater(preset) : preset));
  emitPresetSettings(presets, props.presetSettings.activePresetId);
}

/**
 * 提交新的 LoRA 预设组集合
 * @param presets 新预设组列表
 * @param activePresetId 新激活预设组 ID
 */
function emitPresetSettings(presets: ComfyUILoraPreset[], activePresetId: string): void {
  emit('update:preset-settings', { presets, activePresetId });
}

/**
 * 创建空白 LoRA 条目
 * @returns 空白 LoRA 设置
 */
function createBlankLora(): ComfyUILoraSetting {
  return createComfyUILoraSetting(uuidv4());
}

/**
 * 克隆 LoRA 条目
 * @param lora 源条目
 * @returns 新条目
 */
function cloneLoraSetting(lora: ComfyUILoraSetting): ComfyUILoraSetting {
  return { ...lora, id: uuidv4() };
}

/**
 * 规范化强度值
 * @param value 输入值
 * @returns 合法强度
 */
function normalizeStrength(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 1;
  return Math.min(5, Math.max(-5, value));
}

/**
 * 读取预设组显示名
 * @param preset 预设组
 * @returns 名称
 */
function getPresetName(preset: ComfyUILoraPreset): string {
  return preset.name?.trim() || '未命名';
}

/**
 * 询问预设组名称
 * @param message 提示文案
 * @param defaultValue 默认值
 * @returns 名称或 null
 */
async function askPresetName(message: string, defaultValue: string): Promise<string | null> {
  if (!showPrompt) return defaultValue;
  const name = await showPrompt({ title: 'LoRA 预设组', message, defaultValue });
  const trimmed = name?.trim() ?? '';
  return trimmed || null;
}

/**
 * 删除后回退到可用预设组
 * @param presets 剩余预设组
 * @param preferredId 期望保留的预设组 ID
 * @returns 可用预设组 ID
 */
function getFallbackPresetId(presets: ComfyUILoraPreset[], preferredId: string): string {
  return (
    presets.find(preset => preset.id === preferredId)?.id ??
    presets.find(preset => preset.id === defaultPresetId)?.id ??
    presets[0]?.id ??
    defaultPresetId
  );
}
</script>
