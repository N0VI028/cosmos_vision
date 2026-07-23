<template>
  <!--
    外层 span 提供与 CvMiniButton 对齐的 2em 行高 + 水平留白；
    ToggleSwitch 根节点保持轨道本体尺寸，避免 h/px 压到轨道上导致变形。
    v-bind="$attrs" 透传 modelValue、disabled、aria-label 等。
  -->
  <span class="cv-mini-toggleswitch-shell inline-flex h-[2em] flex-none items-center self-center px-(--cv-space-sm)">
    <ToggleSwitch v-bind="$attrs" :dt="miniTokens" class="cv-mini-toggleswitch relative inline-flex flex-none" />
  </span>
</template>

<script setup lang="ts">
import type { ToggleSwitchDesignTokens } from '@primeuix/themes/types/toggleswitch';

defineOptions({ inheritAttrs: false });

/**
 * 迷你 ToggleSwitch 局部 Design Tokens
 * 轨道本体紧凑；行高与水平留白由外层 shell 承担，对齐 CvMiniButton
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
