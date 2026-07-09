<template>
  <div class="cv-tab-content">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body">
        <label class="cv-field">
          <span>ComfyUI URL</span>
          <InputText v-model="settings.comfyui.url" placeholder="http://127.0.0.1:8188" />
          <div class="cv-field-hint">浏览器直连本地 ComfyUI 时，请确认已允许当前来源的 CORS</div>
        </label>
      </div>
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title">工作流</h2>
      <div class="cv-section-body">
        <div class="cv-field">
          <div class="cv-field-inline cv-workflow-actions">
            <Button label="导入 JSON" icon="fa-solid fa-download" size="small" @click="triggerWorkflowImport" />
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
      </div>

      <h2 class="cv-section-title">参数覆盖</h2>
      <div class="cv-section-body">
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
            <span>种子</span>
            <InputNumber
              v-model="settings.comfyui.seed"
              :min="0"
              :max="maxSeed"
              :use-grouping="false"
              placeholder="留空随机"
            />
          </label>
        </div>
      </div>

      <ComfyUILoraPresetPanel
        :preset-settings="settings.comfyui.loraPresets"
        :lora-options="loraOptions"
        :is-loading-loras="isLoadingLoras"
        @update:preset-settings="settings.comfyui.loraPresets = $event"
        @refresh-options="fetchLoraOptions"
      />

      <h2 class="cv-section-title">生图提示词</h2>
      <div class="cv-section-body">
        <ImagePromptPresetPanel
          :preset-settings="settings.imagePromptPresets"
          :positive-preset-id="settings.comfyui.positivePromptPresetId"
          :negative-preset-id="settings.comfyui.negativePromptPresetId"
          @update:preset-settings="settings.imagePromptPresets = $event"
          @update:positive-preset-id="settings.comfyui.positivePromptPresetId = $event"
          @update:negative-preset-id="settings.comfyui.negativePromptPresetId = $event"
        />
      </div>
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
  createComfyUILoraPresetSettings,
  DEFAULT_COMFYUI_WORKFLOW_JSON,
} from '@/constants/comfyui';
import { useResolutionPreset } from '@/composables/useResolutionPreset';
import { fetchComfyUICheckpointNames, fetchComfyUILoraNames } from '@/services/comfyui/api';
import { getActiveComfyUILoras } from '@/services/comfyui/lora-presets';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/workflow';
import ComfyUILoraPresetPanel from '@/panel/components/ComfyUILoraPresetPanel.vue';
import { useSettingsStore } from '@/store/settings';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import ComfyUITestTab from './ComfyUITestTab.vue';

type ComfyUISubTab = 'api' | 'config' | 'test';
type TextOption = { value: string; label: string };

const { settings } = useSettingsStore();
const workflowFileInput = ref<HTMLInputElement | null>(null);
const maxSeed = COMFYUI_MAX_SEED;

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
    (
      settings.comfyui.loraPresets.presets.length
        ? getActiveComfyUILoras(settings.comfyui.loraPresets)
        : []
    ).map(lora => lora.name),
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
  if (!settings.comfyui.loraPresets.presets.length) {
    settings.comfyui.loraPresets = createComfyUILoraPresetSettings();
  }
}

/**
 * 恢复默认工作流与 LoRA 预设组
 */
function restoreDefaultWorkflow(): void {
  settings.comfyui.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  settings.comfyui.loraPresets = createComfyUILoraPresetSettings();
  toastr.success('已恢复默认工作流');
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
@reference '../../global.css';

.cv-tab-content {
  @apply flex flex-col gap-0;
}

.cv-field-inline.cv-workflow-actions {
  @apply mb-0 flex w-full;
  gap: var(--cv-space-lg);
}

.cv-workflow-actions :deep(.cv-prime-button) {
  @apply flex-1;
}

@media (max-width: 48rem) {
  .cv-field-inline.cv-workflow-actions {
    @apply flex-col;
  }
  .cv-workflow-actions :deep(.cv-prime-button) {
    @apply w-full;
  }
}

.cv-model-row {
  @apply flex items-center;
  gap: var(--cv-space-3xl);
}

.cv-model-row > .cv-model-input {
  @apply min-w-0;
  flex: 1;
}

/* 非 rounded 变体统一圆角;rounded 按钮交还 PrimeVue 自身规则 */
.cv-model-row > .cv-prime-button:not([data-p~='rounded']) {
  @apply shrink-0;
  border-radius: var(--cv-radius);
}

.cv-workflow-textarea {
  @apply resize-y overflow-y-auto;
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-outline);
  color: var(--cv-on-surface);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-xl);
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
}

</style>
