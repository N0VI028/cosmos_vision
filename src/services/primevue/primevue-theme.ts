import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

const formFieldColor = {
  background: 'var(--cv-surface-container-high)',
  disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
  filledBackground: 'var(--cv-surface-container-high)',
  filledHoverBackground: 'var(--cv-surface-container)',
  filledFocusBackground: 'var(--cv-surface-container-high)',
  borderColor: 'var(--cv-surface-variant)',
  hoverBorderColor: 'var(--cv-outline)',
  focusBorderColor: 'var(--cv-primary-container)',
  invalidBorderColor: 'var(--p-red-500)',
  color: 'var(--cv-on-surface)',
  disabledColor: 'var(--cv-on-surface-variant)',
  placeholderColor: 'var(--cv-on-surface-variant)',
  invalidPlaceholderColor: 'color-mix(in srgb, var(--p-red-500) 75%, var(--cv-on-surface-variant))',
} as const;

/**
 * PrimeVue 主题 preset
 */
export const cosmosPrimePreset = definePreset(Aura, {
  semantic: {
    formField: {
      paddingX: 'var(--cv-space-5xl)',
      paddingY: 'var(--cv-space-lg)',
      sm: {
        paddingX: 'var(--cv-space-4xl)',
        paddingY: 'var(--cv-space-sm)',
      },
      lg: {
        paddingX: 'var(--cv-space-6xl)',
        paddingY: 'var(--cv-space-lg)',
      },
      borderRadius: 'var(--cv-radius-full)',
      focusRing: {
        width: '0.1333em',
        style: 'solid',
        color: 'color-mix(in srgb, var(--cv-primary-container) 10%, transparent)',
        offset: '0',
        shadow: 'none',
      },
    },
    colorScheme: {
      light: { formField: formFieldColor },
      dark: { formField: formFieldColor },
    },
  },
  components: {
    select: {
      root: {
        paddingX: 'var(--p-form-field-padding-x)',
        paddingY: 'var(--p-form-field-padding-y)',
      },
    },
    button: {
      // outlined secondary 边框接到自适应 cv token,与表单输入框边框一致;
      // 避免回退 Aura 的 {surface.xxx} 调色板,导致深色下边框过亮、与浅色无差异
      colorScheme: {
        light: {
          outlined: {
            secondary: {
              borderColor: 'var(--cv-surface-variant)',
            },
          },
        },
        dark: {
          outlined: {
            secondary: {
              borderColor: 'var(--cv-surface-variant)',
            },
          },
        },
      },
    },
    multiselect: {
      root: {
        paddingX: 'var(--p-form-field-padding-x)',
        paddingY: 'var(--p-form-field-padding-y)',
      },
    },
    checkbox: {
      root: {
        borderRadius: 'var(--cv-radius-sm)',
        background: 'var(--cv-surface-container-high)',
        checkedBackground: 'var(--cv-primary-container)',
        checkedHoverBackground: 'var(--cv-primary-container)',
        disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
        borderColor: 'var(--cv-surface-variant)',
        hoverBorderColor: 'var(--cv-outline)',
        checkedBorderColor: 'var(--cv-primary-container)',
        checkedHoverBorderColor: 'var(--cv-primary-container)',
        checkedFocusBorderColor: 'var(--cv-primary-container)',
        checkedDisabledBorderColor: 'var(--cv-surface-variant)',
        invalidBorderColor: 'var(--p-red-500)',
        shadow: 'none',
      },
      icon: {
        color: 'var(--cv-on-surface)',
        checkedColor: 'var(--cv-on-primary-container)',
        checkedHoverColor: 'var(--cv-on-primary-container)',
        disabledColor: 'var(--cv-on-surface-variant)',
      },
    },
    textarea: { root: { borderRadius: 'var(--cv-radius-md)' } },
    slider: {
      track: { background: 'var(--cv-surface-variant)', borderRadius: 'var(--cv-radius-full)', size: '0.2667em' },
      range: { background: 'var(--cv-outline)' },
      handle: {
        width: '1.0667em',
        height: '1.0667em',
        borderRadius: '50%',
        background: 'var(--cv-surface-container)',
        hoverBackground: 'var(--cv-surface-container-high)',
        content: {
          width: '0.4em',
          height: '0.4em',
          background: 'var(--cv-on-surface)',
          hoverBackground: 'var(--cv-on-surface)',
          shadow: 'none',
        },
      },
    },
    toggleswitch: {
      root: {
        background: 'var(--cv-surface-container-high)',
        checkedBackground: 'var(--cv-primary-container)',
        checkedHoverBackground: 'var(--cv-primary-container)',
      },
    },
    togglebutton: {
      root: {
        background: 'var(--cv-surface-container-high)',
        hoverBackground: 'var(--cv-surface-variant)',
        checkedBackground: 'var(--cv-primary-container)',
        borderColor: 'var(--cv-surface-variant)',
        checkedBorderColor: 'var(--cv-primary-container)',
        color: 'var(--cv-on-surface-variant)',
        hoverColor: 'var(--cv-on-surface)',
        checkedColor: 'var(--cv-on-primary-container)',
      },
      content: { checkedBackground: 'transparent', checkedShadow: 'none' },
    },
  },
});
