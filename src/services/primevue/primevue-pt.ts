import type { PrimeVuePTOptions } from 'primevue/config';
import type { InputTagsPassThroughOptions } from 'primevue/inputtags';

const fieldRoot = { class: 'cv-prime-field' } as const;
const buttonRoot = { class: 'cv-prime-button' } as const;
const icon = { class: 'cv-prime-icon' } as const;
const iconButton = { class: 'cv-prime-icon-button' } as const;
const option = { class: 'cv-select-option' } as const;
const overlay = { class: 'cosmos-vision-root' } as const;
/** Dialog mask：绝对铺满 + 居中；与官方 inlineStyles 叠加以保证 ST 宿主下定位稳定 */
const dialogMask = { class: 'cv-dialog-mask absolute! flex h-dvh w-dvw items-center justify-center' } as const;
/** Dialog 根：Teleport 后必须带 cosmos-vision-root，才能读到 cv token / darkModeSelector */
const dialogRoot = { class: 'cosmos-vision-root cv-dialog overflow-hidden' } as const;
/** Dialog 语义子节点锚点：供业务/host 定位，避免依赖 .p-dialog-* */
const dialogHeader = { class: 'cv-dialog-header' } as const;
const dialogTitle = { class: 'cv-dialog-title' } as const;
const dialogHeaderActions = { class: 'cv-dialog-header-actions' } as const;
const dialogContent = { class: 'cv-dialog-content' } as const;
const dialogFooter = { class: 'cv-dialog-footer' } as const;
const fieldOverlay = { class: 'cosmos-vision-root cv-prime-field-overlay' } as const;
/** Popover 根：Teleport 到 body 时注入 cosmos-vision-root + 语义锚点 */
const popoverRoot = { class: 'cosmos-vision-root cv-prime-popover' } as const;
const popoverContent = { class: 'cv-prime-popover-content' } as const;
/** Checkbox / MultiSelect 内嵌勾选：语义锚点供 host-resets 反压 ST input[type=checkbox] */
const checkInputClass = 'cv-prime-check-input' as const;
const checkbox = {
  root: { class: 'cv-prime-checkbox' },
  input: { class: `${checkInputClass} cv-prime-checkbox-input` },
  box: { class: 'cv-prime-checkbox-box' },
  indicator: { class: 'cv-prime-checkbox-indicator' },
  icon: { class: 'cv-prime-checkbox-icon' },
} as const;
/** SelectButton 根：语义锚点；视觉走 definePreset + bridge 结构 */
const selectButtonRoot = {
  class: 'cv-prime-selectbutton',
} as const;
const toggleButtonIcon = { class: 'cv-prime-icon cv-prime-togglebutton-icon' } as const;
/** SelectButton 内嵌 ToggleButton：与独立 togglebutton PT 节点对齐 */
const selectButtonToggle = {
  root: { class: 'cv-prime-togglebutton' },
  content: { class: 'cv-prime-togglebutton-content' },
  icon: toggleButtonIcon,
  label: { class: 'cv-prime-togglebutton-label' },
} as const;
/** Slider 手柄：单/双柄共用锚点；边框兜底见 fallbacks（token 无 handle.border） */
const sliderHandle = {
  class: 'cv-prime-slider-handle',
} as const;
const tag = {
  root: { class: 'cv-prime-tag' },
  icon: { class: 'cv-prime-tag-icon' },
  label: { class: 'cv-prime-tag-label' },
} as const;
const imagePreviewMask = {
  class: 'cv-prime-image-preview-mask',
} as const;
const progressSpinner = {
  root: { class: 'cv-prime-progress-spinner' },
  spin: { class: 'cv-prime-progress-spinner-spin' },
  circle: { class: 'cv-prime-progress-spinner-circle' },
} as const;
const panelHeader = {
  class: 'cv-prime-panel-header',
} as const;
const panelContent = {
  class: 'cv-prime-panel-content',
} as const;
const galleriaNavButton = {
  class: 'cv-prime-galleria-nav-button',
} as const;
const galleriaNavIcon = {
  class: 'cv-prime-galleria-nav-icon',
} as const;
const galleria = {
  root: { class: 'cv-prime-galleria' },
  content: { class: 'cv-prime-galleria-content' },
  itemsContainer: { class: 'cv-prime-galleria-items-container' },
  items: { class: 'cv-prime-galleria-items' },
  prevButton: galleriaNavButton,
  prevIcon: galleriaNavIcon,
  item: { class: 'cv-prime-galleria-item' },
  nextButton: galleriaNavButton,
  nextIcon: galleriaNavIcon,
  thumbnails: { class: 'cv-prime-galleria-thumbnails' },
  thumbnailContent: { class: 'cv-prime-galleria-thumbnail-content' },
  thumbnailPrevButton: galleriaNavButton,
  thumbnailPrevIcon: galleriaNavIcon,
  thumbnailsViewport: { class: 'cv-prime-galleria-thumbnails-viewport' },
  thumbnailItems: { class: 'cv-prime-galleria-thumbnail-items' },
  thumbnailItem: { class: 'cv-prime-galleria-thumbnail-item' },
  thumbnail: { class: 'cv-prime-galleria-thumbnail' },
  thumbnailNextButton: galleriaNavButton,
  thumbnailNextIcon: galleriaNavIcon,
} as const;
/** Chip 语义锚点：独立 Chip / MultiSelect pcChip 共用；InputTags 内嵌走 cosmosInputTagsPt.pcChip */
const chip = {
  root: { class: 'cv-prime-chip' },
  icon: { class: 'cv-prime-chip-icon' },
  label: { class: 'cv-prime-chip-label' },
  removeIcon: { class: 'cv-prime-chip-remove-icon' },
} as const;

/**
 * InputTags Pass Through 集中配置
 * 仅注入语义类锚点；视觉走 definePreset / bridge token
 * pcChip 与独立 chip 锚点分流，便于 InputTags 内嵌 chip 单独补结构
 * pcAutoComplete.overlay 必须带 cosmos-vision-root（typeahead Teleport）
 */
export const cosmosInputTagsPt = {
  root: { class: 'cv-prime-inputtags' },
  item: { class: 'cv-prime-inputtags-chip-item' },
  pcChip: {
    root: { class: 'cv-prime-inputtags-chip' },
    label: { class: 'cv-prime-inputtags-chip-label' },
    removeIcon: { class: 'cv-prime-inputtags-chip-remove' },
  },
  pcAutoComplete: {
    root: { class: 'cv-prime-inputtags-input' },
    input: { class: 'cv-prime-inputtags-input-item' },
    pcInputText: { root: { class: 'cv-prime-inputtags-input-field' } },
    overlay: fieldOverlay,
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
 */
export const cosmosPrimePt = {
  // Dialog：mask 布局 + root Teleport 主题根；子节点语义锚点替代 .p-dialog-*
  dialog: {
    mask: dialogMask,
    root: dialogRoot,
    header: dialogHeader,
    title: dialogTitle,
    headerActions: dialogHeaderActions,
    content: dialogContent,
    footer: dialogFooter,
  },
  image: { previewMask: imagePreviewMask },
  inputtext: { root: fieldRoot },
  galleria,
  textarea: { root: { class: 'cv-prime-field cv-prime-textarea' } },
  select: {
    root: fieldRoot,
    // label 在 editable 等模式下是 input；锚点供 host-resets 清 ST input:focus-visible outline
    label: { class: 'cv-prime-field-text cv-prime-select-label' },
    dropdown: { class: 'cv-prime-select-dropdown' },
    dropdownIcon: icon,
    clearIcon: icon,
    loadingIcon: icon,
    overlay: fieldOverlay,
    option,
  },
  multiselect: {
    root: fieldRoot,
    label: { class: 'cv-prime-field-text' },
    overlay: fieldOverlay,
    option,
    pcChip: chip,
    pcHeaderCheckbox: checkbox,
    pcOptionCheckbox: checkbox,
  },
  chip,
  inputtags: cosmosInputTagsPt,
  autocomplete: { overlay: fieldOverlay },
  checkbox,
  datepicker: { panel: overlay },
  // Fluid：无 design token；仅语义锚点。子控件通过 inject $fluid 自动 fluid，不靠 CSS 宽度
  fluid: { root: { class: 'cv-prime-fluid' } },
  // Popover：root 必须 cosmos-vision-root；content 语义锚点
  popover: { root: popoverRoot, content: popoverContent },
  confirmpopup: { root: overlay },
  tag,
  password: {
    root: { class: 'cv-prime-password' },
    pcInputText: { root: fieldRoot },
    maskIcon: icon,
    unmaskIcon: icon,
    clearIcon: icon,
    overlay,
  },
  inputnumber: {
    root: { class: 'cv-prime-inputnumber' },
    pcInputText: { root: fieldRoot },
    buttonGroup: { class: 'cv-prime-inputnumber-button-group' },
    incrementButton: iconButton,
    incrementIcon: icon,
    decrementButton: iconButton,
    decrementIcon: icon,
    clearIcon: icon,
  },
  button: { root: buttonRoot, icon, loadingIcon: icon, label: { class: 'cv-prime-button-label' } },
  panel: { root: { class: 'cv-prime-panel' }, header: panelHeader, content: panelContent },
  message: {
    root: { class: 'cv-prime-message' },
    contentWrapper: { class: 'cv-prime-message-content-wrapper' },
    content: { class: 'cv-prime-message-content' },
    icon: { class: 'cv-prime-message-icon' },
    text: { class: 'cv-prime-message-text' },
    closeButton: { class: 'cv-prime-icon-button cv-prime-message-close-button' },
    closeIcon: icon,
  },
  progressspinner: progressSpinner,
  selectbutton: { root: selectButtonRoot, pcToggleButton: selectButtonToggle },
  togglebutton: {
    root: { class: 'cv-prime-togglebutton' },
    content: { class: 'cv-prime-togglebutton-content' },
    icon: toggleButtonIcon,
    label: { class: 'cv-prime-togglebutton-label' },
  },
  slider: {
    root: { class: 'cv-prime-slider' },
    // track 在运行时 ptm('track') 可用，但 SliderPassThroughOptions 类型未声明 → 不写入
    range: { class: 'cv-prime-slider-range' },
    handle: sliderHandle,
    startHandler: sliderHandle,
    endHandler: sliderHandle,
    input: { class: 'cv-prime-slider-input' },
  },
  toggleswitch: {
    root: { class: 'cv-prime-toggleswitch' },
    input: { class: `${checkInputClass} cv-prime-toggleswitch-input` },
    slider: { class: 'cv-prime-toggleswitch-slider' },
    handle: { class: 'cv-prime-toggleswitch-handle' },
  },
  treetable: {
    root: { class: 'cv-prime-treetable' },
  },
} satisfies CosmosPrimePt;
