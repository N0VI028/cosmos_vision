import type { PrimeVuePTOptions } from 'primevue/config';
import type { InputTagsPassThroughOptions } from 'primevue/inputtags';

/**
 * 锚点收紧约定：只保留有消费方的语义锚点与功能性 class。
 * 消费方 = bridge / host-resets / inline-*.css / 业务组件 / theme css 扩展。
 * 功能性 = Teleport 根 cosmos-vision-root、mask 布局工具类。
 * 新增内部节点样式时按需补锚点，不预留。
 */
const fieldRoot = { class: 'cv-prime-field' } as const;
const buttonRoot = { class: 'cv-prime-button' } as const;
const icon = { class: 'cv-prime-icon' } as const;
const iconButton = { class: 'cv-prime-icon-button' } as const;
const option = { class: 'cv-select-option' } as const;
/** Teleport overlay 根：必须带 cosmos-vision-root 才能读到 cv token / darkModeSelector */
const overlay = { class: 'cosmos-vision-root' } as const;
/** Dialog mask：绝对铺满 + 居中；与官方 inlineStyles 叠加以保证 ST 宿主下定位稳定 */
const dialogMask = { class: 'cv-dialog-mask absolute! flex h-dvh w-dvw items-center justify-center' } as const;
/** Checkbox 勾选：语义锚点供 host-resets 反压 ST input[type=checkbox] */
const checkInputClass = 'cv-prime-check-input' as const;
const toggleButtonIcon = { class: 'cv-prime-icon cv-prime-togglebutton-icon' } as const;
/** SelectButton 内嵌 ToggleButton：与独立 togglebutton PT 节点对齐 */
const selectButtonToggle = {
  root: { class: 'cv-prime-togglebutton' },
  content: { class: 'cv-prime-togglebutton-content' },
  icon: toggleButtonIcon,
  label: { class: 'cv-prime-togglebutton-label' },
} as const;
/** Slider 手柄：单/双柄共用语义锚点；外圈描边走 preset slider.css 扩展（token 无 handle.border） */
const sliderHandle = {
  class: 'cv-prime-slider-handle',
} as const;

/**
 * InputTags Pass Through 集中配置
 * pcChip 锚点供 bridge 补 chip 结构；pcInputText 锚点供 host-resets 反压内嵌 input
 * pcAutoComplete.overlay 必须带 cosmos-vision-root（typeahead Teleport）
 */
const cosmosInputTagsPt = {
  root: { class: 'cv-prime-inputtags' },
  pcChip: {
    root: { class: 'cv-prime-inputtags-chip' },
    label: { class: 'cv-prime-inputtags-chip-label' },
    removeIcon: { class: 'cv-prime-inputtags-chip-remove' },
  },
  pcAutoComplete: {
    pcInputText: { root: { class: 'cv-prime-inputtags-input-field' } },
    overlay,
  },
} satisfies InputTagsPassThroughOptions;

/**
 * PrimeVue 全局 PT 配置类型
 * InputTags 已存在组件 API，但当前 PrimeVuePTOptions 尚未收录，故做交叉扩展
 */
type CosmosPrimePt = PrimeVuePTOptions & {
  inputtags?: InputTagsPassThroughOptions;
};

/**
 * PrimeVue Pass Through 集中配置
 * Card / FileUpload / Accordion / Divider / Tag / ProgressSpinner / Skeleton / Fluid
 * 等组件在用但内部节点无样式消费方，不注入锚点；需要时再补
 */
export const cosmosPrimePt = {
  // Dialog：mask 布局 + root Teleport 主题根（含 overflow 裁剪）
  dialog: {
    mask: dialogMask,
    root: { class: 'cosmos-vision-root overflow-hidden' },
  },
  inputtext: { root: fieldRoot },
  // Galleria：inline 收藏画廊布局锚点（导航/缩略图不经 Galleria 渲染，见 inlineImageGalleryView）
  galleria: {
    root: { class: 'cv-prime-galleria' },
    content: { class: 'cv-prime-galleria-content' },
    itemsContainer: { class: 'cv-prime-galleria-items-container' },
    item: { class: 'cv-prime-galleria-item' },
  },
  textarea: { root: { class: 'cv-prime-field cv-prime-textarea' } },
  select: {
    root: fieldRoot,
    // label 在 editable 等模式下是 input；锚点供 host-resets 清 ST input:focus-visible outline
    label: { class: 'cv-prime-field-text cv-prime-select-label' },
    dropdown: { class: 'cv-prime-select-dropdown' },
    dropdownIcon: icon,
    clearIcon: icon,
    loadingIcon: icon,
    overlay,
    option,
  },
  // Chip：锚点供 bridge 补描边结构（token 无 border*）
  chip: {
    root: { class: 'cv-prime-chip' },
    label: { class: 'cv-prime-chip-label' },
    removeIcon: { class: 'cv-prime-chip-remove-icon' },
  },
  inputtags: cosmosInputTagsPt,
  checkbox: {
    root: { class: 'cv-prime-checkbox' },
    input: { class: `${checkInputClass} cv-prime-checkbox-input` },
    box: { class: 'cv-prime-checkbox-box' },
    indicator: { class: 'cv-prime-checkbox-indicator' },
    icon: { class: 'cv-prime-checkbox-icon' },
  },
  // Popover：root 必须 cosmos-vision-root（Teleport 到 body）
  popover: { root: overlay },
  password: {
    pcInputText: { root: fieldRoot },
    maskIcon: icon,
    unmaskIcon: icon,
    clearIcon: icon,
    overlay,
  },
  inputnumber: {
    pcInputText: { root: fieldRoot },
    incrementButton: iconButton,
    incrementIcon: icon,
    decrementButton: iconButton,
    decrementIcon: icon,
    clearIcon: icon,
  },
  button: { root: buttonRoot, icon, loadingIcon: icon, label: { class: 'cv-prime-button-label' } },
  // Message：inline running 变体消费 root/content/text
  message: {
    root: { class: 'cv-prime-message' },
    content: { class: 'cv-prime-message-content' },
    text: { class: 'cv-prime-message-text' },
  },
  selectbutton: { root: { class: 'cv-prime-selectbutton' }, pcToggleButton: selectButtonToggle },
  togglebutton: selectButtonToggle,
  slider: {
    handle: sliderHandle,
    startHandler: sliderHandle,
    endHandler: sliderHandle,
  },
  toggleswitch: {
    input: { class: `${checkInputClass} cv-prime-toggleswitch-input` },
    slider: { class: 'cv-prime-toggleswitch-slider' },
    handle: { class: 'cv-prime-toggleswitch-handle' },
  },
} satisfies CosmosPrimePt;
