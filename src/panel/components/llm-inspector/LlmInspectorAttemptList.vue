<template>
  <section v-if="attempts.length > 0" class="cv-llm-inspector-section cv-llm-inspector-section--attempts">
    <div v-if="!hideHeader" class="cv-llm-inspector-section-header">
      <div class="cv-llm-inspector-section-header-left">
        <span class="cv-llm-inspector-section-title">账号请求列表</span>
        <span class="cv-llm-inspector-section-count">· {{ attempts.length }} 条</span>
      </div>
    </div>
    <div class="cv-llm-inspector-section-body custom-scrollbar">
      <div class="cv-llm-inspector-requests">
        <!-- 单条尝试：时间徽标 + 账号名 + 复制（有错误时） + chevron；展开后显示参数列表及可选错误正文 -->
        <div v-for="(attempt, index) in attempts" :key="index" class="cv-llm-inspector-request">
          <div class="cv-llm-inspector-request-header" @click="toggleAttempt(index)">
            <span
              class="cv-llm-inspector-attempt-time"
              :class="{ 'cv-llm-inspector-attempt-time--error': Boolean(attempt.error) }"
            >
              {{ attempt.durationMs !== undefined ? formatDurationMs(attempt.durationMs) : '—' }}
            </span>
            <span class="cv-llm-inspector-attempt-name" :title="attempt.accountName">
              {{ attempt.accountName }}
            </span>
            <button
              v-if="attempt.error"
              type="button"
              class="cv-llm-inspector-copy-btn"
              title="复制错误信息"
              aria-label="复制错误信息"
              @click.stop="copyWithToast(attempt.error)"
            >
              <i class="fa-regular fa-copy" aria-hidden="true" />
            </button>
            <i
              class="fa-solid fa-chevron-down cv-llm-inspector-request-chevron"
              :class="{
                'cv-llm-inspector-request-chevron--expanded': isAttemptExpanded(index),
              }"
              aria-hidden="true"
            />
          </div>
          <div
            v-if="isAttemptExpanded(index)"
            class="cv-llm-inspector-request-content custom-scrollbar"
          >
            <!-- 上半部分：参数行列表 -->
            <div v-if="attempt.paramRows?.length" class="cv-llm-inspector-attempt-params">
              <div
                v-for="row in attempt.paramRows"
                :key="row.label"
                class="cv-llm-inspector-attempt-param-row"
              >
                <span class="cv-llm-inspector-attempt-param-label">{{ row.label }}</span>
                <span
                  class="cv-llm-inspector-attempt-param-value"
                  :class="{ 'cv-llm-inspector-attempt-param-value--code': row.code }"
                >
                  {{ row.value }}
                </span>
              </div>
            </div>
            <!-- 下半部分：有错误时保留红色错误正文 -->
            <div
              v-if="attempt.error"
              class="cv-llm-inspector-attempt-error cv-llm-inspector-request-content--error"
            >
              {{ attempt.error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import '@/panel/styles/llm-inspector-requests.css';
import '@/panel/styles/llm-inspector-bubbles.css';
import type { LlmInspectorAttempt } from '@/store/llm-inspector';
import { copyWithToast } from '@/utils/clipboard';
import { formatDurationMs } from '@/utils/duration';

defineProps<{
  attempts: LlmInspectorAttempt[];
  /** 隐藏小节头（外层已提供标题时使用，如设置页测试 tab） */
  hideHeader?: boolean;
}>();

/** 展开详情的尝试下标集合 */
const expandedIndexes = ref(new Set<number>());

/**
 * 判断指定下标的账号尝试详情是否展开
 * @param index 尝试下标
 */
function isAttemptExpanded(index: number): boolean {
  return expandedIndexes.value.has(index);
}

/**
 * 切换指定下标账号尝试的展开/收起状态
 * @param index 尝试下标
 */
function toggleAttempt(index: number): void {
  const next = new Set(expandedIndexes.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  expandedIndexes.value = next;
}
</script>
