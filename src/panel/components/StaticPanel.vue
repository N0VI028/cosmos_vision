<template>
  <section class="flex flex-col">
    <header class="flex items-center justify-between gap-(--cv-space-lg)">
      <h2 class="cv-section-title min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ title }}</h2>
      <div
        v-if="$slots.actions"
        class="mt-(--cv-space-10xl) mb-(--cv-space-3xl) flex flex-wrap items-center justify-end gap-(--cv-space-3xl)"
      >
        <slot name="actions" />
      </div>
    </header>
    <div class="cv-section-body mb-0">
      <div class="min-w-0">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 非折叠的常驻数据模块
 * 用于数据管理页：标题 + 操作按钮 + 内容区
 */
defineProps<{ title: string }>();
</script>
