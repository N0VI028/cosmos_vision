<template>
  <div class="cv-tab-content cv-test-tab">
    <h2 class="cv-section-title">测试模式</h2>
    <div class="cv-section-body">
      <div class="cv-field">
        <div class="cv-field-control">
          <div class="cv-field-inline cv-mode-switch">
            <span>{{ modeTitle }}</span>
            <ToggleSwitch v-model="useLlmMode" />
          </div>
          <div class="cv-field-hint">{{ modeHint }}</div>
        </div>
      </div>

      <FocusedParagraphField
        v-if="useLlmMode"
        v-model="llmParagraphText"
        :has-focused-paragraph="hasFocusedParagraph"
      />

      <template v-else>
        <div class="cv-field">
          <span>正面提示词</span>
          <Textarea
            v-model="directPositivePrompt"
            rows="3"
            auto-resize
            class="w-full resize-y text-(length:--cv-font-size-lg)"
          />
        </div>
        <div class="cv-field">
          <span>负面提示词</span>
          <Textarea
            v-model="directNegativePrompt"
            rows="3"
            auto-resize
            class="w-full resize-y text-(length:--cv-font-size-lg)"
          />
        </div>
      </template>
    </div>

    <div class="cv-action-row">
      <Button
        :label="actionLabel"
        :icon="actionIcon"
        :severity="actionSeverity"
        :outlined="actionOutlined"
        class="w-full"
        @click="onActionClick"
      />
    </div>

    <h2 class="cv-section-title">测试结果</h2>
    <div class="cv-section-body">
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
        <TestImageGallery
          :image-blobs="previewBlobs"
          :snapshot="previewPromptSnapshot"
          :placeholder="previewPlaceholderText"
        />
      </div>
    </div>

    <h2 class="cv-section-title">最终提示词</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="requestSnapshot" class="cv-prompt-log">
          <div class="preview-header">正面提示词</div>
          <pre class="preview-content">{{ requestSnapshot.positivePrompt || '(空)' }}</pre>
          <div class="preview-header">负面提示词</div>
          <pre class="preview-content">{{ requestSnapshot.negativePrompt || '(空)' }}</pre>
        </div>
        <div v-else class="cv-empty-state">尚未生成最终提示词</div>
      </div>
    </div>

    <h2 class="cv-section-title">工作流快照</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="requestSnapshot" class="cv-log-param-grid">
          <div v-for="row in snapshotRows" :key="row.label" class="cv-log-param-row">
            <span class="param-label">{{ row.label }}</span>
            <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
          </div>
        </div>
        <div v-else class="cv-empty-state">尚未生成 ComfyUI 工作流快照</div>
      </div>
    </div>

    <template v-if="showLlmLogs">
      <h2 class="cv-section-title">LLM 原始返回</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <pre class="preview-content">{{ llmRawResponse || '尚未收到 LLM 返回结果' }}</pre>
        </div>
      </div>

      <h2 class="cv-section-title">LLM 参数配置</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <div class="cv-log-param-grid">
            <div v-for="row in llmParamRows" :key="row.label" class="cv-log-param-row">
              <span class="param-label">{{ row.label }}</span>
              <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <h2 class="cv-section-title">LLM 发送请求日志</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <pre class="preview-content">{{ llmSentPromptLog || '尚未发送 LLM 测试请求' }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import { useTestActionButton } from '@/composables/useTestActionButton';
import { useTestRequestSession } from '@/composables/useTestRequestSession';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import TestImageGallery from '@/panel/components/TestImageGallery.vue';

import { generateComfyUIImagesFromResolvedRequest } from '@/services/comfyui/api';
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
  buildPromptLlmParamRows,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
  type PromptLlmLogParams,
} from '@/services/tavern-helper/prompt-llm-test';
import {
  buildPromptLlmRuntimeRequestFromContext,
  buildPromptLlmTriggerContext,
} from '@/services/prompt-llm/runtime-request';

type TestMode = 'direct' | 'llm';
type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface ParamRow {
  label: string;
  value: string;
  code?: boolean;
}

const settingsStore = useSettingsStore();
const { settings } = settingsStore;
const { paragraphText: llmParagraphText, hasFocusedParagraph, buildTestContext } = useFocusedParagraphInput();
const requestSession = useTestRequestSession();

const currentMode = ref<TestMode>('direct');
const lastRunMode = ref<TestMode | null>(null);
const testStatus = ref<TestStatus>('idle');
const errorMessage = ref('');
const previewBlobs = ref<Blob[]>([]);

const directPositivePrompt = ref('1girl');
const directNegativePrompt = ref('');
const requestSnapshot = ref<ComfyUIRequestSnapshot | null>(null);
const llmRawResponse = ref('');
const llmSentPromptLog = ref('');
const llmLogParams = ref<PromptLlmLogParams | null>(null);

const isRunning = computed(() => testStatus.value === 'running');
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
const idleActionLabel = computed(() => (useLlmMode.value ? '开始联动测试' : '开始生图测试'));
const {
  label: actionLabel,
  icon: actionIcon,
  severity: actionSeverity,
  outlined: actionOutlined,
} = useTestActionButton(isRunning, { label: idleActionLabel });
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
const previewPromptSnapshot = computed<InlinePromptSnapshot | undefined>(() => {
  const snapshot = requestSnapshot.value;
  if (!snapshot) return undefined;
  return {
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    comfyui: snapshot,
  };
});
const displayLlmLogParams = computed(() => {
  return llmLogParams.value ?? buildPromptLlmLogParams(settings.promptLlm);
});

const snapshotRows = computed<ParamRow[]>(() => {
  if (!requestSnapshot.value) return [];
  const snapshot = requestSnapshot.value;
  return [
    { label: '接口地址', value: `${snapshot.endpoint}/prompt`, code: true },
    { label: '段落生图结果节点', value: snapshot.imageOutputNodeId, code: true },
    {
      label: '提示词绑定',
      value: formatPromptBindings(snapshot.promptBindings),
      code: true,
    },
    {
      label: 'Seed',
      value: formatSeedValues(snapshot.seedValues),
      code: true,
    },
    { label: '启用 LoRA', value: formatSnapshotLoras(snapshot.loras), code: true },
  ];
});

const llmParamRows = computed(() => buildPromptLlmParamRows(displayLlmLogParams.value));

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
 * 格式化提示词绑定列表
 * @param bindings 绑定目标
 * @returns UI 展示文本
 */
function formatPromptBindings(bindings: ComfyUIRequestSnapshot['promptBindings']): string {
  if (!bindings.length) return '无';
  return bindings.map(item => `${item.nodeId}.${item.inputName}=${item.binding}`).join(', ');
}

/**
 * 格式化 seed 解析结果
 * @param seeds seed 目标
 * @returns UI 展示文本
 */
function formatSeedValues(seeds: ComfyUIRequestSnapshot['seedValues']): string {
  if (!seeds.length) return '无';
  return seeds.map(item => `${item.nodeId}.${item.inputName}:${item.mode}=${item.value}`).join(', ');
}

/**
 * 主操作按钮点击：运行中终止，否则启动测试
 */
function onActionClick(): void {
  if (isRunning.value) stopTest();
  else void runTest();
}

/**
 * 执行当前模式的测试
 */
async function runTest(): Promise<void> {
  resetTestResult();
  lastRunMode.value = currentMode.value;
  testStatus.value = 'running';

  await requestSession.run(
    async session => {
      const request =
        currentMode.value === 'llm'
          ? await runLlmModeTest(session.generationId)
          : runDirectModeTest();
      if (!requestSession.isCurrent(session)) return;
      requestSnapshot.value = request.snapshot;
      const blobs = await generateComfyUIImagesFromResolvedRequest(settings.comfyui, request, {
        signal: session.signal,
      });
      if (!requestSession.isCurrent(session)) return;
      if (!blobs.length) throw new Error('段落生图结果节点未返回任何图片');
      previewBlobs.value = blobs;
      testStatus.value = 'success';
      toastr.success(successStateText.value);
    },
    markAborted,
    handleTestError,
  );
}

/**
 * 终止当前测试请求
 */
function stopTest(): void {
  if (!requestSession.stop()) return;
  markAborted();
}

/**
 * 写入用户终止状态
 */
function markAborted(): void {
  testStatus.value = 'error';
  errorMessage.value = '已终止测试';
  toastr.info('已终止测试');
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
 * @param generationId TavernHelper 生成请求 ID
 * @returns 已解析的 ComfyUI 请求
 */
async function runLlmModeTest(generationId: string): Promise<ComfyUIResolvedRequest> {
  llmLogParams.value = buildPromptLlmLogParams(settings.promptLlm);
  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) throw new Error(requestError);

  const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
  const request = await buildLlmModeRequest(schemaFields);
  llmSentPromptLog.value = formatPromptLlmRequestLog(request);
  llmRawResponse.value = await requestPromptLlmRaw(request, { generationId });

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
    buildPromptLlmTriggerContext(settings, 'comfyui'),
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
  previewBlobs.value = [];
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

</script>

<style scoped>
@reference '../../global.css';

.cv-test-tab {
  @apply flex flex-col gap-0;
}

.cv-mode-switch {
  @apply justify-start;
  justify-content: flex-start;
  gap: var(--cv-space-xl);
  margin-bottom: 0;
}

.cv-action-row {
  margin-top: var(--cv-space-5xl);
  margin-bottom: 0;
}

.cv-log-container {
  @apply overflow-hidden;
  background: var(--cv-surface-container);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-2xl);
}

.cv-status-banner {
  @apply mb-(--cv-space-2xl) flex items-center;
  gap: var(--cv-space-lg);
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
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

.cv-prompt-log {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-log-param-grid {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-log-param-row {
  @apply flex items-center justify-between;
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
  font-size: var(--cv-font-size-md);
}

.param-value {
  @apply text-right break-all;
  color: var(--cv-on-surface);
}

.code-font {
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
}

.preview-header {
  font-size: var(--cv-font-size-md);
  color: var(--cv-on-surface-variant);
  font-weight: 600;
}

.preview-content {
  @apply m-0 overflow-y-auto break-all whitespace-pre-wrap;
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  color: var(--cv-on-surface);
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
  padding: var(--cv-space-2xl);
  border-radius: var(--cv-radius-sm);
  max-height: 20rem;
}

.cv-empty-state {
  @apply p-(--cv-space-8xl) text-center;
  color: var(--cv-on-surface-variant);
}
</style>
