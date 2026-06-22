<template>
  <div class="cv-tab-content">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <label class="cv-field">
        <span>ComfyUI URL</span>
        <InputText v-model="settings.comfyui.url" placeholder="http://127.0.0.1:8188" />
        <div class="cv-field-hint">浏览器直连本地 ComfyUI 时，请确认已允许当前来源的 CORS</div>
      </label>
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title">工作流</h2>
      <div class="cv-field">
        <div class="cv-field-inline cv-workflow-actions">
          <Button label="导入 JSON" icon="fa-solid fa-file-import" size="small" @click="triggerWorkflowImport" />
          <Button
            label="恢复默认"
            icon="fa-solid fa-rotate-left"
            severity="secondary"
            size="small"
            variant="outlined"
            @click="restoreDefaultWorkflow"
          />
          <Button
            label="清空工作流"
            icon="fa-solid fa-trash"
            severity="danger"
            size="small"
            variant="outlined"
            @click="clearWorkflow"
          />
        </div>
        <input
          ref="workflowFileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="handleWorkflowFileChange"
        />
      </div>
      <label class="cv-field">
        <span>API 格式工作流 JSON</span>
        <Textarea
          v-model="settings.comfyui.workflowJson"
          rows="4"
          class="cv-workflow-textarea w-full"
          :invalid="Boolean(workflowValidationError)"
        />
        <div class="cv-field-hint">请使用 ComfyUI 的 Save (API Format) 导出，再粘贴到这里</div>
        <div v-if="workflowValidationError" class="cv-field-warn">{{ workflowValidationError }}</div>
      </label>

      <h2 class="cv-section-title">参数覆盖</h2>
      <div class="cv-field">
        <span>Checkpoint 覆盖</span>
        <div class="cv-model-row">
          <Select
            v-model="checkpointOverride"
            :options="checkpointOptions"
            option-label="label"
            option-value="value"
            placeholder="留空则沿用工作流内模型"
            :loading="isLoadingCheckpoints"
            show-clear
            class="cv-model-input"
          />
          <Button
            icon="fa-solid fa-rotate"
            severity="secondary"
            outlined
            rounded
            :loading="isLoadingCheckpoints"
            aria-label="刷新 checkpoint 列表"
            @click="fetchCheckpointOptions"
          />
        </div>
        <div class="cv-field-hint">点击右侧按钮从 ComfyUI 拉取 checkpoint 列表，留空则不覆盖工作流</div>
      </div>
      <label class="cv-field">
        <span>尺寸预设</span>
        <Select
          v-model="settings.comfyui.resolutionPreset"
          :options="resolutionPresetOptions"
          option-label="label"
          option-value="value"
        />
      </label>
      <div v-if="isCustomResolution" class="cv-field-grid">
        <label class="cv-field">
          <span>宽度</span>
          <InputNumber
            v-model="settings.comfyui.width"
            :min="imageSizeLimits.min"
            :max="imageSizeLimits.max"
            :step="imageSizeLimits.step"
            :use-grouping="false"
            show-buttons
            @update:model-value="markCustomResolution"
          />
        </label>
        <label class="cv-field">
          <span>高度</span>
          <InputNumber
            v-model="settings.comfyui.height"
            :min="imageSizeLimits.min"
            :max="imageSizeLimits.max"
            :step="imageSizeLimits.step"
            :use-grouping="false"
            show-buttons
            @update:model-value="markCustomResolution"
          />
        </label>
      </div>
      <div class="cv-field-grid">
        <label class="cv-field">
          <span>步数</span>
          <InputNumber v-model="settings.comfyui.steps" :min="1" :max="150" show-buttons />
        </label>
        <label class="cv-field">
          <span>CFG</span>
          <InputNumber v-model="settings.comfyui.cfgScale" :min="0.1" :max="30" :step="0.5" show-buttons />
        </label>
      </div>
      <div class="cv-field-grid">
        <label class="cv-field">
          <span>采样器类型</span>
          <Select
            v-model="settings.comfyui.sampler"
            :options="samplerOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label class="cv-field">
          <span>Seed 模式</span>
          <Select
            v-model="settings.comfyui.seedMode"
            :options="seedModeOptions"
            option-label="label"
            option-value="value"
          />
        </label>
      </div>
      <label v-if="settings.comfyui.seedMode === 'fixed'" class="cv-field">
        <span>固定 Seed</span>
        <InputNumber v-model="settings.comfyui.seed" :min="0" :max="maxSeed" :use-grouping="false" show-buttons />
      </label>

      <div class="cv-lora-title-row">
        <h2 class="cv-section-title">LoRA 库</h2>
        <i
          class="fa-solid fa-rotate cv-lora-refresh-icon"
          :class="{ 'is-loading': isLoadingLoras }"
          role="button"
          tabindex="0"
          aria-label="刷新 LoRA 库"
          @click="fetchLoraOptions"
          @keydown.enter="fetchLoraOptions"
        />
      </div>
      <div class="cv-field">
        <Fluid v-if="settings.comfyui.loras.length" class="cv-lora-list">
          <div v-for="lora in settings.comfyui.loras" :key="lora.id" class="cv-lora-row">
            <ToggleSwitch
              v-model="lora.enabled"
              class="cv-lora-toggle"
              :aria-label="`${lora.name || '未命名 LoRA'} 启用状态`"
            />
            <Select
              v-model="lora.name"
              :options="loraOptions"
              option-label="label"
              option-value="value"
              placeholder="选择 ComfyUI LoRA"
              class="cv-lora-select"
              :loading="isLoadingLoras"
              aria-label="LoRA 文件"
              filter
              :pt="LORA_SELECT_PT"
            />
            <InputNumber
              v-model="lora.strength"
              :min="-5"
              :max="5"
              :step="0.05"
              :min-fraction-digits="0"
              :max-fraction-digits="3"
              :use-grouping="false"
              placeholder="强度"
              class="cv-lora-strength"
              aria-label="LoRA 强度"
              :pt="LORA_STRENGTH_PT"
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
        <div v-else class="cv-empty-lora-state">暂无 LoRA 覆盖</div>
        <button type="button" class="cv-lora-add-button" @click="addLora">
          <i class="fa-solid fa-plus" />
          添加 LoRA
        </button>
      </div>

      <h2 class="cv-section-title">生图提示词</h2>
      <ImagePromptPresetPanel
        :preset-settings="settings.imagePromptPresets"
        :positive-preset-id="settings.comfyui.positivePromptPresetId"
        :negative-preset-id="settings.comfyui.negativePromptPresetId"
        @update:preset-settings="settings.imagePromptPresets = $event"
        @update:positive-preset-id="settings.comfyui.positivePromptPresetId = $event"
        @update:negative-preset-id="settings.comfyui.negativePromptPresetId = $event"
      />
    </template>

    <!-- 测试 Tab -->
    <ComfyUITestTab v-else />
  </div>
</template>

<script setup lang="ts">
import {
  COMFYUI_CUSTOM_RESOLUTION_PRESET,
  COMFYUI_IMAGE_SIZE_LIMITS,
  COMFYUI_MAX_SEED,
  COMFYUI_RESOLUTION_PRESETS,
  COMFYUI_SAMPLERS,
  COMFYUI_SEED_MODES,
  createComfyUILoraSetting,
  type ComfyUILoraSetting,
} from '@/constants/comfyui';
import { createDefaultComfyUILoraSettings, DEFAULT_COMFYUI_WORKFLOW_JSON } from '@/constants/default-comfyui-workflow';
import { useResolutionPreset } from '@/composables/useResolutionPreset';
import { fetchComfyUICheckpointNames, fetchComfyUILoraNames } from '@/services/comfyui/api';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/workflow';
import { useSettingsStore } from '@/store/settings';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import ComfyUITestTab from './ComfyUITestTab.vue';

type ComfyUISubTab = 'api' | 'config' | 'test';
type TextOption = { value: string; label: string };

const { settings } = useSettingsStore();
const workflowFileInput = ref<HTMLInputElement | null>(null);
const maxSeed = COMFYUI_MAX_SEED;
const LORA_SELECT_PT = {
  root: { class: 'cv-prime-field', style: { width: '100%', maxWidth: '100%' } },
} as const;
const LORA_STRENGTH_PT = {
  pcInputText: { root: { class: 'cv-prime-field', style: { width: '100%', textAlign: 'center' } } },
} as const;

const props = defineProps<{ subTab: ComfyUISubTab }>();
const subTab = computed(() => props.subTab);

// 注入父组件提供的刷新方法
const refreshSections = inject<(() => void) | undefined>('refreshSections');
const checkpointNames = ref<string[]>([]);
const isLoadingCheckpoints = ref(false);
const loraNames = ref<string[]>([]);
const isLoadingLoras = ref(false);

// 监听 subTab 变化，通知父组件刷新 section
watch(
  subTab,
  value => {
    if (value === 'config') fillDefaultWorkflowIfEmpty();
    nextTick(() => {
      refreshSections?.();
    });
  },
  { immediate: true },
);

const resolutionPresetOptions = [
  ...COMFYUI_RESOLUTION_PRESETS,
  { value: COMFYUI_CUSTOM_RESOLUTION_PRESET, label: 'Custom' },
];
const samplerOptions = [...COMFYUI_SAMPLERS];
const seedModeOptions = [...COMFYUI_SEED_MODES];
const checkpointOverride = computed<string | null>({
  get: () => settings.comfyui.checkpointName || null,
  set: value => {
    settings.comfyui.checkpointName = value ?? '';
  },
});
const checkpointOptions = computed(() => buildTextOptions(checkpointNames.value, [settings.comfyui.checkpointName]));
const loraOptions = computed(() =>
  buildTextOptions(
    loraNames.value,
    settings.comfyui.loras.map(lora => lora.name),
  ),
);
const imageSizeLimits = COMFYUI_IMAGE_SIZE_LIMITS;
const { isCustomResolution, markCustomResolution } = useResolutionPreset(
  settings.comfyui,
  COMFYUI_RESOLUTION_PRESETS,
  COMFYUI_CUSTOM_RESOLUTION_PRESET,
);
const workflowValidationError = computed(() => {
  const workflowJson = settings.comfyui.workflowJson.trim();
  if (!workflowJson) return null;
  return getComfyUIWorkflowValidationError(workflowJson);
});

/**
 * 构建文本下拉选项,并保留当前已选值
 * @param sourceValues 远程拉取到的值
 * @param selectedValues 当前已选值
 * @returns Select 可用选项
 */
function buildTextOptions(sourceValues: readonly string[], selectedValues: readonly string[]): TextOption[] {
  const values = new Set<string>();
  appendTrimmedValues(values, sourceValues);
  appendTrimmedValues(values, selectedValues);
  return [...values].map(value => ({ value, label: value }));
}

/**
 * 向集合中写入去空白后的文本值
 * @param target 目标集合
 * @param values 待写入文本
 */
function appendTrimmedValues(target: Set<string>, values: readonly string[]): void {
  values.forEach(value => {
    const trimmed = value.trim();
    if (trimmed) target.add(trimmed);
  });
}

/**
 * 在空工作流时填入默认工作流
 */
function fillDefaultWorkflowIfEmpty(): void {
  if (settings.comfyui.workflowJson.trim()) return;
  settings.comfyui.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  if (!settings.comfyui.loras.length) replaceLoras(createDefaultComfyUILoraSettings());
}

/**
 * 恢复默认工作流与 LoRA 列表
 */
function restoreDefaultWorkflow(): void {
  settings.comfyui.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  replaceLoras(createDefaultComfyUILoraSettings());
  toastr.success('已恢复默认工作流');
}

/**
 * 新增空白 LoRA 条目
 */
function addLora(): void {
  settings.comfyui.loras.push(createBlankLora());
}

/**
 * 删除指定 LoRA 条目
 * @param id LoRA 条目 ID
 */
function removeLora(id: string): void {
  const index = settings.comfyui.loras.findIndex(lora => lora.id === id);
  if (index >= 0) settings.comfyui.loras.splice(index, 1);
}

/**
 * 替换 LoRA 设置列表
 * @param loras 新的 LoRA 设置列表
 */
function replaceLoras(loras: ComfyUILoraSetting[]): void {
  settings.comfyui.loras.splice(0, settings.comfyui.loras.length, ...loras);
}

/**
 * 创建空白 LoRA 设置
 * @returns 可编辑的 LoRA 设置
 */
function createBlankLora(): ComfyUILoraSetting {
  return createComfyUILoraSetting(createLoraId());
}

/**
 * 创建前端 LoRA 条目 ID
 * @returns LoRA 条目 ID
 */
function createLoraId(): string {
  return `comfyui-lora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 ComfyUI 读取 checkpoint 列表
 */
async function fetchCheckpointOptions(): Promise<void> {
  if (!settings.comfyui.url.trim()) {
    toastr.warning('请先填写 ComfyUI URL');
    return;
  }

  isLoadingCheckpoints.value = true;

  try {
    checkpointNames.value = await fetchComfyUICheckpointNames(settings.comfyui);
    toastr.success(`成功获取 ${checkpointNames.value.length} 个 checkpoint`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取 checkpoint 列表失败';
    toastr.error(message);
    console.error('[ComfyUITab]', error);
  } finally {
    isLoadingCheckpoints.value = false;
  }
}

/**
 * 从 ComfyUI 读取 LoRA 文件列表
 */
async function fetchLoraOptions(): Promise<void> {
  if (!settings.comfyui.url.trim()) {
    toastr.warning('请先填写 ComfyUI URL');
    return;
  }

  isLoadingLoras.value = true;

  try {
    loraNames.value = await fetchComfyUILoraNames(settings.comfyui);
    toastr.success(`成功获取 ${loraNames.value.length} 个 LoRA`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取 LoRA 列表失败';
    toastr.error(message);
    console.error('[ComfyUITab]', error);
  } finally {
    isLoadingLoras.value = false;
  }
}

/**
 * 触发工作流文件导入
 */
function triggerWorkflowImport(): void {
  workflowFileInput.value?.click();
}

/**
 * 清空当前工作流
 */
function clearWorkflow(): void {
  settings.comfyui.workflowJson = '';
}

/**
 * 读取导入的工作流文件
 * @param event 文件选择事件
 */
async function handleWorkflowFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    settings.comfyui.workflowJson = await file.text();
    toastr.success(`已导入工作流: ${file.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取工作流文件失败';
    toastr.error(message);
  } finally {
    input.value = '';
  }
}
</script>

<style scoped>
.cv-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cv-field-inline.cv-workflow-actions {
  display: flex;
  width: 100%;
  gap: var(--cv-space-lg);
  margin-bottom: 0;
}

.cv-workflow-actions :deep(.p-button) {
  flex: 1;
}

@media (max-width: 48rem) {
  .cv-field-inline.cv-workflow-actions {
    flex-direction: column;
  }
  .cv-workflow-actions :deep(.p-button) {
    width: 100%;
  }
}

.cv-model-row {
  display: flex;
  gap: var(--cv-space-3xl);
  align-items: center;
}

.cv-model-row > .cv-model-input {
  flex: 1;
  min-width: 0;
}

/* 非 rounded 变体统一圆角;rounded 按钮交还 PrimeVue 自身规则 */
.cv-model-row > .cv-prime-button:not(.p-button-rounded) {
  flex-shrink: 0;
  border-radius: var(--cv-radius);
}

.cv-lora-title-row {
  display: flex;
  align-items: end;
  gap: var(--cv-space-md);
  margin-bottom: var(--cv-space-3xl);
}

.cv-lora-title-row > .cv-section-title {
  margin-bottom: 0;
}

.cv-lora-refresh-icon {
  font-size: calc(var(--mainFontSize) * 0.8);
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

.cv-lora-add-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  margin-bottom: var(--cv-space-lg);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: calc(var(--mainFontSize) * 0.85);
}

.cv-lora-add-button:hover {
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  border-color: var(--cv-outline);
}

.cv-lora-list {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-lora-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 5.75rem auto;
  gap: var(--cv-space-md);
  align-items: center;
  padding-bottom: var(--cv-space-lg);
  border-bottom: 1px solid var(--cv-surface-variant);
}

.cv-lora-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.cv-lora-toggle,
.cv-lora-delete {
  align-self: center;
}

.cv-lora-select {
  min-width: 0;
}

.cv-lora-strength {
  width: 100%;
  min-width: 0;
}

.cv-empty-lora-state {
  color: var(--cv-on-surface-variant);
  padding: var(--cv-space-xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  text-align: center;
}

.cv-workflow-textarea {
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-outline);
  color: var(--cv-on-surface);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-xl);
  font-family: Consolas, Monaco, monospace;
  font-size: calc(var(--mainFontSize) * 0.88);
  resize: vertical;
  overflow-y: auto;
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
