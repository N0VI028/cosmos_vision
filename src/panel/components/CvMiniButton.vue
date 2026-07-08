<template>
  <!--
    v-bind="$attrs" 透传所有 Button 原生 prop/事件（label、icon、disabled、title 等）
    只有 tone 和 size 需要在这里拦截转换
  -->
  <Button
    v-bind="$attrs"
    :severity="severity"
    :dt="buttonTokens"
    :fluid="false"
    variant="text"
    class="cv-mini-button"
  >
    <slot />
  </Button>
</template>

<script setup lang="ts">
import type { ButtonDesignTokens } from '@primeuix/themes/types/button';
import type { ButtonProps } from 'primevue/button';
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

/**
 * 迷你按钮的色调类型
 * - neutral: 中性色，默认样式
 * - warn/warning: 警告色（橙色）
 * - danger/error: 危险色（红色）
 * - success: 成功色（绿色）
 * - info: 信息色（天蓝色）
 * - help: 帮助色（紫色）
 */
type CvMiniButtonTone = 'neutral' | 'warn' | 'warning' | 'danger' | 'error' | 'success' | 'info' | 'help';

/**
 * 迷你按钮的尺寸类型
 * - small: 小尺寸（1.6em 高度）
 * - regular: 常规尺寸（2em 高度）
 */
type CvMiniButtonSize = 'small' | 'regular';

/**
 * 迷你按钮组件
 * 基于 PrimeVue Button 的轻量化封装，用于工具栏、卡片操作等紧凑场景。
 * 只声明需要转换处理的自定义 prop（tone/size），其余 Button 原生属性通过 $attrs 透传。
 */
const props = withDefaults(
  defineProps<{
    /** 按钮色调，映射为 severity + Design Token 颜色 */
    tone?: CvMiniButtonTone;
    /** 按钮尺寸，控制高度和间距 */
    size?: CvMiniButtonSize;
  }>(),
  { tone: 'neutral', size: 'regular' },
);

// 色调 → PrimeVue severity 映射
const TONE_SEVERITY_MAP: Record<CvMiniButtonTone, ButtonProps['severity']> = {
  neutral: undefined,
  warn: 'warn',
  warning: 'warn',
  danger: 'danger',
  error: 'danger',
  success: 'success',
  info: 'info',
  help: 'help',
} as const;

// 色调 → CSS 颜色变量映射
const TONE_COLOR_MAP: Record<CvMiniButtonTone, string> = {
  neutral: 'var(--cv-on-surface-variant)',
  warn: 'var(--p-orange-500)',
  warning: 'var(--p-orange-500)',
  danger: 'var(--p-red-500)',
  error: 'var(--p-red-500)',
  success: 'var(--p-green-500)',
  info: 'var(--p-sky-500)',
  help: 'var(--p-purple-500)',
} as const;

const severity = computed(() => TONE_SEVERITY_MAP[props.tone]);
const buttonTokens = computed(() => buildButtonTokens(TONE_COLOR_MAP[props.tone], props.size));

const minHeight = computed(() => (props.size === 'small' ? '1.6em' : '2em'));
const fontSize = computed(() => (props.size === 'small' ? 'var(--cv-font-size-2xs)' : 'var(--cv-font-size-xs)'));

/**
 * 构建按钮的局部 Design Tokens
 * 根据色调颜色和尺寸生成 PrimeVue Button 的 scoped token 配置
 *
 * @param color - 按钮文字与图标的颜色 CSS 变量
 * @param size - 按钮尺寸
 * @returns PrimeVue Button scoped design tokens
 */
function buildButtonTokens(color: string, size: CvMiniButtonSize): ButtonDesignTokens {
  const textTone = { color, hoverBackground: 'transparent', activeBackground: 'transparent' };
  const sizeConfig =
    size === 'small'
      ? { iconOnlyWidth: '1.6em', gap: 'var(--cv-space-sm)' }
      : { iconOnlyWidth: '2em', gap: 'var(--cv-space-md)' };

  return {
    root: {
      borderRadius: '0',
      gap: sizeConfig.gap,
      paddingX: '0',
      paddingY: '0',
      iconOnlyWidth: sizeConfig.iconOnlyWidth,
      focusRing: { width: '0', style: 'none', offset: '0' },
      label: { fontWeight: '500' },
    },
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

.cv-mini-button {
  @apply inline-flex w-max! min-w-0 flex-none cursor-pointer items-center justify-center border-0 bg-transparent leading-none shadow-none rounded-none! overflow-visible!;
  min-height: v-bind(minHeight);
  font-size: v-bind(fontSize);
}

.cv-mini-button[data-p-disabled='true'] {
  @apply cursor-not-allowed;
}

.cv-mini-button:focus-visible {
  @apply border-transparent! bg-transparent! shadow-none! outline-0;
}

.cv-mini-button:deep(.cv-prime-button-label),
.cv-mini-button:deep(.cv-prime-icon) {
  @apply leading-none;
}
</style>
