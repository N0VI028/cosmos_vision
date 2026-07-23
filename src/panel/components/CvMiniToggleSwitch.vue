<template>
  <!--
    v-bind="$attrs" 透传 ToggleSwitch 原生 prop/事件（modelValue、disabled、aria-label 等）
    尺寸由本组件固定为紧凑迷你规格，与 CvMiniButton small 并排对齐
  -->
  <ToggleSwitch v-bind="$attrs" :dt="miniTokens" class="cv-mini-toggleswitch relative inline-flex flex-none self-center" />
</template>

<script setup lang="ts">
import type { ToggleSwitchDesignTokens } from '@primeuix/themes/types/toggleswitch';

defineOptions({ inheritAttrs: false });

/**
 * 迷你 ToggleSwitch 局部 Design Tokens
 * 尺寸对齐列表行操作区（账号 / 人物 / 源条目旁的 CvMiniButton）
 */
const miniTokens = {
  root: {
    width: '1.2rem',
    height: '0.7rem',
    gap: '0.1rem',
    borderRadius: 'var(--cv-radius-full)',
    // 迷你尺寸下 1px 边框会让手柄相对轨道上下不对称
    borderWidth: '0',
  },
  handle: {
    size: '0.5rem',
    borderRadius: '50%',
  },
} satisfies ToggleSwitchDesignTokens;
</script>

<style scoped>
@reference '../../global.css';

/*
 * 残留：手柄垂直居中几何修正。
 * 原因：Aura ToggleSwitch 手柄用 margin-block-start:-half；迷你尺寸下亚像素取整会偏。
 * top/bottom:0 + margin-block:auto 按含边框盒几何居中，无法用 token/PT 表达。
 * 迁移条件：Aura 补 handle 垂直对齐 token，或官方改居中算法。
 */
.cv-mini-toggleswitch :deep(.cv-prime-toggleswitch-slider) {
  @apply relative box-border;
}

.cv-mini-toggleswitch :deep(.cv-prime-toggleswitch-handle) {
  top: 0;
  bottom: 0;
  margin-block: auto;
  transform: none;
}
</style>
