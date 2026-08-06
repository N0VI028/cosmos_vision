<template>
  <div v-if="entries.length > 0" class="cv-message-list-container mb-(--cv-space-5xl)">
    <div
      ref="listEl"
      class="cv-message-list group/list custom-scrollbar max-h-[21rem] w-full overflow-y-auto"
      :class="{ 'is-dragging': isDragging }"
    >
      <VueDraggable
        v-model="entries"
        v-bind="dragOptions"
        class="cv-message-list-body flex w-full flex-col gap-(--cv-space-sm)"
        @start="isDragging = true"
        @end="isDragging = false"
      >
        <section
          v-for="entry in entries"
          :key="entry.id"
          class="cv-message-row group/row grid grid-cols-[auto_minmax(0,1fr)] items-stretch overflow-hidden rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low) transition-[border-color,box-shadow] duration-150 ease-in-out [contain-intrinsic-block-size:47px] [content-visibility:auto] group-[.is-dragging]/list:transition-none hover:border-(--cv-outline) hover:shadow-[0_var(--cv-space-sm)_var(--cv-space-3xl)_color-mix(in_srgb,var(--cv-on-surface)_12%,transparent)]"
          :class="{
            'is-disabled bg-[color-mix(in_srgb,var(--cv-surface-container-low)_60%,transparent)] opacity-55 [&_.cv-indicator]:bg-[color-mix(in_srgb,var(--cv-on-surface)_20%,transparent)] [&_.cv-indicator]:shadow-none':
              entry.enabled === false,
          }"
          :data-role="getRole?.(entry)"
        >
          <button
            type="button"
            class="cv-message-handle border-r-solid flex w-8 cursor-grab touch-none items-center justify-center border-0 border-r-(length:--cv-border-width) border-r-(--cv-surface-variant) bg-transparent p-0 text-(length:--cv-font-size-xs) text-[color-mix(in_srgb,var(--cv-on-surface)_25%,transparent)] transition-[color,background] duration-150 ease-in-out select-none group-hover/row:bg-[color-mix(in_srgb,var(--cv-on-surface)_3%,transparent)] group-hover/row:text-[color-mix(in_srgb,var(--cv-on-surface)_50%,transparent)] hover:text-(--cvp-primary-color)! active:cursor-grabbing"
            title="拖拽排序"
            aria-label="拖拽排序"
          >
            <i class="fa-solid fa-grip-vertical" />
          </button>
          <div class="cv-message-item flex min-w-0 items-center justify-between gap-(--cv-space-xl) p-(--cv-space-xl)">
            <div class="cv-message-main flex min-w-0 flex-1 items-center gap-(--cv-space-xl)">
              <slot name="main" :entry="entry" />
            </div>
            <div
              class="cv-message-actions flex items-center gap-(--cv-space-sm) opacity-35 transition-opacity duration-200 ease-in-out group-hover/row:opacity-100 group-[.is-dragging]/list:pointer-events-none group-[.is-dragging]/list:opacity-35"
            >
              <slot name="actions" :entry="entry" />
            </div>
          </div>
        </section>
      </VueDraggable>
    </div>
  </div>
  <div
    v-else
    class="cv-empty-hint text-muted-color mb-(--cv-space-5xl) flex flex-col items-center justify-center gap-(--cv-space-3xl) p-(--cv-space-8xl) text-center"
  >
    {{ emptyText }}
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus';

/**
 * 列表条目接口
 */
export interface PromptEntryListItem {
  id: string;
  enabled?: boolean;
}

/**
 * 提示词条目列表组件属性
 */
defineProps<{
  /** 列表为空时的占位提示文案 */
  emptyText: string;
  /** 获取条目角色的回调函数 */
  getRole?: (entry: PromptEntryListItem) => string;
}>();

const entries = defineModel<PromptEntryListItem[]>({ required: true });
const listEl = ref<HTMLElement | null>(null);
const isDragging = ref(false);

/** Sortable 配置：只保留轻量 ghost（细蓝色虚线占位），禁用粗 fallback 幽灵元素 */
const dragOptions = {
  handle: '.cv-message-handle',
  animation: 150,
  ghostClass: 'cv-message-row-ghost',
  chosenClass: 'cv-message-row-chosen',
  forceFallback: false,        // 禁用粗跟随幽灵元素
  fallbackOnBody: false,       // 禁用粗跟随幽灵元素
  delayOnTouchOnly: true,      // 手机端仍可用
  delay: 120,
  touchStartThreshold: 5,
  bubbleScroll: true,
};

/**
 * 滚动到列表末尾，使新增条目可见
 */
function scrollToEnd(): void {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

defineExpose({ scrollToEnd });
</script>

<!--
  ghost/fallback/chosen 可能挂到 body 或由 Sortable 动态切换 class，scoped 无法命中。
  迁移条件：拖拽库改为不依赖 body 浮层且 class 可挂在组件根内时，可改为行内工具类。
-->
<style>
.cv-message-row-ghost {
  opacity: 1 !important;
  border-style: dashed !important;
  border-color: var(--cvp-primary-color) !important;
  background: color-mix(in srgb, var(--cvp-primary-color) 12%, transparent) !important;
  box-shadow: none !important;
}

.cv-message-row-ghost > * {
  opacity: 0;
}

.cv-message-row-chosen {
  border-color: var(--cvp-primary-color);
  opacity: 0.85;
}

.cv-message-row-fallback {
  z-index: 10000;
  opacity: 1 !important;
  border-style: dashed !important;
  border-color: var(--cvp-primary-color) !important;
  background: color-mix(in srgb, var(--cvp-primary-color) 12%, transparent) !important;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--cv-on-surface) 24%, transparent) !important;
  pointer-events: none;
  cursor: grabbing !important;
}

/* 只保留整行虚线框轮廓，隐藏手柄与正文，避免 fallback 在 body 上布局错乱 */
.cv-message-row-fallback > * {
  opacity: 0;
}
</style>
