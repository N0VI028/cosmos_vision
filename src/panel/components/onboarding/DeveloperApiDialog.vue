<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

import { API_DOC_MARKDOWN } from '@/api/doc';
import { DARK_CLASS } from '@/constants/default-settings';
import { useSettingsStore } from '@/store/settings';
import { useShellDialogStyle } from '@/composables/useShellDialogStyle';
import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';

/** 控制弹窗开合 */
const visible = defineModel<boolean>('visible', { default: false });

const settingsStore = useSettingsStore();
const { darkMode } = storeToRefs(settingsStore);

/** 壳级共享 Dialog 尺寸与断点（桌面约 50dvw×80dvh，移动端全屏） */
const { isMobile, dialogStyle } = useShellDialogStyle();

/**
 * 开发者 API Markdown 渲染后的 HTML 字符串
 * 若酒馆助手不可用或返回空，则降级为 null 并展示 pre 原始文本。
 * XSS 无虞：内容为插件内置静态常量 API_DOC_MARKDOWN，无外部输入。
 */
const renderedDocHtml = computed<string | null>(() => {
  try {
    const helper = getOptionalTavernHelper();
    if (!helper || typeof helper.formatAsDisplayedMessage !== 'function') return null;
    const rendered = helper.formatAsDisplayedMessage(API_DOC_MARKDOWN);
    return rendered || null;
  } catch {
    return null;
  }
});

const dialogClass = computed(() => [
  'cv-developer-api-dialog',
  'cv-settings-dialog',
  { [DARK_CLASS]: darkMode.value },
]);

const contentStyle = {
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '0',
  overflow: 'hidden',
} as const;

/** 复制成功反馈标记 */
const copied = ref(false);
let copiedTimer: number | undefined;

/**
 * 复制 API 文档全文并展示 1.5s 成功态反馈
 */
async function copyDoc(): Promise<void> {
  try {
    await navigator.clipboard.writeText(API_DOC_MARKDOWN);
    copied.value = true;
    if (copiedTimer !== undefined) {
      window.clearTimeout(copiedTimer);
    }
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = undefined;
    }, 1500);
  } catch (error) {
    console.error('[CosmosVision] 复制 API 文档失败', error);
  }
}

onBeforeUnmount(() => {
  if (copiedTimer !== undefined) {
    window.clearTimeout(copiedTimer);
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    :closable="true"
    :close-on-escape="true"
    :class="dialogClass"
    :style="dialogStyle"
    :content-style="contentStyle"
    append-to="body"
    aria-label="开发者 API 文档"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-(--cv-space-lg) pr-(--cv-space-sm)">
        <div class="flex items-center gap-(--cv-space-md)">
          <i
            class="fa-solid fa-code cv-developer-api-header-icon text-(length:--cv-font-size-base) text-(--cvp-primary-color)"
            aria-hidden="true"
          />
          <span class="font-bold text-(length:--cv-font-size-lg) text-(--cv-on-surface)">
            CosmosVision 对外 API 文档
          </span>
        </div>
        <Button
          :label="copied ? '已复制' : '一键复制全部'"
          :icon="copied ? 'fa-solid fa-check' : 'fa-solid fa-copy'"
          :severity="copied ? 'success' : 'secondary'"
          size="small"
          outlined
          class="cv-developer-api-copy-btn shrink-0"
          @click="copyDoc"
        />
      </div>
    </template>

    <div
      class="cv-developer-api-body flex flex-1 flex-col overflow-hidden bg-(--cv-background) p-(--cv-space-6xl) text-(--cv-on-surface)"
      :class="{ 'p-(--cv-space-3xl)': isMobile }"
    >
      <div
        class="custom-scrollbar flex-1 min-w-0 overflow-auto rounded-(--cv-radius-md) border border-solid border-(--cv-outline-variant) bg-(--cv-surface-container-lowest) p-(--cv-space-5xl)"
      >
        <!-- XSS 无虞：渲染内容为插件内置静态常量 API_DOC_MARKDOWN，不包含任何外部或用户输入 -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          v-if="renderedDocHtml"
          class="cv-developer-api-content select-text leading-relaxed text-(--cv-on-surface)"
          v-html="renderedDocHtml"
        />
        <!-- eslint-enable vue/no-v-html -->
        <pre
          v-else
          class="m-0 select-text whitespace-pre-wrap break-words font-(family-name:--cv-font-code,monospace) text-(length:--cv-font-size-sm) leading-relaxed text-(--cv-on-surface)"
        >{{ API_DOC_MARKDOWN }}</pre>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
/*
 * ST 宿主会污染 .fa-solid 图标字号，依据 st-icon-sizing.md 规范显式反压。
 */
.cv-developer-api-copy-btn :deep(.cv-prime-icon),
.cv-developer-api-copy-btn :deep(.fa-solid) {
  font-size: var(--cv-font-size-xs) !important;
}

.cv-developer-api-header-icon {
  font-size: var(--cv-font-size-base) !important;
}

@media (max-width: 87.5em) {
  :deep(.cv-developer-api-dialog) {
    border-radius: 0 !important;
  }
}

/*
 * Markdown 渲染内容排版样式，适配弹窗主题
 */
:deep(.cv-developer-api-content) {
  font-size: var(--cv-font-size-base);
  line-height: 1.7;
  color: var(--cv-on-surface);
  /* ST 宿主 .overflow-hidden 遗留规则带 white-space:nowrap 并经 Dialog 根继承，显式切回可换行 */
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

:deep(.cv-developer-api-content > *:first-child) {
  margin-top: 0;
}

:deep(.cv-developer-api-content h1) {
  font-size: var(--cv-font-size-xl);
  font-weight: 700;
  margin: var(--cv-space-xl) 0 var(--cv-space-md);
  color: var(--cv-on-surface);
}

:deep(.cv-developer-api-content h2) {
  font-size: var(--cv-font-size-lg);
  font-weight: 600;
  margin: var(--cv-space-2xl) 0 var(--cv-space-md);
  padding-bottom: var(--cv-space-xs);
  border-bottom: 1px solid var(--cv-outline-variant);
  color: var(--cv-on-surface);
}

:deep(.cv-developer-api-content h3) {
  font-size: var(--cv-font-size-base);
  font-weight: 600;
  margin: var(--cv-space-lg) 0 var(--cv-space-sm);
  color: var(--cv-on-surface);
}

:deep(.cv-developer-api-content p) {
  margin: 0 0 var(--cv-space-md);
  color: var(--cv-on-surface);
}

:deep(.cv-developer-api-content ul),
:deep(.cv-developer-api-content ol) {
  margin: 0 0 var(--cv-space-md);
  padding-left: var(--cv-space-2xl);
}

:deep(.cv-developer-api-content li) {
  margin-bottom: var(--cv-space-xs);
}

:deep(.cv-developer-api-content code) {
  font-family: var(--cv-font-code, monospace);
  font-size: var(--cv-font-size-sm);
  background-color: var(--cv-surface-container);
  color: var(--cvp-primary-color);
  padding: 0.15em 0.35em;
  border-radius: var(--cv-radius-sm);
}

:deep(.cv-developer-api-content pre) {
  margin: var(--cv-space-md) 0 var(--cv-space-lg);
  padding: var(--cv-space-4xl);
  background-color: var(--cv-surface-container-high);
  border-radius: var(--cv-radius-md);
  border: 1px solid var(--cv-outline-variant);
  /* 代码块自动换行，禁止横向滚动（放在 pre 本体，兼容无 code 子元素的渲染结构） */
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.cv-developer-api-content pre code) {
  background-color: transparent;
  color: var(--cv-on-surface);
  padding: 0;
  font-size: var(--cv-font-size-sm);
  white-space: inherit;
}

:deep(.cv-developer-api-content blockquote) {
  margin: var(--cv-space-md) 0;
  padding: var(--cv-space-sm) var(--cv-space-lg);
  border-left: 3px solid var(--cvp-primary-color);
  background-color: var(--cv-surface-container-low);
  color: var(--cv-on-surface-variant);
}
</style>
