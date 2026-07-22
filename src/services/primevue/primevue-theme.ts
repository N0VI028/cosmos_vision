import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

/**
 * 表单字段颜色 token —— light/dark 共用视觉（禁用态除外）
 * InputText / Textarea / Select 等继承 formField；shadow 清零对齐扁平方块基线
 * iconColor 供 Select dropdown/clearIcon 等 form.field.icon 引用
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
  iconColor: 'var(--cv-on-surface-variant)',
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
 * Chip 颜色 token —— light/dark 共用
 * 主色半透明底 + 主色文字；覆盖 Aura light-dark(surface.*) 灰阶
 * 无 border token，描边见 bridge 结构规则
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
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'none',
    },
  },
} as const;

/**
 * Slider 颜色 token —— light/dark 共用
 * 轨道 surface-variant；进度条 outline；手柄外圈 surface-container + 内点 on-surface
 * 覆盖 Aura content.border / primary.color / surface.0 灰阶与 emerald
 */
const sliderColor = {
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
} as const;

/**
 * ToggleButton 颜色 token —— 显式覆盖 Aura light-dark/surface 灰阶
 * 选中态走 primary-container + on-primary-container
 */
const toggleButtonColorLight = {
  root: {
    background: 'var(--cv-surface-container-high)',
    hoverBackground: 'var(--cv-surface-variant)',
    checkedBackground: 'var(--cv-primary-container)',
    borderColor: 'var(--cv-surface-variant)',
    checkedBorderColor: 'var(--cv-primary-container)',
    color: 'var(--cv-on-surface-variant)',
    hoverColor: 'var(--cv-on-surface)',
    checkedColor: 'var(--cv-on-primary-container)',
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
    disabledBorderColor: 'var(--cv-outline-variant)',
    disabledColor: 'var(--cv-on-surface-variant)',
  },
  content: {
    checkedBackground: 'transparent',
    checkedShadow: 'none',
  },
  icon: {
    color: 'inherit',
    hoverColor: 'inherit',
    checkedColor: 'var(--cv-on-primary-container)',
    disabledColor: 'var(--cv-on-surface-variant)',
  },
} as const;

const toggleButtonColorDark = {
  ...toggleButtonColorLight,
  root: {
    ...toggleButtonColorLight.root,
    disabledBackground: 'var(--cv-surface-container-high)',
  },
} as const;


/**
 * ToggleSwitch 颜色 token 基线 —— light/dark 共用视觉（禁用底除外）
 * 显式挂 colorScheme 两端，避免 Aura light-dark/surface 灰阶覆盖 cv 自适应变量
 * 选中轨道用 primary-container，手柄用 on-primary-container，对齐 Checkbox 容器色语义
 */
const toggleSwitchColorBase = {
  root: {
    background: 'var(--cv-surface-container-high)',
    hoverBackground: 'var(--cv-surface-container)',
    checkedBackground: 'var(--cv-primary-container)',
    checkedHoverBackground: 'var(--cv-primary-container)',
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

/** 浅色 ToggleSwitch：禁用轨道与 formField 浅色禁用一致 */
const toggleSwitchColorLight = {
  root: {
    ...toggleSwitchColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  },
  handle: toggleSwitchColorBase.handle,
} as const;

/** 深色 ToggleSwitch：半透明叠底 */
const toggleSwitchColorDark = {
  root: {
    ...toggleSwitchColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
  },
  handle: toggleSwitchColorBase.handle,
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
 * Button secondary 实心色 —— 覆盖 Aura light-dark(surface.*) 灰阶
 * 与 formField / ToggleButton 中性表面语义对齐
 */
const buttonSecondarySolid = {
  background: 'var(--cv-surface-container-high)',
  hoverBackground: 'var(--cv-surface-variant)',
  activeBackground: 'var(--cv-surface-container)',
  borderColor: 'var(--cv-surface-variant)',
  hoverBorderColor: 'var(--cv-outline)',
  activeBorderColor: 'var(--cv-outline)',
  color: 'var(--cv-on-surface)',
  hoverColor: 'var(--cv-on-surface)',
  activeColor: 'var(--cv-on-surface)',
  focusRing: { color: 'transparent', shadow: 'none' },
} as const;

/**
 * Button outlined.secondary —— 边框对齐 form.field；hover 半透明 surface-variant
 * 官方 outlined hover 只读 border.color（无 hoverBorder），故边框保持 surface-variant
 */
const buttonOutlinedSecondary = {
  hoverBackground: 'color-mix(in srgb, var(--cv-surface-variant) 50%, transparent)',
  activeBackground: 'color-mix(in srgb, var(--cv-surface-variant) 70%, transparent)',
  borderColor: 'var(--cv-surface-variant)',
  color: 'var(--cv-on-surface-variant)',
} as const;

/**
 * Button text.secondary —— 中性字色 + 半透明 hover 底
 */
const buttonTextSecondary = {
  hoverBackground: 'color-mix(in srgb, var(--cv-surface-variant) 50%, transparent)',
  activeBackground: 'color-mix(in srgb, var(--cv-surface-variant) 70%, transparent)',
  color: 'var(--cv-on-surface-variant)',
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
 * Dialog 颜色 token —— light/dark 共用
 * Aura 默认映射 overlay.modal.*（surface 灰阶）；本项目改 cv surface/floating
 * 非颜色尺寸（radius/header.gap/title/padding）走 components.dialog root 段
 */
const dialogColor = {
  root: {
    background: 'var(--cv-surface-container-lowest)',
    borderColor: 'transparent',
    color: 'var(--cv-on-surface)',
    shadow: 'var(--cv-floating-shadow)',
  },
} as const;

/**
 * Popover 颜色 token —— light/dark 共用
 * Aura 默认映射 overlay.popover.*；本项目对齐 surface-container-high + popover-shadow
 * gutter/arrowOffset/content.padding 等非颜色走 components.popover root 段
 */
const popoverColor = {
  root: {
    background: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-outline)',
    color: 'var(--cv-on-surface)',
    shadow: 'var(--cv-popover-shadow)',
  },
} as const;

/**
 * Checkbox 颜色 token 基线 —— light/dark 共用视觉（禁用底除外）
 * Aura 将颜色挂在 root/icon；本项目按规范拆到 colorScheme
 * 选中态用 primary-container + on-primary-container，对齐 Material 容器色而非 solid primary
 */
const checkboxColorBase = {
  root: {
    background: 'var(--cv-surface-container-high)',
    checkedBackground: 'var(--cv-primary-container)',
    checkedHoverBackground: 'var(--cv-primary-container)',
    filledBackground: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-surface-variant)',
    hoverBorderColor: 'var(--cv-outline)',
    focusBorderColor: 'var(--cv-surface-variant)',
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
} as const;

/** 浅色 Checkbox：禁用底与 formField 浅色禁用一致 */
const checkboxColorLight = {
  root: {
    ...checkboxColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  },
  icon: checkboxColorBase.icon,
} as const;

/** 深色 Checkbox：半透明叠底 */
const checkboxColorDark = {
  root: {
    ...checkboxColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
  },
  icon: checkboxColorBase.icon,
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
    // InputTags：颜色全量继承 form.field（Aura root → {form.field.*}）
    // 官方样式 padding-block = padding.y / 2，故 paddingY 需写 2 倍以对齐 form-field 垂直内边距
    // 圆角与 Textarea 一致 md（多行 chip 容器，非 pill）
    // focusRing 清零 → 官方 .p-inputtags.p-focus 的 outline/box-shadow 不画外圈
    // 内嵌 AutoComplete/Chip 视觉走各自 token；pcChip 描边见 bridge 结构规则
    inputtags: {
      root: {
        paddingX: 'var(--cv-space-md)',
        paddingY: 'calc(var(--cv-space-md) * 2)',
        gap: 'var(--cv-space-xs)',
        borderRadius: 'var(--cv-radius-md)',
        focusRing: {
          width: '0',
          style: 'none',
          color: 'transparent',
          offset: '0',
          shadow: 'none',
        },
      },
      item: {
        borderRadius: 'var(--cv-radius-full)',
      },
    },
    // Chip：非颜色尺寸走 root；颜色走 colorScheme 覆盖 Aura light-dark(surface) 灰阶
    // design token 无 border*；描边结构见 bridge `.cv-prime-chip` / `.cv-prime-inputtags-chip`
    // removeIcon.focusRing 清零对齐全局表单控件
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
    // Select：root 颜色全量继承 form.field；此处只补 dropdown / overlay / option 结构尺寸
    // focusRing 显式清零 → 官方 .p-select.p-focus 的 outline/box-shadow 走 select.focus.ring.*
    // 内嵌 input.p-select-label 的 ST input:focus-visible 不在 token 范围，见 pt 锚点 + host-resets
    // 颜色仍走 semantic.formField + bridge 中 --p-overlay-select / --p-list-option / --p-select-*
    select: {
      root: {
        focusRing: {
          width: '0',
          style: 'none',
          color: 'transparent',
          offset: '0',
          shadow: 'none',
        },
      },
      dropdown: {
        width: '2.5em',
      },
      overlay: {
        borderRadius: 'var(--cv-radius-lg)',
      },
      option: {
        borderRadius: 'var(--cv-radius-md)',
      },
      checkmark: {
        gutterStart: '-0.375em',
        gutterEnd: '0.375em',
      },
    },
    // Button：结构尺寸走 root；颜色走 colorScheme 覆盖 Aura surface 灰阶
    // 默认圆角 --cv-radius（0.5em，非 pill）；rounded 变体走 roundedBorderRadius full
    // focusRing 清零对齐全局表单；primary solid/text/outlined 继续继承 Aura primary 语义
    // secondary 实心/描边/文字改 cv surface；outlined secondary 边框对齐 form.field
    // CvMiniButton 紧凑变体用局部 :dt（getMiniButtonRootTokens），不污染全局
    button: {
      root: {
        borderRadius: 'var(--cv-radius)',
        roundedBorderRadius: 'var(--cv-radius-full)',
        gap: '0.5em',
        iconOnlyWidth: '2.5em',
        badgeSize: '1em',
        focusRing: {
          width: '0',
          style: 'none',
          offset: '0',
        },
        sm: { iconOnlyWidth: '2em' },
        lg: { iconOnlyWidth: '3em' },
      },
      colorScheme: {
        light: {
          root: { secondary: buttonSecondarySolid },
          outlined: { secondary: buttonOutlinedSecondary },
          text: { secondary: buttonTextSecondary },
        },
        dark: {
          root: { secondary: buttonSecondarySolid },
          outlined: { secondary: buttonOutlinedSecondary },
          text: { secondary: buttonTextSecondary },
        },
      },
    },
    multiselect: {
      root: {
        paddingX: 'var(--p-form-field-padding-x)',
        paddingY: 'var(--p-form-field-padding-y)',
      },
    },
    // Checkbox：非颜色尺寸走 root；颜色走 colorScheme（覆盖 Aura primary solid / form.field 引用）
    // PT 锚点 + st-host-resets 反压 ST 对 input[type=checkbox] 的尺寸/伪元素污染
    // width/height/icon.size 沿用 Aura 默认，不在此硬改
    checkbox: {
      root: {
        borderRadius: 'var(--cv-radius-sm)',
      },
      colorScheme: {
        light: checkboxColorLight,
        dark: checkboxColorDark,
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
    // Slider：非颜色尺寸走 root；颜色走 colorScheme（覆盖 Aura content.border / primary / surface 灰阶）
    // range 空对象阻止继承 Aura root 层 range.background 与 colorScheme 冲突
    // handle 无 border token；外圈描边仍见 fallbacks 中 .cv-prime-slider-handle
    // focusRing 清零对齐表单控件（全局不画外圈）
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
          width: '0',
          style: 'none',
          color: 'transparent',
          offset: '0',
          shadow: 'none',
        },
      },
      colorScheme: {
        light: sliderColor,
        dark: sliderColor,
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
    // ToggleSwitch：非颜色尺寸走 root/handle；颜色走 colorScheme（覆盖 Aura surface/primary solid）
    // PT 锚点 + st-host-resets 反压 ST 对 input[type=checkbox] 的 margin/transform/::before
    // 业务紧凑变体用局部 :dt 覆盖 width/height/handle.size（见账号列表 / 人物条目）
    toggleswitch: {
      root: {
        width: '2.5em',
        height: '1.5em',
        borderRadius: 'var(--cv-radius-full)',
        gap: '0.25em',
        borderWidth: '1px',
        shadow: 'none',
      },
      handle: {
        size: '1em',
        borderRadius: '50%',
      },
      colorScheme: {
        light: toggleSwitchColorLight,
        dark: toggleSwitchColorDark,
      },
    },
    // ToggleButton：尺寸与结构走 root/content/sm；颜色走 colorScheme.light/dark
    togglebutton: {
      root: {
        padding: '0',
        borderRadius: 'var(--cv-radius-full)',
        gap: 'var(--cv-space-xs)',
        fontWeight: '500',
        transitionDuration: '0.15s',
        focusRing: {
          width: '0',
          style: 'none',
          color: 'transparent',
          offset: '0',
          shadow: 'none',
        },
        sm: {
          fontSize: 'var(--cv-font-size-2xs)',
          padding: '0',
        },
      },
      content: {
        padding: 'var(--cv-space-3xl) var(--cv-space-lg)',
        borderRadius: 'var(--cv-radius-full)',
        checkedShadow: 'none',
        sm: {
          padding: 'var(--cv-space-xs) var(--cv-space-md)',
        },
      },
      colorScheme: {
        light: toggleButtonColorLight,
        dark: toggleButtonColorDark,
      },
    },
    // SelectButton：仅 root 容器 token；子项视觉走 togglebutton + pcToggleButton
    // Aura 默认是连体 segmented，本项目用独立 pill + gap（bridge 覆盖硬编码边框）
    selectbutton: {
      root: {
        borderRadius: 'var(--cv-radius-full)',
      },
      colorScheme: {
        light: {
          root: {
            invalidBorderColor: 'var(--p-red-500)',
          },
        },
        dark: {
          root: {
            invalidBorderColor: 'var(--p-red-500)',
          },
        },
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
    // Dialog：非颜色尺寸走 root；颜色走 colorScheme（覆盖 Aura overlay.modal surface 灰阶）
    // padding 对齐确认框默认（header 顶+侧 / content 全侧 / footer 底+侧）
    // 设置主壳 Dialog 用 contentStyle padding:0 覆盖；showHeader=false 不读 header padding
    // PT 锚点见 primevue-pt dialog.*；Teleport 根 class 含 cosmos-vision-root
    dialog: {
      root: {
        borderRadius: 'var(--cv-radius-lg)',
      },
      header: {
        gap: 'var(--cv-space-md)',
        padding: 'var(--cv-space-7xl) var(--cv-space-7xl) 0',
      },
      title: {
        fontSize: 'var(--cv-font-size-2xl)',
        fontWeight: '600',
      },
      content: {
        padding: 'var(--cv-space-5xl) var(--cv-space-7xl)',
      },
      footer: {
        gap: 'var(--cv-space-md)',
        padding: '0 var(--cv-space-7xl) var(--cv-space-7xl)',
      },
      colorScheme: {
        light: dialogColor,
        dark: dialogColor,
      },
    },
    // Popover：非颜色 gutter/radius/content.padding 走 root；颜色走 colorScheme
    // 业务紧凑变体（宏插入/绑定）可用局部 :dt 覆盖 padding/gutter
    // PT root 必须带 cosmos-vision-root（Teleport 到 body）
    popover: {
      root: {
        borderRadius: 'var(--cv-radius)',
        gutter: 'var(--cv-space-xs)',
        arrowOffset: '1.125rem',
      },
      content: {
        padding: 'var(--cv-space-sm)',
      },
      colorScheme: {
        light: popoverColor,
        dark: popoverColor,
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


