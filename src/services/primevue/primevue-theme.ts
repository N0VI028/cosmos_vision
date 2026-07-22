import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

/**
 * 表单字段颜色 token —— light/dark 共用视觉（禁用态除外）
 * InputText / Textarea / Select 等继承 formField；shadow 清零对齐扁平方块基线
 * 禁用底色在 colorScheme 中按浅/深色拆分，避免浅色半透明看起来像深色禁用
 */
const formFieldColorBase = {
  background: 'var(--cv-surface-container-high)',
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
  shadow: 'none',
} as const;

/**
 * 浅色：禁用底比正常 field 更浅（surface 上极淡叠字色）
 * 注意：ST 的 input:disabled { filter:brightness(0.5) } 会单独压暗，必须在 host-resets 清掉
 */
const formFieldColorLight = {
  ...formFieldColorBase,
  disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  disabledColor: 'color-mix(in srgb, var(--cv-on-surface-variant) 70%, var(--cv-surface))',
} as const;

/** 深色：保留半透明叠底，与暗表面对比适中 */
const formFieldColorDark = {
  ...formFieldColorBase,
  disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
} as const;

/**
 * Chip 颜色 token —— light/dark 共用，主色半透明底 + 主色文字
 */
const chipColor = {
  root: {
    background: 'color-mix(in srgb, var(--p-primary-color) 12%, transparent)',
    focusBackground: 'color-mix(in srgb, var(--p-primary-color) 18%, transparent)',
    color: 'var(--p-primary-color)',
  },
  icon: {
    color: 'var(--p-primary-color)',
  },
  removeIcon: {
    color: 'var(--p-primary-color)',
    focusRing: {
      color: 'color-mix(in srgb, var(--cv-primary-container) 24%, transparent)',
      shadow: 'none',
    },
  },
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
 * ToggleSwitch 颜色 token —— 显式挂到 light/dark,避免 Aura colorScheme 回退覆盖默认轨道色
 */
const toggleSwitchColor = {
  root: {
    background: 'var(--cv-surface-container-high)',
    hoverBackground: 'var(--cv-surface-container)',
    checkedBackground: 'var(--cv-primary-container)',
    checkedHoverBackground: 'var(--cv-primary-container)',
    disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
    borderColor: 'transparent',
    hoverBorderColor: 'transparent',
    checkedBorderColor: 'transparent',
    checkedHoverBorderColor: 'transparent',
    invalidBorderColor: 'var(--p-red-500)',
    shadow: 'none',
  },
  handle: {
    background: 'var(--cv-surface-container-lowest)',
    hoverBackground: 'var(--cv-surface-container-lowest)',
    checkedBackground: 'var(--cv-on-primary-container)',
    checkedHoverBackground: 'var(--cv-on-primary-container)',
    disabledBackground: 'var(--cv-surface-container-lowest)',
    color: 'var(--cv-on-surface-variant)',
    hoverColor: 'var(--cv-on-surface)',
    checkedColor: 'var(--cv-primary-container)',
    checkedHoverColor: 'var(--cv-primary-container)',
  },
} as const;

/**
 * InputNumber 步进按钮颜色 —— light/dark 共用自适应 cv 变量
 * 覆盖 Aura surface 灰阶，避免深色回退浅灰；内嵌 input 仍走 formField / InputText
 */
const inputNumberButtonColor = {
  background: 'transparent',
  hoverBackground: 'var(--cv-surface-variant)',
  activeBackground: 'var(--cv-surface-container)',
  borderColor: 'var(--cv-surface-variant)',
  hoverBorderColor: 'var(--cv-outline)',
  activeBorderColor: 'var(--cv-outline)',
  color: 'var(--cv-on-surface-variant)',
  hoverColor: 'var(--cv-on-surface)',
  activeColor: 'var(--cv-on-surface)',
} as const;

/**
 * Password 颜色 token —— light/dark 共用
 * 内嵌 pcInputText 继承 formField；此处只管 meter / icon / strength-overlay
 */
const passwordColor = {
  meter: { background: 'var(--cv-surface-variant)' },
  icon: { color: 'var(--cv-on-surface-variant)' },
  overlay: {
    background: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface)',
    shadow: 'var(--cv-popover-shadow)',
  },
  strength: {
    weakBackground: 'var(--p-red-500)',
    mediumBackground: 'var(--p-amber-500)',
    strongBackground: 'var(--p-green-500)',
  },
} as const;

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
    },
    colorScheme: {
      light: { formField: formFieldColorLight },
      dark: { formField: formFieldColorDark },
    },
  },
  components: {
    // InputTags 继承 form.field 颜色；圆角与 Textarea 一致
    // 官方样式 padding-block = padding.y / 2，故 paddingY 需写 2 倍以对齐 form-field 垂直内边距
    inputtags: {
      root: {
        paddingX: 'var(--cv-space-md)',
        paddingY: 'calc(var(--cv-space-md) * 2)',
        gap: 'var(--cv-space-xs)',
        borderRadius: 'var(--cv-radius-md)',
      },
      item: {
        borderRadius: 'var(--cv-radius-full)',
      },
    },
    // Chip：非颜色尺寸走 root，颜色走 colorScheme 覆盖 Aura light-dark 默认值
    chip: {
      root: {
        borderRadius: 'var(--cv-radius-full)',
        paddingX: '0.6em',
        paddingY: '0.25em',
        gap: 'var(--cv-space-xs)',
      },
      label: {
        fontSize: 'var(--cv-font-size-xs)',
      },
      colorScheme: {
        light: chipColor,
        dark: chipColor,
      },
    },
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
    // InputNumber：按钮非颜色尺寸走 root.button；颜色走 colorScheme 覆盖 Aura surface 灰阶
    // 内嵌 pcInputText 继承 formField / InputText，不在此重复写 input 色
    inputnumber: {
      button: {
        width: '2.25em',
        borderRadius: 'var(--cv-radius-full)',
      },
      colorScheme: {
        light: { button: inputNumberButtonColor },
        dark: { button: inputNumberButtonColor },
      },
    },
    // Password：非颜色尺寸走 root；颜色走 colorScheme
    // 内嵌 pcInputText 继承 formField / InputText；toggle 右内边距由官方 :has 规则算 form.field.padding.x
    password: {
      content: { gap: 'var(--cv-space-md)' },
      meter: {
        height: '0.5em',
        borderRadius: 'var(--cv-radius-full)',
      },
      meterText: { fontSize: 'var(--cv-font-size-sm)' },
      overlay: {
        borderRadius: 'var(--cv-radius-lg)',
        padding: 'var(--cv-space-lg)',
      },
      colorScheme: {
        light: passwordColor,
        dark: passwordColor,
      },
    },
    message: {
      text: {
        fontSize: 'var(--cv-font-size-sm)',
        sm: { fontSize: 'var(--cv-font-size-xs)' },
        lg: { fontSize: 'var(--cv-font-size-md)' },
      },
    },
    slider: {
      root: {
        transitionDuration: 'var(--p-transition-duration, 0.2s)',
      },
      track: {
        borderRadius: 'var(--cv-radius-full)',
        size: '0.2667em',
      },
      range: {},
      handle: {
        width: '1.0667em',
        height: '1.0667em',
        borderRadius: '50%',
        content: {
          width: '0.4em',
          height: '0.4em',
          borderRadius: '50%',
          shadow: 'none',
        },
        focusRing: {
          width: 'var(--p-focus-ring-width, 0.1333em)',
          style: 'var(--p-focus-ring-style, solid)',
          color: 'var(--p-focus-ring-color, color-mix(in srgb, var(--cv-primary-container) 10%, transparent))',
          offset: 'var(--p-focus-ring-offset, 0)',
          shadow: 'var(--p-focus-ring-shadow, none)',
        },
      },
      colorScheme: {
        light: {
          track: {
            background: 'var(--cv-surface-variant)',
          },
          range: {
            background: 'var(--cv-outline)',
          },
          handle: {
            background: 'var(--cv-surface-container)',
            hoverBackground: 'var(--cv-surface-container-high)',
            content: {
              background: 'var(--cv-on-surface)',
              hoverBackground: 'var(--cv-on-surface)',
            },
          },
        },
        dark: {
          track: {
            background: 'var(--cv-surface-variant)',
          },
          range: {
            background: 'var(--cv-outline)',
          },
          handle: {
            background: 'var(--cv-surface-container)',
            hoverBackground: 'var(--cv-surface-container-high)',
            content: {
              background: 'var(--cv-on-surface)',
              hoverBackground: 'var(--cv-on-surface)',
            },
          },
        },
      },
    },
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
      colorScheme: {
        light: toggleSwitchColor,
        dark: toggleSwitchColor,
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
    accordion: {
      panel: {
        borderWidth: '0',
        borderColor: 'transparent',
      },
      header: {
        background: 'transparent',
        hoverBackground: 'transparent',
        activeBackground: 'transparent',
        activeHoverBackground: 'transparent',
        borderWidth: '0',
        borderColor: 'transparent',
        padding: 'var(--cv-space-2xl)',
        focusRing: {
          width: '2px',
          style: 'solid',
          color: 'var(--p-primary-color)',
          offset: '2px',
          shadow: 'none',
        },
      },
      content: {
        background: 'transparent',
        borderWidth: '0',
        padding: '0',
      },
    },
    galleria: {
      root: {
        borderRadius: '0',
      },
    },
    divider: {
      root: {
        borderColor: 'var(--cv-surface-variant)',
      },
    },
    dialog: {
      root: {
        background: 'var(--cv-surface-container-lowest)',
        borderColor: 'transparent',
        color: 'var(--cv-on-surface)',
        borderRadius: 'var(--cv-radius-lg)',
        shadow: 'var(--cv-floating-shadow)',
      },
      header: {
        gap: '0.5em',
      },
      title: {
        fontSize: 'var(--cv-font-size-2xl)',
      },
      footer: {
        gap: '0.5em',
      },
    },
  },
});

/**
 * 迷你按钮的 root Design Tokens 定义（支持传入动态的尺寸配置）
 */
export const getMiniButtonRootTokens = (sizeConfig: { gap: string; iconOnlyWidth: string }) => ({
  borderRadius: '0',
  gap: sizeConfig.gap,
  paddingX: '0',
  paddingY: '0',
  iconOnlyWidth: sizeConfig.iconOnlyWidth,
  focusRing: { width: '0', style: 'none', offset: '0' },
  label: { fontWeight: '500' },
} as const);


