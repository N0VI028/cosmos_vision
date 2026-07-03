import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { sliderToken } from './primevue-tokens';

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
 * ToggleButton 颜色 token —— light/dark 共用,颜色全部走 cv 自适应变量
 */
const toggleButtonColor = {
  root: {
    padding: '0',
    background: 'var(--cv-surface-container-high)',
    hoverBackground: 'var(--cv-surface-variant)',
    checkedBackground: 'var(--cv-primary-container)',
    borderColor: 'var(--cv-surface-variant)',
    checkedBorderColor: 'var(--cv-primary-container)',
    borderRadius: 'var(--cv-radius-full)',
    color: 'var(--cv-on-surface-variant)',
    hoverColor: 'var(--cv-on-surface)',
    checkedColor: 'var(--cv-on-primary-container)',
    fontWeight: '500',
    transitionDuration: '0.15s',
  },
  content: {
    padding: 'var(--cv-space-3xl) var(--cv-space-lg)',
    borderRadius: 'var(--cv-radius-full)',
    checkedBackground: 'transparent',
    checkedShadow: 'none',
  },
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
        paddingX: 'var(--cv-space-5xl)',
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
    slider: sliderToken,
    panel: {
      root: {
        background: 'transparent',
        borderColor: 'transparent',
        color: 'var(--cv-on-surface)',
        borderRadius: 'var(--cv-radius)',
      },
      header: {
        background: 'transparent',
        color: 'var(--cv-on-surface)',
        padding: 'var(--cv-space-xl) var(--cv-space-2xl)',
        borderColor: 'transparent',
        borderWidth: '0',
        borderRadius: '0',
      },
      content: {
        padding: '0',
      },
      footer: {
        padding: '0',
      },
    },
    treetable: {
      colorScheme: {
        light: {
          root: { borderColor: 'var(--cv-surface-variant)' },
          bodyCell: { selectedBorderColor: 'var(--cv-primary-container)' },
        },
        dark: {
          root: { borderColor: 'var(--cv-surface-variant)' },
          bodyCell: { selectedBorderColor: 'var(--cv-primary-container)' },
        },
      },
    },
    datatable: {
      colorScheme: {
        light: {
          root: { borderColor: 'var(--cv-surface-variant)' },
          bodyCell: { selectedBorderColor: 'var(--cv-primary-container)' },
        },
        dark: {
          root: { borderColor: 'var(--cv-surface-variant)' },
          bodyCell: { selectedBorderColor: 'var(--cv-primary-container)' },
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
    // ToggleButton:必须用 colorScheme.light/dark 显式覆盖 Aura 默认值。
    // Aura 的 togglebutton 颜色仅定义在 colorScheme.light/dark(surface.100/950),
    // 会覆盖 root 层的 cv 自适应变量;且 PrimeVue darkModeSelector 与 cv 变量的
    // .cosmos-vision-app-dark 各自独立,把 cv 变量挂到 light/dark 两端可保证
    // 无论哪个 colorScheme 激活,都走随深色自适应的 cv 变量,深色下不再回退浅色。
    togglebutton: {
      colorScheme: {
        light: toggleButtonColor,
        dark: toggleButtonColor,
      },
    },
  },
});
