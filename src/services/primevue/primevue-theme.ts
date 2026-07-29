import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { cosmosPrimeComponents } from './primevue-theme-components';
import { formFieldColorDark, formFieldColorLight, semanticSharedColorScheme } from './primevue-theme-tokens';

/**
 * PrimeVue 主题 preset
 */
export const cosmosPrimePreset = definePreset(Aura, {
  semantic: {
    focusRing: {
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'none',
    },
    formField: {
      fontSize: 'var(--cv-font-size-base)',
      paddingX: 'var(--cv-space-5xl)',
      paddingY: 'var(--cv-space-lg)',
      sm: {
        fontSize: 'var(--cv-font-size-xs)',
        paddingX: 'var(--cv-space-4xl)',
        paddingY: 'var(--cv-space-sm)',
      },
      lg: {
        fontSize: 'var(--cv-font-size-lg)',
        paddingX: 'var(--cv-space-5xl)',
        paddingY: 'var(--cv-space-lg)',
      },
      borderRadius: 'var(--cv-radius-full)',
    },
    list: {
      option: {
        fontSize: 'var(--cv-font-size-base)',
      },
      optionGroup: {
        fontSize: 'var(--cv-font-size-base)',
      },
    },
    overlay: {
      select: {
        borderRadius: 'var(--cv-radius-lg)',
      },
      popover: {
        borderRadius: 'var(--cv-radius)',
        padding: 'var(--cv-space-sm)',
      },
      modal: {
        borderRadius: 'var(--cv-radius-lg)',
        padding: 'var(--cv-space-5xl)',
      },
    },
    colorScheme: {
      light: {
        formField: formFieldColorLight,
        ...semanticSharedColorScheme,
      },
      dark: {
        formField: formFieldColorDark,
        ...semanticSharedColorScheme,
      },
    },
  },
  components: cosmosPrimeComponents,
});

/**
 * 迷你按钮 root Design Tokens（几何对齐预设工具条 icon：2em 方钮 + 小圆角）
 * paddingX 给「图标+文字」左右留白，hover 底/描边不贴内容；icon-only 由官方改用 iconOnlyWidth 正方，不受 paddingX 影响
 * @param sizeConfig gap / iconOnlyWidth，默认由 CvMiniButton 固定为 2em 规格
 */
export const getMiniButtonRootTokens = (sizeConfig: { gap: string; iconOnlyWidth: string }) =>
  ({
    borderRadius: 'var(--cv-radius-sm)',
    gap: sizeConfig.gap,
    paddingX: 'var(--cv-space-sm)',
    paddingY: '0',
    iconOnlyWidth: sizeConfig.iconOnlyWidth,
    focusRing: { width: '0', style: 'none', offset: '0' },
    label: { fontWeight: '500' },
  }) as const;
