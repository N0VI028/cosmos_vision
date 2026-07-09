<template>
  <div class="cv-lora-title-row">
    <h2 class="cv-section-title">LoRA 库</h2>
    <i
      class="fa-solid fa-rotate cv-lora-refresh-icon"
      :class="{ 'is-loading': props.isLoadingLoras }"
      role="button"
      tabindex="0"
      aria-label="刷新 LoRA 库"
      @click="emit('refresh-options')"
      @keydown.enter="emit('refresh-options')"
    />
  </div>
  <div class="cv-section-body">
    <div class="cv-field cv-lora-preset-field">
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

      <Fluid v-if="activePreset?.loras.length" class="cv-lora-list">
        <div v-for="lora in activePreset.loras" :key="lora.id" class="cv-lora-row">
          <ToggleSwitch
            :model-value="lora.enabled"
            class="cv-lora-toggle"
            :aria-label="`${lora.name || '未命名 LoRA'} 启用状态`"
            @update:model-value="updateLora(lora.id, { enabled: Boolean($event) })"
          />
          <Select
            :model-value="lora.name"
            :options="props.loraOptions"
            option-label="label"
            option-value="value"
            placeholder="选择 ComfyUI LoRA"
            class="cv-lora-select w-full max-w-full"
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
            placeholder="强度"
            class="cv-lora-strength"
            aria-label="LoRA 强度"
            @update:model-value="updateLora(lora.id, { strength: normalizeStrength($event) })"
          />
          <Button
            icon="fa-solid fa-trash"
            severity="danger"
            variant="outlined"
            rounded
            class="cv-lora-delete"
            aria-label="删除 LoRA"
            @click="removeLora(lora.id)"
          />
        </div>
      </Fluid>
      <div v-else class="cv-empty-lora-state">当前分组暂无 LoRA</div>

      <button type="button" class="cv-lora-add-button" @click="addLora">
        <i class="fa-solid fa-plus" />
        添加 LoRA
      </button>
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
  emit('update:preset-settings', { activePresetId, presets });
}

/**
 * 创建空白 LoRA 条目
 * @returns 可编辑的 LoRA 条目
 */
function createBlankLora(): ComfyUILoraSetting {
  return createComfyUILoraSetting(uuidv4());
}

/**
 * 克隆单个 LoRA 条目
 * @param lora 原始 LoRA 条目
 * @returns 克隆后的 LoRA 条目
 */
function cloneLoraSetting(lora: ComfyUILoraSetting): ComfyUILoraSetting {
  return { ...lora, id: uuidv4() };
}

/**
 * 规范化 LoRA 强度输入
 * @param value 输入框原始值
 * @returns 可持久化的强度数值
 */
function normalizeStrength(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 1;
}

/**
 * 请求用户输入预设组名称
 * @param message 提示语
 * @param defaultValue 默认名称
 * @returns 输入后的名称
 */
async function askPresetName(message: string, defaultValue: string): Promise<string | null> {
  if (!showPrompt) return null;
  const name = await showPrompt({ message, defaultValue });
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) toastr.error('预设组名称不能为空');
  return trimmed || null;
}

/**
 * 读取预设组显示名称
 * @param preset 预设组
 * @returns 显示名称
 */
function getPresetName(preset: ComfyUILoraPreset): string {
  return preset.name?.trim() || '未命名预设组';
}

/**
 * 读取删除后的可用激活预设组 ID
 * @param presets 当前预设组列表
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

<style scoped>
@reference '../../global.css';

.cv-lora-title-row {
  @apply mb-[var(--cv-space-3xl)] flex items-end;
  gap: var(--cv-space-md);
}

.cv-lora-title-row > .cv-section-title {
  @apply mb-0;
}

.cv-lora-refresh-icon {
  font-size: var(--cv-font-size-xs);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  transition: color 0.2s ease;
}

.cv-lora-refresh-icon:hover {
  color: var(--p-primary-color);
}

.cv-lora-refresh-icon.is-loading {
  animation: cv-lora-spin 0.8s linear infinite;
}

@keyframes cv-lora-spin {
  to {
    transform: rotate(360deg);
  }
}

.cv-lora-preset-field {
  gap: var(--cv-space-3xl);
}

.cv-lora-add-button {
  @apply mb-[var(--cv-space-lg)] flex w-full cursor-pointer items-center justify-center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  transition: all 0.2s ease;
  font-size: var(--cv-font-size-sm);
}

.cv-lora-add-button:hover {
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  border-color: var(--cv-outline);
}

.cv-lora-list {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-lora-row {
  @apply grid items-center;
  grid-template-columns: auto minmax(0, 1fr) 5.75rem auto;
  gap: var(--cv-space-md);
  padding-bottom: var(--cv-space-lg);
  border-bottom: 1px solid var(--cv-surface-variant);
}

.cv-lora-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.cv-lora-toggle,
.cv-lora-delete {
  @apply self-center;
}

.cv-lora-select {
  @apply min-w-0;
}

.cv-lora-strength {
  @apply min-w-0 w-full;
}

.cv-lora-strength :deep(.cv-prime-field) {
  @apply w-full text-center;
}

.cv-empty-lora-state {
  @apply text-center;
  color: var(--cv-on-surface-variant);
  padding: var(--cv-space-xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
}

@media (max-width: 32rem) {
  .cv-lora-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .cv-lora-strength {
    grid-column: 2;
  }
}
</style>
