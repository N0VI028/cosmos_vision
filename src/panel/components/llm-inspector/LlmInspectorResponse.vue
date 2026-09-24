<template>
  <section class="cv-llm-inspector-section cv-llm-inspector-section--response">
    <div v-if="!hideHeader" class="cv-llm-inspector-section-header">
      <div class="cv-llm-inspector-section-header-left">
        <span class="cv-llm-inspector-section-title">AI 回复</span>
      </div>
    </div>
    <div class="cv-llm-inspector-section-body custom-scrollbar">
      <div v-if="isEmpty" class="cv-llm-inspector-empty">
        <i class="fa-regular fa-comment-dots" aria-hidden="true" />
        <span>暂无回复内容</span>
      </div>
      <div v-else class="cv-llm-inspector-requests">
        <!-- 思维链条目：无 thinkingText 不渲染，默认折叠（流式思考中自动展开） -->
        <div v-if="thinkingText" class="cv-llm-inspector-request">
          <div class="cv-llm-inspector-request-header" @click="toggleThinkingExpanded">
            <span class="cv-llm-inspector-role-badge cv-llm-inspector-role--thinking">
              <i v-if="thinkingStreaming" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              {{ thinkingStreaming ? '正在思考' : '思考过程' }}
            </span>
            <span class="cv-llm-inspector-request-preview">
              {{ thinkingText }}
            </span>
            <button
              type="button"
              class="cv-llm-inspector-copy-btn"
              title="复制思考过程"
              aria-label="复制思考过程"
              @click.stop="copyWithToast(thinkingText)"
            >
              <i class="fa-regular fa-copy" aria-hidden="true" />
            </button>
            <i
              class="fa-solid fa-chevron-down cv-llm-inspector-request-chevron"
              :class="{ 'cv-llm-inspector-request-chevron--expanded': isThinkingExpanded }"
              aria-hidden="true"
            />
          </div>
          <div
            v-if="isThinkingExpanded"
            ref="thinkingEl"
            class="cv-llm-inspector-request-content custom-scrollbar"
          >
            {{ thinkingText }}
          </div>
        </div>

        <!-- 回复正文条目：默认展开，流式输出自动跟随滚底 -->
        <div v-if="contentText || running" class="cv-llm-inspector-request">
          <div class="cv-llm-inspector-request-header" @click="toggleReplyExpanded">
            <span class="cv-llm-inspector-role-badge cv-llm-inspector-role--assistant">
              <i v-if="running" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              回复
            </span>
            <span v-if="contentText" class="cv-llm-inspector-request-preview">
              {{ contentText }}
            </span>
            <span v-else class="cv-llm-inspector-request-preview"> 等待模型响应… </span>
            <button
              v-if="contentText"
              type="button"
              class="cv-llm-inspector-copy-btn"
              title="复制回复"
              aria-label="复制回复"
              @click.stop="copyWithToast(contentText)"
            >
              <i class="fa-regular fa-copy" aria-hidden="true" />
            </button>
            <i
              v-if="contentText"
              class="fa-solid fa-chevron-down cv-llm-inspector-request-chevron"
              :class="{ 'cv-llm-inspector-request-chevron--expanded': replyExpanded }"
              aria-hidden="true"
            />
          </div>
          <div
            v-if="replyExpanded && contentText"
            ref="streamEl"
            class="cv-llm-inspector-request-content custom-scrollbar"
          >
            {{ contentText }}<span v-if="running" class="cv-llm-inspector-cursor" aria-hidden="true" />
          </div>
        </div>

        <!-- 失败原因条目：默认展开，红色正文 -->
        <div v-if="error" class="cv-llm-inspector-request">
          <div class="cv-llm-inspector-request-header" @click="toggleReplyExpanded">
            <span class="cv-llm-inspector-role-badge cv-llm-inspector-role--error">生成失败</span>
            <span class="cv-llm-inspector-request-preview">
              {{ error }}
            </span>
            <button
              type="button"
              class="cv-llm-inspector-copy-btn"
              title="复制错误信息"
              aria-label="复制错误信息"
              @click.stop="copyWithToast(error)"
            >
              <i class="fa-regular fa-copy" aria-hidden="true" />
            </button>
            <i
              class="fa-solid fa-chevron-down cv-llm-inspector-request-chevron"
              :class="{ 'cv-llm-inspector-request-chevron--expanded': replyExpanded }"
              aria-hidden="true"
            />
          </div>
          <div
            v-if="replyExpanded"
            class="cv-llm-inspector-request-content cv-llm-inspector-request-content--error custom-scrollbar"
          >
            {{ error }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import '@/panel/styles/llm-inspector-requests.css';
import '@/panel/styles/llm-inspector-bubbles.css';
import { copyWithToast } from '@/utils/clipboard';

const props = defineProps<{
  thinkingText: string;
  thinkingStreaming: boolean;
  contentText: string;
  running: boolean;
  error?: string;
  /** 隐藏小节头（外层已提供标题时使用，如设置页测试 tab） */
  hideHeader?: boolean;
}>();

/** 回复正文内容框（流式跟随锚点） */
const streamEl = ref<HTMLElement | null>(null);

/** 思维链内容框（流式跟随锚点） */
const thinkingEl = ref<HTMLElement | null>(null);

/** 用户手动设置的思考过程展开状态（null 表示遵从流式默认态） */
const manualThinkingExpanded = ref<boolean | null>(null);

/** 回复正文与失败条目的展开状态（默认展开） */
const replyExpanded = ref(true);

/** 是否没有任何可展示的内容 */
const isEmpty = computed(() => !props.thinkingText && !props.contentText && !props.error && !props.running);

/** 思考过程条目是否展开（手动操作优先，未操作时流式中展开、完成后折叠） */
const isThinkingExpanded = computed(() => {
  if (manualThinkingExpanded.value !== null) return manualThinkingExpanded.value;
  return props.thinkingStreaming;
});

/** 流式内容更新时若内容框处于底部附近自动跟随滚底 */
watch(
  () => [props.contentText.length, props.thinkingText.length],
  () => {
    void nextTick(() => {
      followIfNearBottom(thinkingEl.value);
      followIfNearBottom(streamEl.value);
    });
  },
);

/**
 * 切换思考过程的展开/收起状态
 */
function toggleThinkingExpanded(): void {
  manualThinkingExpanded.value = !isThinkingExpanded.value;
}

/**
 * 切换回复正文及失败原因条目的展开/收起状态
 */
function toggleReplyExpanded(): void {
  replyExpanded.value = !replyExpanded.value;
}

/**
 * 若滚动容器处于底部附近则自动滚到底（阈值 80px）
 * @param el 滚动容器元素
 */
function followIfNearBottom(el: HTMLElement | null): void {
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    el.scrollTop = el.scrollHeight;
  }
}
</script>
