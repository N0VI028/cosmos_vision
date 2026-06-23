<template>
  <div class="cv-tab-content cv-test-tab">
    <h2 class="cv-section-title">测试模式</h2>
    <div class="cv-field">
      <div class="cv-field-inline cv-mode-switch">
        <span>{{ modeTitle }}</span>
        <ToggleSwitch v-model="useLlmMode" />
      </div>
      <div class="cv-field-hint">{{ modeHint }}</div>
    </div>

    <FocusedParagraphField
      v-if="useLlmMode"
      v-model="llmParagraphText"
      :has-focused-paragraph="hasFocusedParagraph"
    />

    <template v-else>
      <div class="cv-field">
        <span>正面提示词</span>
        <Textarea v-model="directPositivePrompt" rows="3" auto-resize class="cv-test-textarea w-full" />
      </div>
      <div class="cv-field">
        <span>负面提示词</span>
        <Textarea v-model="directNegativePrompt" rows="3" auto-resize class="cv-test-textarea w-full" />
      </div>
    </template>

    <div class="cv-action-row">
      <Button
        :label="actionLabel"
        icon="fa-solid fa-wand-magic-sparkles"
        :loading="testStatus === 'running'"
        class="w-full"
        @click="runTest"
      />
    </div>

    <h2 class="cv-section-title">测试结果</h2>
    <div class="cv-log-container">
      <div v-if="testStatus === 'running'" class="cv-status-banner cv-status-banner--pending">
        <i class="fa-solid fa-spinner fa-spin" />
        <span>{{ runningStateText }}</span>
      </div>
      <div v-else-if="testStatus === 'success'" class="cv-status-banner cv-status-banner--success">
        <i class="fa-solid fa-circle-check" />
        <span>{{ successStateText }}</span>
      </div>
      <div v-else-if="testStatus === 'error'" class="cv-status-banner cv-status-banner--error">
        <i class="fa-solid fa-circle-exclamation" />
        <span>{{ errorMessage }}</span>
      </div>
      <div class="cv-preview-stage" :class="{ 'has-image': Boolean(previewUrl) }">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="ComfyUI 生成预览"
          class="cv-preview-viewer cv-preview-img"
          :style="PREVIEW_IMAGE_STYLE"
        />
        <div v-else class="cv-preview-placeholder">
          <i class="fa-regular fa-image" />
          <span>{{ previewPlaceholderText }}</span>
        </div>
      </div>
    </div>

    <h2 class="cv-section-title">最终提示词</h2>
    <div class="cv-log-container">
      <div v-if="requestSnapshot" class="cv-prompt-log">
        <div class="preview-header">正面提示词</div>
        <pre class="preview-content">{{ requestSnapshot.positivePrompt || '(空)' }}</pre>
        <div class="preview-header">负面提示词</div>
        <pre class="preview-content">{{ requestSnapshot.negativePrompt || '(空)' }}</pre>
      </div>
      <div v-else class="cv-empty-state">尚未生成最终提示词</div>
    </div>

    <h2 class="cv-section-title">工作流快照</h2>
    <div class="cv-log-container">
      <div v-if="requestSnapshot" class="cv-log-param-grid">
        <div v-for="row in snapshotRows" :key="row.label" class="cv-log-param-row">
          <span class="param-label">{{ row.label }}</span>
          <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
        </div>
      </div>
      <div v-else class="cv-empty-state">尚未生成 ComfyUI 工作流快照</div>
    </div>

    <template v-if="showLlmLogs">
      <h2 class="cv-section-title">LLM 原始返回</h2>
      <div class="cv-log-container">
        <pre class="preview-content">{{ llmRawResponse || '尚未收到 LLM 返回结果' }}</pre>
      </div>

      <h2 class="cv-section-title">LLM 参数配置</h2>
      <div class="cv-log-container">
        <div class="cv-log-param-grid">
          <div v-for="row in llmParamRows" :key="row.label" class="cv-log-param-row">
            <span class="param-label">{{ row.label }}</span>
            <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
          </div>
        </div>
      </div>

      <h2 class="cv-section-title">LLM 发送请求日志</h2>
      <div class="cv-log-container">
        <pre class="preview-content">{{ llmSentPromptLog || '尚未发送 LLM 测试请求' }}</pre>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import { generateComfyUIImageFromResolvedRequest } from '@/services/comfyui/api';
import {
  buildComfyUIResolvedRequest,
  type ComfyUILoraSnapshot,
  type ComfyUIRequestSnapshot,
  type ComfyUIResolvedRequest,
} from '@/services/comfyui/workflow';
import { useSettingsStore } from '@/store/settings';
import {
  buildPromptLlmSchemaFields,
  getPromptLlmRequestError,
  readPromptLlmOutputWithRules,
} from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmLogParams,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
  type PromptLlmLogParams,
} from '@/services/tavern-helper/prompt-llm-test';
import { buildPromptLlmRuntimeRequestFromContext } from '@/services/prompt-llm/runtime-request';

type TestMode = 'direct' | 'llm';
type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface ParamRow {
  label: string;
  value: string;
  code?: boolean;
}

const PREVIEW_IMAGE_STYLE = { width: '100%', display: 'block' } as const;

const { settings } = useSettingsStore();
const {
  paragraphText: llmParagraphText,
  hasFocusedParagraph,
  buildTestContext,
} = useFocusedParagraphInput();

const currentMode = ref<TestMode>('direct');
const lastRunMode = ref<TestMode | null>(null);
const testStatus = ref<TestStatus>('idle');
const errorMessage = ref('');
const previewUrl = ref('');
const directPositivePrompt = ref('1girl');
const directNegativePrompt = ref('');
const requestSnapshot = ref<ComfyUIRequestSnapshot | null>(null);
const llmRawResponse = ref('');
const llmSentPromptLog = ref('');
const llmLogParams = ref<PromptLlmLogParams | null>(null);

const useLlmMode = computed({
  get: () => currentMode.value === 'llm',
  set: value => {
    currentMode.value = value ? 'llm' : 'direct';
  },
});

const showLlmLogs = computed(() => (lastRunMode.value ?? currentMode.value) === 'llm');
const modeTitle = computed(() => {
  return useLlmMode.value ? 'LLM + ComfyUI 联动测试' : '仅 ComfyUI 连接测试';
});
const modeHint = computed(() => {
  return useLlmMode.value
    ? '先使用当前 LLM 配置生成正负提示词，再按 ComfyUI 工作流注入生图'
    : '直接把输入内容与共享生图预设拼接后注入工作流';
});
const actionLabel = computed(() => {
  return useLlmMode.value ? '开始联动测试' : '开始生图测试';
});
const runningStateText = computed(() => {
  return useLlmMode.value ? '正在请求 LLM 并等待 ComfyUI 返回图像' : '正在等待 ComfyUI 返回图像';
});
const successStateText = computed(() => {
  return showLlmLogs.value ? '联动测试成功，已返回图像' : 'ComfyUI 测试成功，已返回图像';
});
const previewPlaceholderText = computed(() => {
  if (testStatus.value === 'running') return runningStateText.value;
  if (testStatus.value === 'error') return '本次测试未返回图像';
  return '测试结果将在这里显示';
});
const displayLlmLogParams = computed(() => {
  return llmLogParams.value ?? buildPromptLlmLogParams(settings.promptLlm);
});

const snapshotRows = computed<ParamRow[]>(() => {
  if (!requestSnapshot.value) return [];
  return [
    { label: '接口地址', value: `${requestSnapshot.value.endpoint}/prompt`, code: true },
    { label: '工作流类型', value: '标准工作流' },
    { label: '图像尺寸', value: `${requestSnapshot.value.width}x${requestSnapshot.value.height}` },
    { label: '步数', value: String(requestSnapshot.value.steps) },
    { label: 'CFG', value: String(requestSnapshot.value.cfgScale) },
    { label: '采样器类型', value: requestSnapshot.value.sampler, code: true },
    { label: 'Seed', value: String(requestSnapshot.value.seed) },
    { label: 'Seed 模式', value: requestSnapshot.value.seedMode === 'random' ? '随机' : '固定' },
    { label: '启用 LoRA', value: formatSnapshotLoras(requestSnapshot.value.loras), code: true },
  ];
});

const llmParamRows = computed<ParamRow[]>(() => {
  const params = displayLlmLogParams.value;
  return [
    { label: '连接方式', value: params.connectionType },
    { label: '接口地址', value: params.apiUrl, code: true },
    { label: '接口密钥', value: params.apiKey, code: true },
    { label: '来源标识', value: params.source },
    { label: '使用模型', value: params.model, code: true },
    { label: '温度', value: String(params.temperature) },
    { label: '最大令牌数', value: String(params.maxTokens) },
    { label: 'Top P', value: String(params.topP) },
    { label: 'Top K', value: String(params.topK) },
  ];
});

/**
 * 格式化快照中的 LoRA 列表
 * @param loras 本次请求启用的 LoRA
 * @returns UI 展示文本
 */
function formatSnapshotLoras(loras: ComfyUILoraSnapshot[]): string {
  if (!loras.length) return '无';
  return loras.map(lora => `${lora.name} (${lora.strength})`).join(', ');
}

/**
 * 执行当前模式的测试
 */
async function runTest(): Promise<void> {
  resetTestResult();
  lastRunMode.value = currentMode.value;
  testStatus.value = 'running';

  try {
    const request = currentMode.value === 'llm' ? await runLlmModeTest() : runDirectModeTest();
    requestSnapshot.value = request.snapshot;
    replacePreviewUrl(URL.createObjectURL(await generateComfyUIImageFromResolvedRequest(settings.comfyui, request)));
    testStatus.value = 'success';
    toastr.success(successStateText.value);
  } catch (error) {
    handleTestError(error);
  }
}

/**
 * 执行直接提示词测试
 * @returns 已解析的 ComfyUI 请求
 */
function runDirectModeTest(): ComfyUIResolvedRequest {
  return buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, {
    positivePrompt: directPositivePrompt.value,
    negativePrompt: directNegativePrompt.value,
  });
}

/**
 * 执行 LLM 联动测试
 * @returns 已解析的 ComfyUI 请求
 */
async function runLlmModeTest(): Promise<ComfyUIResolvedRequest> {
  llmLogParams.value = buildPromptLlmLogParams(settings.promptLlm);
  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) throw new Error(requestError);

  const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
  const request = await buildLlmModeRequest(schemaFields);
  llmSentPromptLog.value = formatPromptLlmRequestLog(request);
  llmRawResponse.value = await requestPromptLlmRaw(request);

  const prompts = readPromptLlmOutputWithRules(llmRawResponse.value, settings.promptLlm, schemaFields);
  if (!prompts) throw new Error('LLM 返回值无法提取正负提示词');

  return buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, prompts);
}

/**
 * 构建联动测试请求
 * @param schemaFields JSON Schema 字段配置
 * @returns generateRaw 请求体
 */
function buildLlmModeRequest(schemaFields: ReturnType<typeof buildPromptLlmSchemaFields>) {
  const context = buildTestContext();
  return buildPromptLlmRuntimeRequestFromContext(
    context,
    settings.promptLlm,
    settings.promptLlmMessagePresets,
    settings.promptProfiles,
    schemaFields,
  );
}

/**
 * 清空上一次测试结果
 */
function resetTestResult(): void {
  testStatus.value = 'idle';
  errorMessage.value = '';
  requestSnapshot.value = null;
  llmRawResponse.value = '';
  llmSentPromptLog.value = '';
  llmLogParams.value = null;
  revokePreviewUrl();
}

/**
 * 记录测试失败状态
 * @param error 捕获到的异常
 */
function handleTestError(error: unknown): void {
  testStatus.value = 'error';
  errorMessage.value = error instanceof Error ? error.message : '测试失败，未知错误';
  toastr.error(errorMessage.value);
}

/**
 * 替换当前预览图地址
 * @param nextUrl 新的图片地址
 */
function replacePreviewUrl(nextUrl: string): void {
  revokePreviewUrl();
  previewUrl.value = nextUrl;
}

/**
 * 释放当前预览图地址
 */
function revokePreviewUrl(): void {
  if (!previewUrl.value) return;
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

onBeforeUnmount(revokePreviewUrl);
</script>

<style scoped>
.cv-test-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cv-mode-switch {
  justify-content: flex-start;
  gap: var(--cv-space-xl);
  margin-bottom: 0;
}

.cv-test-textarea {
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-outline);
  color: var(--cv-on-surface);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-xl);
  font-family: inherit;
  font-size: calc(var(--mainFontSize) * 0.95);
  resize: vertical;
}

.cv-action-row {
  margin-top: var(--cv-space-5xl);
  margin-bottom: 0;
}

.cv-log-container {
  background: var(--cv-surface-container);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-2xl);
  overflow: hidden;
}

.cv-status-banner {
  display: flex;
  align-items: center;
  gap: var(--cv-space-lg);
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  margin-bottom: var(--cv-space-2xl);
  font-weight: 600;
}

.cv-status-banner--pending {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  color: var(--p-primary-color);
}

.cv-status-banner--success {
  background: color-mix(in srgb, var(--p-green-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-green-500) 30%, transparent);
  color: var(--p-green-500);
}

.cv-status-banner--error {
  background: color-mix(in srgb, var(--p-red-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-red-500) 30%, transparent);
  color: var(--p-red-500);
}

.cv-preview-stage {
  width: 100%;
  min-height: 16rem;
  overflow: hidden;
  border: var(--cv-border-width) dashed color-mix(in srgb, var(--p-content-border-color) 78%, transparent);
  border-radius: var(--cv-radius);
  background: color-mix(in srgb, var(--p-content-background) 92%, var(--cv-surface-container-low));
}

.cv-preview-stage.has-image {
  border-style: solid;
  border-color: var(--cv-surface-variant);
}

.cv-preview-viewer {
  display: block;
  width: 100%;
}

.cv-preview-img {
  display: block;
  max-height: 40vh;
  width: 100%;
  object-fit: contain;
}

.cv-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-lg);
  min-height: 16rem;
  padding: var(--cv-space-8xl);
  color: var(--cv-on-surface-variant);
  text-align: center;
}

.cv-preview-placeholder > i {
  font-size: 1.5rem;
  color: color-mix(in srgb, var(--p-primary-color) 60%, var(--cv-on-surface-variant));
}

.cv-prompt-log {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-log-param-grid {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-log-param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--cv-space-xl);
  border-bottom: 1px solid var(--cv-surface-variant);
  padding-bottom: var(--cv-space-md);
}

.cv-log-param-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.param-label {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.9);
}

.param-value {
  color: var(--cv-on-surface);
  text-align: right;
  word-break: break-all;
}

.code-font {
  font-family: Consolas, Monaco, monospace;
  font-size: calc(var(--mainFontSize) * 0.85);
}

.preview-header {
  font-size: calc(var(--mainFontSize) * 0.9);
  color: var(--cv-on-surface-variant);
  font-weight: 600;
}

.preview-content {
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  color: var(--cv-on-surface);
  font-family: Consolas, Monaco, monospace;
  font-size: calc(var(--mainFontSize) * 0.85);
  padding: var(--cv-space-2xl);
  border-radius: var(--cv-radius-sm);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 20rem;
  overflow-y: auto;
}

.cv-empty-state {
  color: var(--cv-on-surface-variant);
  text-align: center;
  padding: var(--cv-space-8xl);
}
</style>
