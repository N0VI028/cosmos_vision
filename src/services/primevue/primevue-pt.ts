import type { PrimeVuePTOptions } from 'primevue/config';

const fieldRoot = { class: 'cv-prime-field' } as const;
const buttonRoot = { class: 'cv-prime-button' } as const;
const icon = { class: 'cv-prime-icon' } as const;
const iconButton = { class: 'cv-prime-icon-button' } as const;
const option = { class: 'cv-select-option' } as const;
const overlay = { class: 'cosmos-vision-root' } as const;
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
  style: { display: 'flex', gap: 'var(--cv-space-lg)', width: '100%', boxShadow: 'none' },
} as const;
const selectButtonToggle = {
  root: {
    class: 'cv-prime-togglebutton',
    style: {
      flex: '1 1 0',
      minWidth: '0',
      padding: '0',
      fontFamily: 'var(--cv-font-label)',
      fontSize: 'calc(var(--mainFontSize) * 0.8)',
      fontWeight: '500',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
      boxShadow: 'none',
    },
  },
  content: {
    class: 'cv-prime-togglebutton-content',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--cv-space-lg)',
      width: '100%',
      padding: 'var(--cv-space-3xl) var(--cv-space-lg)',
      whiteSpace: 'nowrap',
      boxShadow: 'none',
    },
  },
} as const;
const sliderHandle = {
  class: 'cv-prime-slider-handle',
} as const;
const imagePreviewMask = {
  style: { borderRadius: 'var(--cv-radius)' },
} as const;
const panelHeader = {
  class: 'cv-prime-panel-header',
  style: {
    display: 'flex',
    gap: 'var(--cv-space-lg)',
    alignItems: 'center',
    padding: 'var(--cv-space-xl) var(--cv-space-2xl)',
    border: 'none',
    background: 'transparent',
  },
} as const;
const panelContent = {
  class: 'cv-prime-panel-content',
  style: {
    padding: '0',
    border: 'none',
    background: 'transparent',
  },
} as const;

/**
 * PrimeVue Pass Through 集中配置
 */
export const cosmosPrimePt = {
  dialog: {
    mask: {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100dvw', height: '100dvh' },
    },
    root: { class: 'cosmos-vision-root cv-dialog', style: { overflow: 'hidden' } },
  },
  image: { previewMask: imagePreviewMask },
  inputtext: { root: fieldRoot },
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
    pcChip: {
      root: { class: 'cv-prime-chip' },
      label: { class: 'cv-prime-chip-label' },
      removeIcon: { class: 'cv-prime-chip-remove-icon' },
    },
    pcHeaderCheckbox: checkbox,
    pcOptionCheckbox: checkbox,
  },
  autocomplete: { overlay: fieldOverlay },
  checkbox,
  datepicker: { panel: overlay },
  popover: { root: overlay },
  confirmpopup: { root: overlay },
  password: { pcInputText: { root: fieldRoot }, maskIcon: icon, unmaskIcon: icon, overlay },
  inputnumber: {
    pcInputText: { root: fieldRoot },
    incrementButton: iconButton,
    decrementButton: iconButton,
  },
  button: { root: buttonRoot, icon, loadingIcon: icon, label: { class: 'cv-prime-button-label' } },
  panel: { header: panelHeader, content: panelContent },
  message: { root: { class: 'cv-prime-message' }, text: { class: 'cv-prime-message-text' }, closeButton: iconButton },
  selectbutton: { root: selectButtonRoot, pcToggleButton: selectButtonToggle },
  togglebutton: {
    root: { class: 'cv-prime-togglebutton' },
    content: { class: 'cv-prime-togglebutton-content' },
  },
  slider: {
    root: { class: 'cv-prime-slider', style: { border: 'none' } },
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
} satisfies PrimeVuePTOptions;
