<template>
  <section class="cv-static-panel">
    <header class="cv-static-panel-header">
      <h2 class="cv-section-title cv-static-panel-title">{{ title }}</h2>
      <div v-if="$slots.actions" class="cv-static-panel-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="cv-section-body cv-static-panel-body">
      <div class="cv-static-panel-scroll">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 非折叠的常驻数据模块
 * 用于数据管理页：标题 + 操作按钮 + 限高可滚动的内容区
 */
defineProps<{ title: string }>();
</script>

<style scoped>
@reference '../../global.css';

.cv-static-panel {
  @apply flex flex-col;
}

.cv-static-panel-header {
  @apply flex items-center justify-between;
  gap: var(--cv-space-lg);
}

.cv-static-panel-title {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap;
}

.cv-static-panel-actions {
  @apply flex flex-wrap items-center justify-end;
  gap: var(--cv-space-3xl);
  margin: var(--cv-space-10xl) 0 var(--cv-space-3xl) 0;
}

.cv-static-panel-body {
  margin-bottom: 0;
}

/* 圆角底色内容块，超出限高则内部滚动 */
.cv-static-panel-scroll {
  @apply overflow-y-auto;
  max-height: var(--cv-static-panel-max-h, 26rem);
}
</style>
