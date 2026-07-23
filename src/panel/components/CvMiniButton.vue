<template>
  <!--
    v-bind="$attrs" 透传所有 Button 原生 prop/事件（label、icon、disabled、title 等）
    仅 tone 在此拦截；尺寸/字号/hover 几何对齐预设工具条 icon
  -->
  <Button
    v-bind="$attrs"
    :severity="severity"
    :dt="buttonTokens"
    :fluid="false"
    variant="text"
    class="cv-mini-button inline-flex h-[2em]! w-max! min-h-[2em]! min-w-0 flex-none cursor-pointer items-center justify-center overflow-visible! border-(length:--cv-border-width)! border-solid! border-transparent! bg-transparent leading-none shadow-none transition-all duration-150 focus-visible:border-transparent! focus-visible:bg-transparent! focus-visible:shadow-none! focus-visible:outline-0 data-[p-disabled=true]:cursor-not-allowed [&_.cv-prime-button-label]:leading-none [&_.cv-prime-icon]:inline-flex [&_.cv-prime-icon]:size-[1em] [&_.cv-prime-icon]:shrink-0 [&_.cv-prime-icon]:items-center [&_.cv-prime-icon]:justify-center [&_.cv-prime-icon]:leading-none"
    :style="buttonStyle"
  >
    <slot />
  </Button>
</template>

<script setup lang="ts">
import type { ButtonDesignTokens } from '@primeuix/themes/types/button';
import type { ButtonProps } from 'primevue/button';
import { computed } from 'vue';
import { getMiniButtonRootTokens } from '@/services/primevue/primevue-theme';

defineOptions({ inheritAttrs: false });

/**
 * 迷你按钮的色调类型
 * - neutral: 中性色，默认样式；hover 升为主题色（对齐预设工具条）
 * - primary: 主题色
 * - warn/warning: 警告色（橙色）
 * - danger/error: 危险色（红色）
 * - success: 成功色（绿色）
 * - info: 信息色（天蓝色）
 * - help: 帮助色（紫色）
 */
type CvMiniButtonTone = 'neutral' | 'primary' | 'warn' | 'warning' | 'danger' | 'error' | 'success' | 'info' | 'help';

/**
 * 迷你按钮组件
 * 基于 PrimeVue Button 的轻量化封装，几何对齐预设工具条 icon（2em / 2xs / 圆角描边 hover）。
 * 只声明 tone；其余 Button 原生属性通过 $attrs 透传。
 */
const props = withDefaults(
  defineProps<{
    /** 按钮色调，映射为 severity + 文字/hover 颜色 */
    tone?: CvMiniButtonTone;
  }>(),
  { tone: 'neutral' },
);

// 色调 → PrimeVue severity 映射
const TONE_SEVERITY_MAP: Record<CvMiniButtonTone, ButtonProps['severity']> = {
  neutral: undefined,
  primary: undefined,
  warn: 'warn',
  warning: 'warn',
  danger: 'danger',
  error: 'danger',
  success: 'success',
  info: 'info',
  help: 'help',
} as const;

// 色调 → 默认文字色
const TONE_COLOR_MAP: Record<CvMiniButtonTone, string> = {
  neutral: 'var(--cv-on-surface-variant)',
  primary: 'var(--p-primary-color)',
  warn: 'var(--p-orange-500)',
  warning: 'var(--p-orange-500)',
  danger: 'var(--p-red-500)',
  error: 'var(--p-red-500)',
  success: 'var(--p-green-500)',
  info: 'var(--p-sky-500)',
  help: 'var(--p-purple-500)',
} as const;

// neutral hover 对齐预设工具条（升为主色）；其余 tone 用自身色
const TONE_HOVER_COLOR_MAP: Record<CvMiniButtonTone, string> = {
  ...TONE_COLOR_MAP,
  neutral: 'var(--p-primary-color)',
};

const severity = computed(() => TONE_SEVERITY_MAP[props.tone]);
const toneColor = computed(() => TONE_COLOR_MAP[props.tone]);
const hoverColor = computed(() => TONE_HOVER_COLOR_MAP[props.tone]);
const buttonTokens = computed(() => buildButtonTokens(toneColor.value));
const buttonStyle = computed(() => ({
  fontSize: 'var(--cv-font-size-2xs)',
  color: toneColor.value,
  // 供 hover 混色使用（对齐 .cv-preset-btn）
  '--cv-mini-btn-hover': hoverColor.value,
}));

/**
 * 构建按钮的局部 Design Tokens
 * 固定 2em 图标宽与紧凑 gap；hover 底色由 scoped 规则按工具条混色
 *
 * @param color - 按钮文字与图标的颜色 CSS 变量
 * @returns PrimeVue Button scoped design tokens
 */
function buildButtonTokens(color: string): ButtonDesignTokens {
  const textTone = { color, hoverBackground: 'transparent', activeBackground: 'transparent' };
  return {
    root: getMiniButtonRootTokens({
      iconOnlyWidth: '2em',
      gap: 'var(--cv-space-sm)',
    }) as any,
    text: {
      primary: textTone,
      warn: textTone,
      danger: textTone,
      success: textTone,
      info: textTone,
      help: textTone,
    },
  };
}
</script>

<style scoped>
@reference '../../global.css';

/*
 * 对齐预设工具条：小圆角 + hover 浅底/描边。
 * color-mix hover 无法用 Button text token 表达，故最小 scoped。
 * icon-only 强制 2em 正方，避免 w-max 随字形非方、hover 露馅。
 */
.cv-mini-button {
  border-radius: var(--cv-radius-sm) !important;
}

.cv-mini-button:is([data-p-icon-only='true'], .p-button-icon-only) {
  width: 2em !important;
  min-width: 2em !important;
  max-width: 2em !important;
  height: 2em !important;
  min-height: 2em !important;
}

.cv-mini-button:hover:not(:disabled):not([data-p-disabled='true']) {
  color: var(--cv-mini-btn-hover) !important;
  background: color-mix(in srgb, var(--cv-mini-btn-hover) 10%, transparent) !important;
  border-color: color-mix(in srgb, var(--cv-mini-btn-hover) 40%, transparent) !important;
}
</style>
