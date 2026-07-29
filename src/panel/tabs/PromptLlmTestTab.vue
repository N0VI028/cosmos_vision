<template>
  <div class="cv-tab-content flex flex-col gap-0">
    <h2 class="cv-section-title">连接测试控制</h2>
    <div class="cv-section-body">
      <FocusedParagraphField v-model="testParagraph" :has-focused-paragraph="hasFocusedParagraph" />
    </div>

    <div class="mt-(--cv-space-5xl)" data-cv-tutorial="prompt-llm-test-action">
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
      <div
        class="overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <div
          v-if="testStatus === 'idle'"
          class="flex items-center justify-center py-(--cv-space-3xl) text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-hourglass-start mr-2"></i>等待测试运行...
        </div>
        <div
          v-else-if="testStatus === 'running'"
          class="flex items-center justify-center py-(--cv-space-3xl) text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-spinner fa-spin mr-2"></i>正在向模型请求接口，请稍候...
        </div>
        <div v-else-if="testStatus === 'success'" class="flex flex-col gap-(--cv-space-xl)">
          <div
            class="rounded-(--cv-radius-sm) border border-solid border-[color-mix(in_srgb,var(--cvp-green-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--cvp-green-500)_12%,transparent)] p-(--cv-space-xl) text-(length:--cv-font-size-base) font-semibold text-(--cvp-green-500)"
          >
            <i class="fa-solid fa-circle-check mr-2"></i>测试成功！接口响应正常
          </div>
          <div
            class="mb-(--cv-space-md) text-(length:--cv-font-size-base) font-semibold text-(--cv-on-surface-variant)"
          >
            原始响应文本
          </div>
          <pre
            class="m-0 max-h-[12.5rem] overflow-y-auto rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-variant) p-(--cv-space-2xl) font-[Consolas,Monaco,monospace] text-(length:--cv-font-size-xs) wrap-break-word break-all whitespace-pre-wrap text-(--cv-on-surface)"
            >{{ testResponseRaw }}</pre
          >
        </div>
        <div v-else-if="testStatus === 'error'" class="flex flex-col gap-(--cv-space-xl)">
          <div
            class="rounded-(--cv-radius-sm) border border-solid border-[color-mix(in_srgb,var(--cvp-red-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--cvp-red-500)_12%,transparent)] p-(--cv-space-xl) text-(length:--cv-font-size-base) font-semibold text-(--cvp-red-500)"
          >
            <i class="fa-solid fa-circle-exclamation mr-2"></i>测试失败
          </div>
          <div
            class="mb-(--cv-space-md) text-(length:--cv-font-size-base) font-semibold text-(--cv-on-surface-variant)"
          >
            错误详情
          </div>
          <pre
            class="m-0 max-h-[18.75rem] overflow-y-auto rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-variant) p-(--cv-space-2xl) font-[Consolas,Monaco,monospace] text-(length:--cv-font-size-xs) wrap-break-word break-all whitespace-pre-wrap text-(--cvp-red-500)"
            >{{ testError }}</pre
          >
        </div>
      </div>
    </div>

    <!-- 2. 参数配置日志 -->
    <h2 class="cv-section-title">2. 参数配置日志</h2>
    <div class="cv-section-body">
      <div
        class="overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <div class="flex flex-col gap-(--cv-space-xl)">
          <div
            v-for="row in logParamRows"
            :key="row.label"
            class="flex items-center justify-between gap-(--cv-space-xl) border-b border-(--cv-surface-variant) pb-(--cv-space-xl) last:border-b-0 last:pb-0"
          >
            <span class="text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)">{{ row.label }}</span>
            <span
              class="text-right break-all whitespace-normal text-(--cv-on-surface)"
              :class="row.code && 'font-[Consolas,Monaco,monospace] text-(length:--cv-font-size-xs)'"
              >{{ row.value }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 发送请求日志 -->
    <h2 class="cv-section-title">3. 发送请求日志 (发送前快照)</h2>
    <div class="cv-section-body">
      <div
        class="overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <pre
          class="m-0 max-h-[18.75rem] overflow-y-auto rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-variant) p-(--cv-space-2xl) font-[Consolas,Monaco,monospace] text-(length:--cv-font-size-xs) wrap-break-word break-all whitespace-pre-wrap text-(--cv-on-surface)"
          >{{ sentPromptText || '尚未发送测试请求' }}</pre
        >
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
const { paragraphText: testParagraph, hasFocusedParagraph, buildTestContext } = useFocusedParagraphInput();
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
