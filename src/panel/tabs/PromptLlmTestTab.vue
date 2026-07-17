<template>
  <div class="cv-tab-content cv-test-tab">
    <h2 class="cv-section-title">连接测试控制</h2>
    <div class="cv-section-body">
      <FocusedParagraphField
        v-model="testParagraph"
        :has-focused-paragraph="hasFocusedParagraph"
      />
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

    <!-- 1. 响应内容日志 -->
    <h2 class="cv-section-title">1. 响应内容日志</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="testStatus === 'idle'" class="cv-test-state idle">
          <i class="fa-solid fa-hourglass-start mr-2"></i>等待测试运行...
        </div>
        <div v-else-if="testStatus === 'running'" class="cv-test-state loading">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i>正在向模型请求接口，请稍候...
        </div>
        <div v-else-if="testStatus === 'success'" class="cv-test-state-success">
          <div class="success-banner"><i class="fa-solid fa-circle-check mr-2"></i>测试成功！接口响应正常</div>
          <div class="preview-header">原始响应文本</div>
          <pre class="preview-content response-raw">{{ testResponseRaw }}</pre>
        </div>
        <div v-else-if="testStatus === 'error'" class="cv-test-state-error">
          <div class="error-banner"><i class="fa-solid fa-circle-exclamation mr-2"></i>测试失败</div>
          <div class="preview-header">错误详情</div>
          <pre class="preview-content error-text">{{ testError }}</pre>
        </div>
      </div>
    </div>

    <!-- 2. 参数配置日志 -->
    <h2 class="cv-section-title">2. 参数配置日志</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div class="cv-log-param-grid">
          <div v-for="row in logParamRows" :key="row.label" class="cv-log-param-row">
            <span class="param-label">{{ row.label }}</span>
            <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 发送请求日志 -->
    <h2 class="cv-section-title">3. 发送请求日志 (发送前快照)</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div class="cv-prompt-preview">
          <pre class="preview-content">{{ sentPromptText || '尚未发送测试请求' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import { useTestActionButton } from '@/composables/useTestActionButton';
import { useTestRequestSession } from '@/composables/useTestRequestSession';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import { useSettingsStore } from '@/store/settings';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmLogParams,
  buildPromptLlmParamRows,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
} from '@/services/tavern-helper/prompt-llm-test';
import {
  buildPromptLlmRuntimeRequestFromContext,
  buildPromptLlmTriggerContext,
} from '@/services/prompt-llm/runtime-request';

const { settings } = useSettingsStore();
const {
  paragraphText: testParagraph,
  hasFocusedParagraph,
  buildTestContext,
} = useFocusedParagraphInput();
const requestSession = useTestRequestSession();

/** 测试状态 */
const testStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle');

/** 原始响应内容 */
const testResponseRaw = ref('');

/** 测试时的报错信息 */
const testError = ref('');

/** 发送前记录的提示词快照 */
const sentPromptText = ref('');

/** 是否正在运行测试 */
const isRunning = computed(() => testStatus.value === 'running');

/** 主操作按钮状态 */
const {
  label: actionLabel,
  icon: actionIcon,
  severity: actionSeverity,
  outlined: actionOutlined,
} = useTestActionButton(isRunning, {
  label: '开始测试连接',
  icon: 'fa-solid fa-play',
});

/** LLM 参数配置展示行 */
const logParamRows = computed(() => buildPromptLlmParamRows(buildPromptLlmLogParams(settings.promptLlm)));

/**
 * 主操作按钮点击：运行中终止，否则启动测试
 */
function onActionClick(): void {
  if (isRunning.value) stopTest();
  else void runTest();
}

/**
 * 运行 LLM 连接测试
 */
async function runTest(): Promise<void> {
  resetTestLog();

  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) {
    failTest(requestError, true);
    return;
  }

  testStatus.value = 'running';

  await requestSession.run(
    async session => {
      const context = buildTestContext();
      const request = await buildPromptLlmRuntimeRequestFromContext(
        context,
        settings.promptLlm,
        settings.promptLlmMessagePresets,
        settings.promptProfiles,
        buildPromptLlmSchemaFields(settings.promptLlm),
        buildPromptLlmTriggerContext(settings),
      );
      if (!requestSession.isCurrent(session)) return;
      sentPromptText.value = formatPromptLlmRequestLog(request);
      applyTestResponse(await requestPromptLlmRaw(request, { generationId: session.generationId }));
      if (!requestSession.isCurrent(session)) return;
      testStatus.value = 'success';
      toastr.success('LLM 连接测试成功');
    },
    markAborted,
    handleRequestError,
  );
}

/**
 * 终止当前 LLM 测试请求
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
  testError.value = '已终止测试';
  toastr.info('已终止测试');
}

/**
 * 处理 LLM 请求业务错误
 * @param error 捕获到的异常
 */
function handleRequestError(error: unknown): void {
  const message = error instanceof Error ? error.message : '发送请求失败，未知错误';
  failTest(message);
}

/**
 * 清空上一次测试日志
 */
function resetTestLog(): void {
  testStatus.value = 'idle';
  testResponseRaw.value = '';
  testError.value = '';
  sentPromptText.value = '';
}

/**
 * 写入测试失败状态
 * @param message 失败信息
 * @param warning 是否使用警告提示
 */
function failTest(message: string, warning = false): void {
  testStatus.value = 'error';
  testError.value = message;
  if (warning) {
    toastr.warning(message);
    return;
  }
  toastr.error(`测试失败: ${message}`);
}

/**
 * 写入测试响应
 * @param rawResult generateRaw 原始返回文本
 */
function applyTestResponse(rawResult: string): void {
  testResponseRaw.value = rawResult;
}
</script>

<style scoped>
@reference '../../global.css';

.cv-test-tab {
  @apply flex flex-col gap-0;
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

.cv-log-param-grid {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-log-param-row {
  @apply flex items-center justify-between;
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
  @apply break-all text-right;
  color: var(--cv-on-surface);
}

.code-font {
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
}

.preview-header {
  font-size: var(--cv-font-size-md);
  color: var(--cv-on-surface-variant);
  margin-bottom: var(--cv-space-md);
  font-weight: 600;
}

.preview-content {
  @apply m-0 overflow-y-auto whitespace-pre-wrap break-all;
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  color: var(--cv-on-surface);
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
  padding: var(--cv-space-2xl);
  border-radius: var(--cv-radius-sm);
  max-height: 300px;
}

.cv-test-state {
  @apply flex items-center justify-center;
  padding: var(--cv-space-3xl) 0;
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-lg);
}

.cv-test-state-success {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.success-banner {
  background: rgba(40, 167, 69, 0.15);
  border: 1px solid rgba(40, 167, 69, 0.3);
  color: #28a745;
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  font-weight: 600;
  font-size: var(--cv-font-size-lg);
}

.response-raw {
  max-height: 200px;
}

.cv-test-state-error {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.error-banner {
  background: rgba(220, 53, 69, 0.15);
  border: 1px solid rgba(220, 53, 69, 0.3);
  color: #dc3545;
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  font-weight: 600;
  font-size: var(--cv-font-size-lg);
}

.error-text {
  color: #dc3545;
}
</style>
