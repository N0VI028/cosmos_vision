<template>
  <div class="cv-tab-content cv-test-tab">
    <h2 class="cv-section-title">连接测试控制</h2>
    <FocusedParagraphField
      v-model="testParagraph"
      :has-focused-paragraph="hasFocusedParagraph"
    />

    <div class="cv-action-row">
      <Button
        label="开始测试连接"
        icon="fa-solid fa-play"
        :loading="testStatus === 'running'"
        class="w-full"
        @click="runTest"
      />
    </div>

    <!-- 1. 响应内容日志 -->
    <h2 class="cv-section-title">1. 响应内容日志</h2>
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

    <!-- 2. 参数配置日志 -->
    <h2 class="cv-section-title">2. 参数配置日志</h2>
    <div class="cv-log-container">
      <div class="cv-log-param-grid">
        <div class="cv-log-param-row">
          <span class="param-label">连接方式</span>
          <span class="param-value font-medium">{{ logParams.connectionType }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">接口地址</span>
          <span class="param-value code-font">{{ logParams.apiUrl }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">接口密钥</span>
          <span class="param-value code-font">{{ logParams.apiKey }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">来源标识</span>
          <span class="param-value font-medium">{{ logParams.source }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">使用模型</span>
          <span class="param-value code-font">{{ logParams.model }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">温度</span>
          <span class="param-value">{{ logParams.temperature }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">最大令牌数</span>
          <span class="param-value">{{ logParams.maxTokens }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">Top P</span>
          <span class="param-value">{{ logParams.topP }}</span>
        </div>
        <div class="cv-log-param-row">
          <span class="param-label">Top K</span>
          <span class="param-value">{{ logParams.topK }}</span>
        </div>
      </div>
    </div>

    <!-- 3. 发送请求日志 -->
    <h2 class="cv-section-title">3. 发送请求日志 (发送前快照)</h2>
    <div class="cv-log-container">
      <div class="cv-prompt-preview">
        <pre class="preview-content">{{ sentPromptText || '尚未发送测试请求' }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import { useSettingsStore } from '@/store/settings';
import { getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmLogParams,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
} from '@/services/tavern-helper/prompt-llm-test';
import { buildPromptLlmRuntimeRequestFromContext } from '@/services/prompt-llm/runtime-request';

const { settings } = useSettingsStore();
const {
  paragraphText: testParagraph,
  hasFocusedParagraph,
  buildTestContext,
} = useFocusedParagraphInput();

/** 测试状态 */
const testStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle');

/** 原始响应内容 */
const testResponseRaw = ref('');

/** 测试时的报错信息 */
const testError = ref('');

/** 发送前记录的提示词快照 */
const sentPromptText = ref('');

/** 参数日志计算属性 */
const logParams = computed(() => buildPromptLlmLogParams(settings.promptLlm));

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

  try {
    const context = buildTestContext();
    const request = await buildPromptLlmRuntimeRequestFromContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
    );
    sentPromptText.value = formatPromptLlmRequestLog(request);
    applyTestResponse(await requestPromptLlmRaw(request));
    testStatus.value = 'success';
    toastr.success('LLM 连接测试成功');
  } catch (error) {
    const message = error instanceof Error ? error.message : '发送请求失败，未知错误';
    failTest(message);
  }
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
.cv-test-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
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

.cv-log-param-grid {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-log-param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  margin-bottom: var(--cv-space-md);
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
  max-height: 300px;
  overflow-y: auto;
}

.cv-test-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--cv-space-3xl) 0;
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.95);
}

.cv-test-state-success {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.success-banner {
  background: rgba(40, 167, 69, 0.15);
  border: 1px solid rgba(40, 167, 69, 0.3);
  color: #28a745;
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  font-weight: 600;
  font-size: calc(var(--mainFontSize) * 0.95);
}

.response-raw {
  max-height: 200px;
}

.cv-test-state-error {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.error-banner {
  background: rgba(220, 53, 69, 0.15);
  border: 1px solid rgba(220, 53, 69, 0.3);
  color: #dc3545;
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  font-weight: 600;
  font-size: calc(var(--mainFontSize) * 0.95);
}

.error-text {
  color: #dc3545;
}
</style>
