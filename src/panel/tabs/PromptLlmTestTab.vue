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

    <!-- 1. 请求消息（顺序与监视会话一致；标题行右侧挂全部展开控制） -->
    <h2 class="cv-section-title flex items-center justify-between">
      <span>1. 请求消息<template v-if="sentPrompts.length"> · {{ sentPrompts.length }} 条</template></span>
      <button
        v-if="sentPrompts.length"
        type="button"
        class="cv-llm-inspector-expand-all shrink-0"
        @click="promptListRef?.toggleAllPrompts()"
      >
        {{ promptListRef?.allPromptsExpanded ? '全部收起' : '全部展开' }}
      </button>
    </h2>
    <div class="cv-section-body">
      <div
        class="overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <LlmInspectorPromptList ref="promptListRef" :key="testRunKey" hide-header :prompts="sentPrompts" />
      </div>
    </div>

    <!-- 2. AI 回复 -->
    <h2 class="cv-section-title">2. AI 回复</h2>
    <div class="cv-section-body">
      <div
        class="flex flex-col gap-(--cv-space-xl) overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <div
          v-if="testStatus === 'idle'"
          class="flex items-center justify-center py-(--cv-space-3xl) text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-hourglass-start mr-2"></i>等待测试运行...
        </div>
        <template v-else>
          <div
            v-if="testStatus === 'success'"
            class="rounded-(--cv-radius-sm) border border-solid border-[color-mix(in_srgb,var(--cvp-green-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--cvp-green-500)_12%,transparent)] p-(--cv-space-xl) text-(length:--cv-font-size-base) font-semibold text-(--cvp-green-500) whitespace-normal"
          >
            <i class="fa-solid fa-circle-check mr-2"></i>测试成功！接口响应正常{{ routedAccountNote }}
          </div>
          <LlmInspectorResponse
            :key="testRunKey"
            hide-header
            :thinking-text="parsedTestResponse.thinking"
            :thinking-streaming="false"
            :content-text="parsedTestResponse.content"
            :running="testStatus === 'running'"
            :error="testStatus === 'error' ? testError : undefined"
          />
        </template>
      </div>
    </div>

    <!-- 3. 账号请求列表 -->
    <h2 class="cv-section-title">3. 账号请求列表<template v-if="attempts.length"> · {{ attempts.length }} 条</template></h2>
    <div class="cv-section-body">
      <div
        class="overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-2xl)"
      >
        <div
          v-if="!attempts.length"
          class="flex items-center justify-center py-(--cv-space-3xl) text-(length:--cv-font-size-base) text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-hourglass-start mr-2"></i>等待测试运行...
        </div>
        <LlmInspectorAttemptList v-else :key="testRunKey" hide-header :attempts="attempts" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import { useTestActionButton } from '@/composables/useTestActionButton';
import { useTestRequestSession } from '@/composables/useTestRequestSession';
import { getPromptLlmAccountDisplayName } from '@/constants/prompt-llm';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import LlmInspectorAttemptList from '@/panel/components/llm-inspector/LlmInspectorAttemptList.vue';
import LlmInspectorPromptList from '@/panel/components/llm-inspector/LlmInspectorPromptList.vue';
import LlmInspectorResponse from '@/panel/components/llm-inspector/LlmInspectorResponse.vue';
import { readLlmInspectorPrompts, type LlmInspectorPromptEntry } from '@/services/prompt-llm/llm-inspector';
import {
  buildPromptLlmRuntimeRequestFromContext,
  buildPromptLlmTriggerContext,
} from '@/services/prompt-llm/runtime-request';
import { splitThinkingContent } from '@/services/prompt-llm/thinking-stream-parser';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmAccountParamRows,
  requestPromptLlmRaw,
} from '@/services/tavern-helper/prompt-llm-test';
import { sealLlmInspectorAttempt, type LlmInspectorAttempt } from '@/store/llm-inspector';
import { useSettingsStore } from '@/store/settings';

const { settings } = useSettingsStore();
const { paragraphText: testParagraph, hasFocusedParagraph, buildTestContext } = useFocusedParagraphInput();
const requestSession = useTestRequestSession();

/** 本轮测试运行唯一标识，用于在新测试发起时重置组件展开态 */
const testRunKey = ref(0);

/** 请求消息组件实例（标题行上的「全部展开/收起」控制来自该组件） */
const promptListRef = ref<InstanceType<typeof LlmInspectorPromptList> | null>(null);

/** 测试状态 */
const testStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle');

/** 原始响应内容 */
const testResponseRaw = ref('');

/** 测试时的报错信息 */
const testError = ref('');

/** 发送前记录的提示词列表 */
const sentPrompts = ref<LlmInspectorPromptEntry[]>([]);

/** 账号请求尝试列表 */
const attempts = ref<LlmInspectorAttempt[]>([]);

/** 本次测试实际成功的账号名（负载均衡等路由模式下非首个账号时用于提示） */
const testResponseAccount = ref('');

/** 是否正在运行测试 */
const isRunning = computed(() => testStatus.value === 'running');

/** 解析原始响应中的思考过程与正文内容 */
const parsedTestResponse = computed(() => splitThinkingContent(testResponseRaw.value));

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

/** 多账号路由时展示实际成功的账号 */
const routedAccountNote = computed(() =>
  testResponseAccount.value ? `（成功账号：${testResponseAccount.value}）` : '',
);

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
  testRunKey.value++;
  resetTestLog();

  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) {
    failTest(requestError, true);
    return;
  }

  testStatus.value = 'running';

  await requestSession.run(
    async session => {
      const context = await buildTestContext();
      const triggerContext = buildPromptLlmTriggerContext(settings);
      const result = await requestPromptLlmRaw(
        settings.promptLlm,
        async account => {
          const request = await buildPromptLlmRuntimeRequestFromContext(
            context,
            settings.promptLlm,
            settings.promptLlmMessagePresets,
            settings.promptProfiles,
            buildPromptLlmSchemaFields(settings.promptLlm),
            triggerContext,
            account,
          );
          if (requestSession.isCurrent(session)) {
            sentPrompts.value = readLlmInspectorPrompts(request.ordered_prompts);
            sealLlmInspectorAttempt(attempts.value, Date.now());
            attempts.value.push({
              accountName: getPromptLlmAccountDisplayName(account),
              startedAt: Date.now(),
              paramRows: buildPromptLlmAccountParamRows(account),
            });
          }
          return request;
        },
        {
          generationId: session.generationId,
          timeoutSeconds: settings.promptLlm.timeout,
        },
      );
      if (!requestSession.isCurrent(session)) return;
      sealLlmInspectorAttempt(attempts.value, Date.now());
      applyTestResponse(result.rawText, result.accountName);
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
  sealLlmInspectorAttempt(attempts.value, Date.now(), '已终止测试');
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
  sealLlmInspectorAttempt(attempts.value, Date.now(), message);
  failTest(message);
}

/**
 * 清空上一次测试日志
 */
function resetTestLog(): void {
  testStatus.value = 'idle';
  testResponseRaw.value = '';
  testResponseAccount.value = '';
  testError.value = '';
  sentPrompts.value = [];
  attempts.value = [];
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
 * @param accountName 实际成功的账号名；空串表示无需提示
 */
function applyTestResponse(rawResult: string, accountName: string): void {
  testResponseRaw.value = rawResult;
  testResponseAccount.value = accountName;
}
</script>
