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

    <FocusedParagraphField v-if="useLlmMode" v-model="llmParagraphText" :has-focused-paragraph="hasFocusedParagraph" />

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
          :alt="previewAltText"
          class="cv-preview-viewer cv-preview-img"
          :style="PREVIEW_IMAGE_STYLE"
        />
        <div v-else class="cv-preview-placeholder">
          <i class="fa-regular fa-image" />
          <span>{{ previewPlaceholderText }}</span>
        </div>
      </div>
    </div>

    <h2 class="cv-section-title">{{ promptTitle }}</h2>
    <div class="cv-log-container">
      <div v-if="novelaiSnapshot" class="cv-prompt-log">
        <div class="preview-header">正面提示词</div>
        <pre class="preview-content">{{ novelaiSnapshot.positivePrompt || '(空)' }}</pre>
        <div class="preview-header">负面提示词</div>
        <pre class="preview-content">{{ novelaiSnapshot.negativePrompt || '(空)' }}</pre>
      </div>
      <div v-else class="cv-empty-state">尚未生成最终提示词</div>
    </div>

    <h2 class="cv-section-title">{{ paramTitle }}</h2>
    <div class="cv-log-container">
      <div v-if="novelaiSnapshot" class="cv-log-param-grid">
        <div v-for="row in novelaiParamRows" :key="row.label" class="cv-log-param-row">
          <span class="param-label">{{ row.label }}</span>
          <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
        </div>
      </div>
      <div v-else class="cv-empty-state">{{ emptyParamText }}</div>
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
import {
  buildNovelAILlmPromptOverrides,
  buildNovelAIResolvedRequest,
  generateNovelAIImageFromResolvedRequest,
  type NovelAIPromptOverrides,
  type NovelAIRequestSnapshot,
} from '@/services/novelai/api';
import { useSettingsStore } from '@/store/settings';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmLogParams,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
  type PromptLlmLogParams,
} from '@/services/tavern-helper/prompt-llm-test';
import { buildPromptLlmRuntimeRequestFromContext } from '@/services/prompt-llm/runtime-request';

type NovelAITestMode = 'direct' | 'llm';
type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface ParamRow {
  label: string;
  value: string;
  code?: boolean;
}

interface Props {
  serviceName?: string;
}

const PREVIEW_IMAGE_STYLE = { width: '100%', display: 'block' } as const;

const props = withDefaults(defineProps<Props>(), {
  serviceName: 'NovelAI',
});

const { settings } = useSettingsStore();
const { paragraphText: llmParagraphText, hasFocusedParagraph, buildTestContext } = useFocusedParagraphInput();

const currentMode = ref<NovelAITestMode>('direct');
const lastRunMode = ref<NovelAITestMode | null>(null);
const testStatus = ref<TestStatus>('idle');
const errorMessage = ref('');
const previewUrl = ref('');
const directPositivePrompt = ref('1girl');
const directNegativePrompt = ref('');
const novelaiSnapshot = ref<NovelAIRequestSnapshot | null>(null);
const llmRawResponse = ref('');
const llmSentPromptLog = ref('');
const llmLogParams = ref<PromptLlmLogParams | null>(null);

const useLlmMode = computed({
  get: () => currentMode.value === 'llm',
  set: value => {
    currentMode.value = value ? 'llm' : 'direct';
  },
});

const activeLogMode = computed(() => lastRunMode.value ?? currentMode.value);
const showLlmLogs = computed(() => activeLogMode.value === 'llm');
const previewAltText = computed(() => `${props.serviceName} 生成预览`);
const promptTitle = computed(() => `${props.serviceName} 最终提示词`);
const paramTitle = computed(() => `${props.serviceName} 参数配置`);
const emptyParamText = computed(() => `尚未生成 ${props.serviceName} 参数快照`);
const modeTitle = computed(() => {
  return useLlmMode.value ? `LLM + ${props.serviceName} 联动测试` : `仅 ${props.serviceName} 连接测试`;
});
const modeHint = computed(() => {
  return useLlmMode.value
    ? `先使用当前 LLM 配置生成tag，再按 ${props.serviceName} 提取规则和固定模板生图`
    : '直接把输入内容作为LLM提取结果，不经过AI生成tag';
});
const actionLabel = computed(() => {
  return useLlmMode.value ? '开始联动测试' : '开始生图测试';
});
const runningStateText = computed(() => {
  return useLlmMode.value
    ? `正在请求 LLM 并等待 ${props.serviceName} 返回图像`
    : `正在等待 ${props.serviceName} 返回图像`;
});
const successStateText = computed(() => {
  return activeLogMode.value === 'llm' ? '联动测试成功，已返回图像' : `${props.serviceName} 测试成功，已返回图像`;
});
const previewPlaceholderText = computed(() => {
  if (testStatus.value === 'running') return runningStateText.value;
  if (testStatus.value === 'error') return '本次测试未返回图像';
  return '测试结果将在这里显示';
});
const displayLlmLogParams = computed(() => {
  return llmLogParams.value ?? buildPromptLlmLogParams(settings.promptLlm);
});

const novelaiParamRows = computed<ParamRow[]>(() => {
  if (!novelaiSnapshot.value) return [];
  return [
    { label: '接口地址', value: novelaiSnapshot.value.endpoint, code: true },
    { label: '模型', value: novelaiSnapshot.value.model, code: true },
    { label: '图像尺寸', value: `${novelaiSnapshot.value.width}x${novelaiSnapshot.value.height}` },
    { label: '采样器', value: novelaiSnapshot.value.sampler, code: true },
    { label: '步数', value: String(novelaiSnapshot.value.steps) },
    { label: 'CFG Scale', value: String(novelaiSnapshot.value.cfgScale) },
    { label: '负向提示词程度', value: novelaiSnapshot.value.ucPreset },
    { label: '使用官方质量词', value: novelaiSnapshot.value.addQualityTags ? '开启' : '关闭' },
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
 * 执行当前模式的测试
 */
async function runTest(): Promise<void> {
  resetTestResult();
  lastRunMode.value = currentMode.value;
  testStatus.value = 'running';

  try {
    if (currentMode.value === 'llm') {
      await runLlmModeTest();
    } else {
      await runDirectModeTest();
    }
    testStatus.value = 'success';
    toastr.success(successStateText.value);
  } catch (error) {
    handleTestError(error);
  }
}

/**
 * 执行仅 NovelAI 测试
 */
async function runDirectModeTest(): Promise<void> {
  await runNovelAIWithOverrides(createDirectPromptOverrides());
}

/**
 * 执行 LLM + NovelAI 联动测试
 */
async function runLlmModeTest(): Promise<void> {
  llmLogParams.value = buildPromptLlmLogParams(settings.promptLlm);
  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) throw new Error(requestError);

  const request = await buildLlmModeRequest();
  llmSentPromptLog.value = formatPromptLlmRequestLog(request);
  llmRawResponse.value = await requestPromptLlmRaw(request);

  await runNovelAIWithOverrides(buildNovelAILlmPromptOverrides(settings.promptLlm, llmRawResponse.value));
}

/**
 * 使用覆写提示词执行 NovelAI 生图
 * @param overrides 提示词覆写参数
 */
async function runNovelAIWithOverrides(overrides: NovelAIPromptOverrides): Promise<void> {
  const request = buildNovelAIResolvedRequest(
    settings.novelai,
    settings.imagePromptPresets,
    settings.promptLlm,
    overrides,
  );
  novelaiSnapshot.value = request.snapshot;
  const result = await generateNovelAIImageFromResolvedRequest(request);
  novelaiSnapshot.value = result.snapshot;
  replacePreviewUrl(URL.createObjectURL(result.imageBlob));
}

/**
 * 构建联动测试请求
 * @returns generateRaw 请求体
 */
function buildLlmModeRequest() {
  const context = buildTestContext();
  const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
  return buildPromptLlmRuntimeRequestFromContext(
    context,
    settings.promptLlm,
    settings.promptLlmMessagePresets,
    settings.promptProfiles,
    schemaFields,
  );
}

/**
 * 创建仅 NovelAI 模式的提示词覆写
 * @returns 直接拼接模板的覆写参数
 */
function createDirectPromptOverrides(): NovelAIPromptOverrides {
  return {
    positiveLLMPrompt: directPositivePrompt.value,
    negativeLLMPrompt: directNegativePrompt.value,
    positivePromptMode: 'direct',
    negativePromptMode: 'direct',
  };
}

/**
 * 清空上一次测试结果
 */
function resetTestResult(): void {
  testStatus.value = 'idle';
  errorMessage.value = '';
  novelaiSnapshot.value = null;
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
