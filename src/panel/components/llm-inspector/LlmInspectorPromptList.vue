<template>
  <section class="cv-llm-inspector-section cv-llm-inspector-section--prompts">
    <div v-if="!hideHeader" class="cv-llm-inspector-section-header">
      <div class="cv-llm-inspector-section-header-left">
        <span class="cv-llm-inspector-section-title">请求消息</span>
        <span class="cv-llm-inspector-section-count">· {{ prompts.length }} 条</span>
      </div>
      <button
        v-if="prompts.length"
        type="button"
        class="cv-llm-inspector-expand-all"
        @click="toggleAllPrompts"
      >
        {{ allPromptsExpanded ? '全部收起' : '全部展开' }}
      </button>
    </div>
    <div class="cv-llm-inspector-section-body custom-scrollbar">
      <div v-if="!prompts.length" class="cv-llm-inspector-empty">
        <i class="fa-regular fa-comment-dots" aria-hidden="true" />
        <span>暂无请求消息</span>
      </div>
      <div v-else class="cv-llm-inspector-requests">
        <!-- 单条消息：折叠为单行（chevron + 角色 + 预览 + 复制），展开内嵌内容框 -->
        <div v-for="{ prompt, index } in visiblePrompts" :key="index" class="cv-llm-inspector-request">
          <div class="cv-llm-inspector-request-header" @click="togglePromptExpanded(index)">
            <span class="cv-llm-inspector-role-badge" :class="`cv-llm-inspector-role--${prompt.role}`">
              {{ prompt.role }}
            </span>
            <span class="cv-llm-inspector-request-preview">
              {{ prompt.content.trim() || '(空)' }}
            </span>
            <button
              type="button"
              class="cv-llm-inspector-copy-btn"
              title="复制指令"
              aria-label="复制指令"
              @click.stop="copyToClipboard(prompt.content)"
            >
              <i class="fa-regular fa-copy" aria-hidden="true" />
            </button>
            <i
              class="fa-solid fa-chevron-down cv-llm-inspector-request-chevron"
              :class="{
                'cv-llm-inspector-request-chevron--expanded': isPromptExpanded(index),
              }"
              aria-hidden="true"
            />
          </div>
          <div v-if="isPromptExpanded(index)" class="cv-llm-inspector-request-content custom-scrollbar">
            {{ prompt.content }}
          </div>
        </div>
        <button
          v-if="hiddenPromptCount > 0"
          type="button"
          class="cv-llm-inspector-reveal-more"
          @click="revealPrompts"
        >
          查看其余 {{ hiddenPromptCount }} 条消息
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import '@/panel/styles/llm-inspector-requests.css';
import '@/panel/styles/llm-inspector-bubbles.css';
import type { LlmInspectorPromptEntry } from '@/services/prompt-llm/llm-inspector';
import { copyToClipboard } from '@/utils/clipboard';

const props = defineProps<{
  prompts: LlmInspectorPromptEntry[];
  /** 隐藏小节头（外层已提供标题时使用，如设置页测试 tab） */
  hideHeader?: boolean;
}>();

/** 消息列表默认可见条数 */
const PROMPT_VISIBLE_COUNT = 4;

/** 是否已揭示全部折叠的消息 */
const revealed = ref(false);

/** 展开的消息索引集合 */
const expandedIndexes = ref(new Set<number>());

/** 当前可见的消息条目列表 */
const visiblePrompts = computed(() => {
  const list = revealed.value ? props.prompts : props.prompts.slice(0, PROMPT_VISIBLE_COUNT);
  return list.map((prompt, index) => ({ prompt, index }));
});

/** 当前被折叠隐藏的消息条数 */
const hiddenPromptCount = computed(() => {
  if (revealed.value) return 0;
  return Math.max(0, props.prompts.length - PROMPT_VISIBLE_COUNT);
});

/** 当前可见条目是否已全部展开 */
const allPromptsExpanded = computed(() => {
  const visible = visiblePrompts.value;
  if (!visible.length) return false;
  return visible.every(({ index }) => expandedIndexes.value.has(index));
});

/**
 * 揭示当前折叠的其余消息条目
 */
function revealPrompts(): void {
  revealed.value = true;
}

/**
 * 切换全部可见消息的展开/收起状态
 */
function toggleAllPrompts(): void {
  const shouldExpand = !allPromptsExpanded.value;
  const next = new Set(expandedIndexes.value);
  for (const { index } of visiblePrompts.value) {
    if (shouldExpand) {
      next.add(index);
    } else {
      next.delete(index);
    }
  }
  expandedIndexes.value = next;
}

/**
 * 判断指定下标的消息是否展开
 * @param index 消息索引
 */
function isPromptExpanded(index: number): boolean {
  return expandedIndexes.value.has(index);
}

/**
 * 切换单条消息的展开/收起状态
 * @param index 消息索引
 */
function togglePromptExpanded(index: number): void {
  const next = new Set(expandedIndexes.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  expandedIndexes.value = next;
}

// 供外层标题行复用「全部展开/收起」控制（hideHeader 模式下使用）
defineExpose({ allPromptsExpanded, toggleAllPrompts });
</script>
