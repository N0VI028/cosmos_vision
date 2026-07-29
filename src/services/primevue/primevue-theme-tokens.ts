/**
 * PrimeVue 主题共享颜色与 semantic token
 * 仅结构拆分；不改变 token key / 取值 / 覆盖集合
 */

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
  invalidBorderColor: 'var(--cvp-red-500)',
  color: 'var(--cv-on-surface)',
  disabledColor: 'var(--cv-on-surface-variant)',
  placeholderColor: 'var(--cv-on-surface-variant)',
  invalidPlaceholderColor: 'color-mix(in srgb, var(--cvp-red-500) 75%, var(--cv-on-surface-variant))',
  iconColor: 'var(--cv-on-surface-variant)',
  shadow: 'none',
} as const;

/**
 * 浅色：禁用底比正常 field 更浅（surface 上极淡叠字色）
 * 注意：ST 的 input:disabled { filter:brightness(0.5) } 会单独压暗，必须在 host-resets 清掉
 */
export const formFieldColorLight = {
  ...formFieldColorBase,
  disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  disabledColor: 'color-mix(in srgb, var(--cv-on-surface-variant) 70%, var(--cv-surface))',
} as const;

/** 深色：保留半透明叠底，与暗表面对比适中 */
export const formFieldColorDark = {
  ...formFieldColorBase,
  disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
} as const;

/**
 * Chip 颜色 token —— light/dark 共用
 * 主色半透明底 + 主色文字；覆盖 Aura light-dark(surface.*) 灰阶
 * 无 border token，描边见 bridge 结构规则
 */
export const chipColor = {
  root: {
    background: 'color-mix(in srgb, var(--cvp-primary-color) 12%, transparent)',
    focusBackground: 'color-mix(in srgb, var(--cvp-primary-color) 18%, transparent)',
    color: 'var(--cvp-primary-color)',
  },
  icon: {
    color: 'var(--cvp-primary-color)',
  },
  removeIcon: {
    color: 'var(--cvp-primary-color)',
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
export const sliderColor = {
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
export const toggleButtonColorLight = {
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

export const toggleButtonColorDark = {
  ...toggleButtonColorLight,
  root: {
    ...toggleButtonColorLight.root,
    disabledBackground: 'var(--cv-surface-container-high)',
  },
} as const;

/**
 * ToggleSwitch 颜色 token 基线 —— light/dark 共用结构（禁用底与关闭态对比度分端）
 * 显式挂 colorScheme 两端，避免 Aura light-dark/surface 灰阶覆盖 cv 自适应变量
 * 选中轨道用 primary-container，手柄用 on-primary-container，对齐 Checkbox 容器色语义
 */
const toggleSwitchColorBase = {
  root: {
    checkedBackground: 'var(--cv-primary-container)',
    checkedHoverBackground: 'var(--cv-primary-container)',
    checkedBorderColor: 'transparent',
    checkedHoverBorderColor: 'transparent',
    invalidBorderColor: 'var(--cvp-red-500)',
    shadow: 'none',
  },
  handle: {
    checkedBackground: 'var(--cv-on-primary-container)',
    checkedHoverBackground: 'var(--cv-on-primary-container)',
    color: 'var(--cv-on-surface-variant)',
    hoverColor: 'var(--cv-on-surface)',
    checkedColor: 'var(--cv-primary-container)',
    checkedHoverColor: 'var(--cv-primary-container)',
  },
} as const;

/**
 * 浅色 ToggleSwitch
 */
export const toggleSwitchColorLight = {
  root: {
    ...toggleSwitchColorBase.root,
    background: 'var(--cv-surface-container-high)',
    hoverBackground: 'var(--cv-surface-container)',
    borderColor: 'transparent',
    hoverBorderColor: 'transparent',
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  },
  handle: {
    ...toggleSwitchColorBase.handle,
    background: 'var(--cv-surface-container-lowest)',
    hoverBackground: 'var(--cv-surface-container-lowest)',
    disabledBackground: 'var(--cv-surface-container-lowest)',
  },
} as const;

/**
 * 深色 ToggleSwitch
 */
export const toggleSwitchColorDark = {
  root: {
    ...toggleSwitchColorBase.root,
    background: 'var(--cv-surface-variant)',
    hoverBackground: 'color-mix(in srgb, var(--cv-on-surface) 18%, var(--cv-surface-variant))',
    borderColor: 'transparent',
    hoverBorderColor: 'transparent',
    disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
  },
  handle: {
    ...toggleSwitchColorBase.handle,
    background: 'color-mix(in srgb, var(--cv-on-surface) 78%, var(--cv-surface))',
    hoverBackground: 'color-mix(in srgb, var(--cv-on-surface) 88%, var(--cv-surface))',
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 40%, var(--cv-surface))',
  },
} as const;

/**
 * InputNumber 步进按钮颜色 —— light/dark 共用自适应 cv 变量
 * 覆盖 Aura surface 灰阶，避免深色回退浅灰；内嵌 input 仍走 formField / InputText
 */
export const inputNumberButtonColor = {
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
export const buttonSecondarySolid = {
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
export const buttonOutlinedSecondary = {
  hoverBackground: 'color-mix(in srgb, var(--cv-surface-variant) 50%, transparent)',
  activeBackground: 'color-mix(in srgb, var(--cv-surface-variant) 70%, transparent)',
  borderColor: 'var(--cv-surface-variant)',
  color: 'var(--cv-on-surface-variant)',
} as const;

/**
 * Button text.secondary —— 中性字色 + 半透明 hover 底
 */
export const buttonTextSecondary = {
  hoverBackground: 'color-mix(in srgb, var(--cv-surface-variant) 50%, transparent)',
  activeBackground: 'color-mix(in srgb, var(--cv-surface-variant) 70%, transparent)',
  color: 'var(--cv-on-surface-variant)',
} as const;

/**
 * Password 颜色 token —— light/dark 共用
 * 内嵌 pcInputText 继承 formField；此处只管 meter / icon / strength-overlay
 */
export const passwordColor = {
  meter: { background: 'var(--cv-surface-variant)' },
  icon: { color: 'var(--cv-on-surface-variant)' },
  overlay: {
    background: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface)',
    shadow: 'var(--cv-popover-shadow)',
  },
  strength: {
    weakBackground: 'var(--cvp-red-500)',
    mediumBackground: 'var(--cvp-amber-500)',
    strongBackground: 'var(--cvp-green-500)',
  },
} as const;

/**
 * Dialog 颜色 token —— light/dark 共用
 * Aura 默认映射 overlay.modal.*（surface 灰阶）；本项目改 cv surface/floating
 * 非颜色尺寸（radius/header.gap/title/padding）走 components.dialog root 段
 */
export const dialogColor = {
  root: {
    background: 'var(--cv-surface-container-lowest)',
    borderColor: 'transparent',
    color: 'var(--cv-on-surface)',
    shadow: 'var(--cv-floating-shadow)',
  },
} as const;

/**
 * Message 单 severity 颜色 —— light/dark 共用
 * shadow 清零；closeButton focusRing 清零（对齐全局无外圈）
 * @param tone 半透明叠底的色阶变量（如 --cvp-blue-500）
 * @param text 文字/图标色
 */
function messageSeverity(tone: string, text: string) {
  return {
    background: `color-mix(in srgb, ${tone} 14%, var(--cv-surface-container-high))`,
    borderColor: `color-mix(in srgb, ${tone} 32%, transparent)`,
    color: text,
    shadow: 'none',
    closeButton: {
      hoverBackground: `color-mix(in srgb, ${tone} 18%, transparent)`,
      focusRing: { color: 'transparent', shadow: 'none' },
    },
    outlined: { color: text, borderColor: text },
    simple: { color: text },
  } as const;
}

/**
 * Message severity 色板 —— 覆盖 Aura light-dark(blue/green/…) 与 surface 灰阶
 * secondary 走 cv surface（inline running 状态默认 severity）；其余走 p-* 色阶
 */
export const messageColor = {
  info: messageSeverity('var(--cvp-blue-500)', 'var(--cvp-blue-600)'),
  success: messageSeverity('var(--cvp-green-500)', 'var(--cvp-green-600)'),
  warn: messageSeverity('var(--cvp-yellow-500)', 'var(--cvp-yellow-600)'),
  error: messageSeverity('var(--cvp-red-500)', 'var(--cvp-red-600)'),
  secondary: {
    background: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface-variant)',
    shadow: 'none',
    closeButton: {
      hoverBackground: 'var(--cv-surface-variant)',
      focusRing: { color: 'transparent', shadow: 'none' },
    },
    outlined: {
      color: 'var(--cv-on-surface-variant)',
      borderColor: 'var(--cv-surface-variant)',
    },
    simple: { color: 'var(--cv-on-surface-variant)' },
  },
  contrast: {
    background: 'var(--cv-on-surface)',
    borderColor: 'var(--cv-on-surface)',
    color: 'var(--cv-surface)',
    shadow: 'none',
    closeButton: {
      hoverBackground: 'color-mix(in srgb, var(--cv-surface) 14%, transparent)',
      focusRing: { color: 'transparent', shadow: 'none' },
    },
    outlined: {
      color: 'var(--cv-on-surface)',
      borderColor: 'var(--cv-on-surface)',
    },
    simple: { color: 'var(--cv-on-surface)' },
  },
} as const;

/**
 * ProgressSpinner 四段色 —— light/dark 共用
 * 覆盖 Aura red/blue/green/yellow 彩虹；统一主色语义
 */
export const progressSpinnerColor = {
  root: {
    colorOne: 'var(--cv-primary-container)',
    colorTwo: 'var(--cvp-primary-color)',
    colorThree: 'var(--cv-primary-container)',
    colorFour: 'var(--cvp-primary-color)',
  },
} as const;

/**
 * Skeleton 颜色 —— light/dark 共用
 * 覆盖 Aura surface.200 / 半透明白；底与扫光对齐 cv surface 容器阶
 */
export const skeletonColor = {
  root: {
    background: 'var(--cv-surface-container-high)',
    animationBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 68%, var(--cv-surface-container))',
  },
} as const;

/**
 * Tag severity 色 —— light/dark 共用
 * primary 实心主色（版本号徽章）；其余半透明 tone 叠 surface，覆盖 Aura surface/primary 灰阶
 */
export const tagColor = {
  primary: {
    background: 'var(--cvp-primary-color)',
    color: 'var(--cvp-primary-contrast-color)',
  },
  secondary: {
    background: 'var(--cv-surface-container-high)',
    color: 'var(--cv-on-surface-variant)',
  },
  success: {
    background: 'color-mix(in srgb, var(--cvp-green-500) 16%, var(--cv-surface-container-high))',
    color: 'var(--cvp-green-600)',
  },
  info: {
    background: 'color-mix(in srgb, var(--cvp-blue-500) 16%, var(--cv-surface-container-high))',
    color: 'var(--cvp-blue-600)',
  },
  warn: {
    background: 'color-mix(in srgb, var(--cvp-yellow-500) 16%, var(--cv-surface-container-high))',
    color: 'var(--cvp-yellow-600)',
  },
  danger: {
    background: 'color-mix(in srgb, var(--cvp-red-500) 16%, var(--cv-surface-container-high))',
    color: 'var(--cvp-red-600)',
  },
  contrast: {
    background: 'var(--cv-on-surface)',
    color: 'var(--cv-surface)',
  },
} as const;

/**
 * Card 颜色 —— light/dark 共用
 * 默认表面对齐数据卡；包装组件 CvDataCard 仍可用局部 :dt 覆盖
 */
export const cardColor = {
  root: {
    background: 'var(--cv-surface-container-low)',
    color: 'var(--cv-on-surface)',
    shadow: 'none',
  },
  subtitle: {
    color: 'var(--cv-on-surface-variant)',
  },
} as const;

/**
 * Galleria 导航/缩略图色 —— light/dark 共用
 * 覆盖 Aura 半透明白/surface 灰阶；inline 画廊业务布局仍在 inline-image.css
 */
export const galleriaColor = {
  root: {
    borderColor: 'transparent',
  },
  navButton: {
    background: 'color-mix(in srgb, var(--cv-surface-container-high) 72%, transparent)',
    hoverBackground: 'var(--cv-surface-container-high)',
    color: 'var(--cv-on-surface)',
    hoverColor: 'var(--cv-on-surface)',
    focusRing: {
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'none',
    },
  },
  thumbnailsContent: {
    background: 'var(--cv-surface-container-low)',
  },
  thumbnailNavButton: {
    hoverBackground: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface-variant)',
    hoverColor: 'var(--cv-on-surface)',
    focusRing: {
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'none',
    },
  },
  caption: {
    background: 'color-mix(in srgb, var(--cv-surface) 55%, transparent)',
    color: 'var(--cv-on-surface)',
  },
  indicatorButton: {
    background: 'var(--cv-surface-variant)',
    hoverBackground: 'var(--cv-outline)',
    activeBackground: 'var(--cvp-primary-color)',
    focusRing: {
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'none',
    },
  },
  closeButton: {
    background: 'color-mix(in srgb, var(--cv-surface-container-high) 72%, transparent)',
    hoverBackground: 'var(--cv-surface-container-high)',
    color: 'var(--cv-on-surface)',
    hoverColor: 'var(--cv-on-surface)',
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
 * FileUpload 颜色 —— light/dark 共用
 * 对齐 WD Tagger 上传区局部 :dt；header 透明，内容高亮主色
 */
export const fileUploadColor = {
  root: {
    background: 'var(--cv-surface-container-low)',
    borderColor: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface)',
  },
  header: {
    background: 'transparent',
    color: 'var(--cv-on-surface)',
    borderColor: 'transparent',
  },
  content: {
    highlightBorderColor: 'var(--cvp-primary-color)',
  },
  file: {
    borderColor: 'var(--cv-surface-variant)',
  },
  fileName: {
    color: 'var(--cv-on-surface)',
  },
  fileSize: {
    color: 'var(--cv-on-surface-variant)',
  },
} as const;

/**
 * Accordion 颜色 —— light/dark 共用
 * 全局透明壳：边框/底色由 CollapsiblePanelItem / TriggerEditor 业务壳承担
 */
export const accordionColor = {
  panel: {
    borderColor: 'transparent',
  },
  header: {
    color: 'var(--cv-on-surface)',
    hoverColor: 'var(--cv-on-surface)',
    activeColor: 'var(--cv-on-surface)',
    activeHoverColor: 'var(--cv-on-surface)',
    background: 'transparent',
    hoverBackground: 'transparent',
    activeBackground: 'transparent',
    activeHoverBackground: 'transparent',
    borderColor: 'transparent',
    toggleIcon: {
      color: 'var(--cv-on-surface-variant)',
      hoverColor: 'var(--cv-on-surface)',
      activeColor: 'var(--cv-on-surface-variant)',
      activeHoverColor: 'var(--cv-on-surface)',
    },
  },
  content: {
    background: 'transparent',
    borderColor: 'transparent',
    color: 'var(--cv-on-surface)',
  },
} as const;

/**
 * Divider 颜色 —— light/dark 共用
 * 线色 surface-variant；content 字色 on-surface
 */
export const dividerColor = {
  root: {
    borderColor: 'var(--cv-surface-variant)',
  },
  content: {
    background: 'var(--cv-surface-container)',
    color: 'var(--cv-on-surface)',
  },
} as const;

/**
 * Popover 颜色 token —— light/dark 共用
 * Aura 默认映射 overlay.popover.*；本项目对齐 surface-container-high + popover-shadow
 * gutter/arrowOffset/content.padding 等非颜色走 components.popover root 段
 */
export const popoverColor = {
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
    invalidBorderColor: 'var(--cvp-red-500)',
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
export const checkboxColorLight = {
  root: {
    ...checkboxColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-on-surface) 8%, var(--cv-surface))',
  },
  icon: checkboxColorBase.icon,
} as const;

/** 深色 Checkbox：半透明叠底 */
export const checkboxColorDark = {
  root: {
    ...checkboxColorBase.root,
    disabledBackground: 'color-mix(in srgb, var(--cv-surface-container-high) 70%, transparent)',
  },
  icon: checkboxColorBase.icon,
} as const;

/**
 * semantic text —— 覆盖 Aura light-dark(surface) 字色
 * light/dark 共用 cv 自适应变量
 */
const semanticTextColor = {
  color: 'var(--cv-on-surface)',
  hoverColor: 'var(--cv-on-surface)',
  mutedColor: 'var(--cv-on-surface-variant)',
  hoverMutedColor: 'var(--cv-on-surface)',
} as const;

/**
 * semantic content —— 通用内容面
 */
const semanticContentColor = {
  background: 'var(--cv-surface-container)',
  hoverBackground: 'var(--cv-surface-container-high)',
  borderColor: 'var(--cv-surface-variant)',
  color: 'var(--cv-on-surface)',
  hoverColor: 'var(--cv-on-surface)',
} as const;

/**
 * semantic list.option —— Select 等下拉选项
 * 选中态用 primary-container 半透明，覆盖 Aura highlight/surface
 */
const semanticListOptionColor = {
  focusBackground: 'var(--cv-surface-variant)',
  selectedBackground: 'color-mix(in srgb, var(--cv-primary-container) 18%, transparent)',
  selectedFocusBackground: 'color-mix(in srgb, var(--cv-primary-container) 26%, transparent)',
  color: 'var(--cv-on-surface)',
  focusColor: 'var(--cv-on-surface)',
  selectedColor: 'var(--cv-on-surface)',
  selectedFocusColor: 'var(--cv-on-surface)',
} as const;

const semanticListOptionGroupColor = {
  background: 'var(--cv-surface-container-high)',
  color: 'var(--cv-on-surface-variant)',
} as const;

/**
 * semantic overlay.select / popover / modal 颜色
 * Select.overlay 映射 {overlay.select.*}；Dialog/Popover 亦读 modal/popover
 */
const semanticOverlaySelectColor = {
  background: 'var(--cv-surface-container-high)',
  borderColor: 'var(--cv-surface-variant)',
  color: 'var(--cv-on-surface)',
  shadow: 'var(--cv-popover-shadow)',
} as const;

const semanticOverlayPopoverColor = {
  background: 'var(--cv-surface-container-high)',
  borderColor: 'var(--cv-outline)',
  color: 'var(--cv-on-surface)',
  shadow: 'var(--cv-popover-shadow)',
} as const;

const semanticOverlayModalColor = {
  background: 'var(--cv-surface-container-lowest)',
  borderColor: 'transparent',
  color: 'var(--cv-on-surface)',
  shadow: 'var(--cv-floating-shadow)',
} as const;

/**
 * semantic.colorScheme 共用块（formField 除外：浅/深禁用底不同）
 * 官方：颜色类 token 挂 colorScheme.light/dark，配合 darkModeSelector
 */
export const semanticSharedColorScheme = {
  text: semanticTextColor,
  content: semanticContentColor,
  list: {
    option: semanticListOptionColor,
    optionGroup: semanticListOptionGroupColor,
  },
  overlay: {
    select: semanticOverlaySelectColor,
    popover: semanticOverlayPopoverColor,
    modal: semanticOverlayModalColor,
  },
} as const;
