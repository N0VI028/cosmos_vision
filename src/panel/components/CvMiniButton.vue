<template>
  <Button
    v-bind="$attrs"
    :label="label"
    :icon="icon"
    :icon-pos="iconPos"
    :severity="severity"
    :dt="buttonTokens"
    :fluid="false"
    class="cv-mini-button"
    variant="text"
  >
    <slot />
  </Button>
</template>

<script setup lang="ts">
import type { ButtonDesignTokens } from '@primeuix/themes/types/button';
import type { ButtonProps } from 'primevue/button';

defineOptions({ inheritAttrs: false });

type CvMiniButtonTone = 'neutral' | 'warn' | 'warning' | 'danger' | 'error' | 'success' | 'info' | 'help';
type CvMiniButtonSize = 'small' | 'regular';

const props = withDefaults(
  defineProps<{
    label?: string;
    icon?: string;
    iconPos?: ButtonProps['iconPos'];
    tone?: CvMiniButtonTone;
    size?: CvMiniButtonSize;
  }>(),
  {
    label: undefined,
    icon: undefined,
    iconPos: 'left',
    tone: 'neutral',
    size: 'regular',
  },
);

const TONE_SEVERITY: Record<CvMiniButtonTone, ButtonProps['severity']> = {
  neutral: undefined,
  warn: 'warn',
  warning: 'warn',
  danger: 'danger',
  error: 'danger',
  success: 'success',
  info: 'info',
  help: 'help',
};
const TONE_COLOR: Record<CvMiniButtonTone, string> = {
  neutral: 'var(--cv-on-surface-variant)',
  warn: 'var(--p-orange-500)',
  warning: 'var(--p-orange-500)',
  danger: 'var(--p-red-500)',
  error: 'var(--p-red-500)',
  success: 'var(--p-green-500)',
  info: 'var(--p-sky-500)',
  help: 'var(--p-purple-500)',
};
const severity = computed(() => TONE_SEVERITY[props.tone]);
const buttonTokens = computed(() => buildButtonTokens(TONE_COLOR[props.tone], props.size));

const minHeight = computed(() => (props.size === 'small' ? '1.6em' : '2em'));
const fontSize = computed(() => (props.size === 'small' ? 'var(--cv-font-size-2xs)' : 'var(--cv-font-size-xs)'));

/**
 * 构建按钮的局部 PrimeVue Button token
 *
 * @param color 按钮文字与图标颜色
 * @param size 按钮尺寸
 * @returns PrimeVue Button scoped design tokens
 */
function buildButtonTokens(color: string, size: CvMiniButtonSize): ButtonDesignTokens {
  const textTone = { color, hoverBackground: 'transparent', activeBackground: 'transparent' };
  const sizeConfig = size === 'small' ? { iconOnlyWidth: '1.6em', gap: 'var(--cv-space-sm)' } : { iconOnlyWidth: '2em', gap: 'var(--cv-space-md)' };
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
