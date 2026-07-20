import type { PrimeVuePTOptions } from 'primevue/config';
import type { InputTagsPassThroughOptions } from 'primevue/inputtags';

const fieldRoot = { class: 'cv-prime-field' } as const;
const buttonRoot = { class: 'cv-prime-button' } as const;
const icon = { class: 'cv-prime-icon' } as const;
const iconButton = { class: 'cv-prime-icon-button' } as const;
const option = { class: 'cv-select-option' } as const;
const overlay = { class: 'cosmos-vision-root' } as const;
const dialogMask = { class: 'cv-dialog-mask absolute! flex h-dvh w-dvw items-center justify-center' } as const;
const fieldOverlay = { class: 'cosmos-vision-root cv-prime-field-overlay' } as const;
const checkInputClass = 'cv-prime-check-input' as const;
const checkbox = {
  root: { class: 'cv-prime-checkbox' },
  input: { class: `${checkInputClass} cv-prime-checkbox-input` },
  box: { class: 'cv-prime-checkbox-box' },
  icon: { class: 'cv-prime-checkbox-icon' },
} as const;
const selectButtonRoot = {
  class: 'cv-prime-selectbutton',
} as const;
const selectButtonToggle = {
  root: {
    class: 'cv-prime-togglebutton',
  },
  content: {
    class: 'cv-prime-togglebutton-content',
  },
} as const;
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
const chip = {
  root: { class: 'cv-prime-chip' },
  label: { class: 'cv-prime-chip-label' },
  removeIcon: { class: 'cv-prime-chip-remove-icon' },
} as const;

/**
 * InputTags Pass Through 集中配置
 * 仅注入语义类锚点；视觉走 definePreset / bridge token
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
  dialog: {
    mask: dialogMask,
    root: { class: 'cosmos-vision-root cv-dialog overflow-hidden' },
  },
  image: { previewMask: imagePreviewMask },
  inputtext: { root: fieldRoot },
  galleria,
  textarea: { root: { class: 'cv-prime-field cv-prime-textarea' } },
  select: {
    root: fieldRoot,
    label: { class: 'cv-prime-field-text' },
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
  fluid: { root: { class: 'cv-prime-fluid' } },
  popover: { root: overlay },
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
    icon,
    label: { class: 'cv-prime-togglebutton-label' },
  },
  slider: {
    root: { class: 'cv-prime-slider' },
    range: { class: 'cv-prime-slider-range' },
    handle: sliderHandle,
    startHandler: sliderHandle,
    endHandler: sliderHandle,
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
