import {
  accordionColor,
  buttonOutlinedSecondary,
  buttonSecondarySolid,
  buttonTextSecondary,
  cardColor,
  checkboxColorDark,
  checkboxColorLight,
  chipColor,
  dialogColor,
  dividerColor,
  fileUploadColor,
  galleriaColor,
  inputNumberButtonColor,
  messageColor,
  passwordColor,
  popoverColor,
  progressSpinnerColor,
  skeletonColor,
  sliderColor,
  tagColor,
  toggleButtonColorDark,
  toggleButtonColorLight,
  toggleSwitchColorDark,
  toggleSwitchColorLight,
} from './primevue-theme-tokens';

/**
 * PrimeVue 组件级 design token 映射
 * 供 cosmosPrimePreset 装配；不改变 token 语义
 */
export const cosmosPrimeComponents = {
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
  // token 只有统一 option.borderRadius；选中态胶囊圆角需状态选择器 → 组件级 css 扩展指向 PT 锚点
  select: {
    css: `
      .cosmos-vision-root .cv-select-option[data-p-selected='true'] {
        border-radius: var(--cv-radius-full);
      }
    `,
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
  button: {
    root: {
      borderRadius: 'var(--cv-radius)',
      roundedBorderRadius: 'var(--cv-radius-full)',
      gap: '0.5em',
      iconOnlyWidth: '2.5em',
      badgeSize: '1em',
      fontSize: 'var(--cv-font-size-base)',
      focusRing: {
        width: '0',
        style: 'none',
        offset: '0',
      },
      sm: {
        fontSize: 'var(--cv-font-size-xs)',
        iconOnlyWidth: '2em',
      },
      lg: {
        fontSize: 'var(--cv-font-size-lg)',
        iconOnlyWidth: '3em',
      },
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
  tree: {
    root: {
      padding: 'var(--cv-space-xs)',
      background: 'transparent',
    },
  },
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
  password: {
    content: { gap: 'var(--cv-space-md)' },
    meter: {
      height: '0.5em',
      borderRadius: 'var(--cv-radius-full)',
    },
    meterText: { fontSize: 'var(--cv-font-size-xs)' },
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
    root: {
      borderRadius: 'var(--cv-radius-lg)',
      borderWidth: '1px',
    },
    content: {
      padding: '0.5em 0.75em',
      gap: 'var(--cv-space-sm)',
      sm: { padding: '0.35em 0.55em' },
      lg: { padding: '0.65em 0.9em' },
    },
    text: {
      fontSize: 'var(--cv-font-size-xs)',
      fontWeight: '500',
      sm: { fontSize: 'var(--cv-font-size-xs)' },
      lg: { fontSize: 'var(--cv-font-size-base)' },
    },
    icon: {
      size: '1em',
      sm: { size: '0.875em' },
      lg: { size: '1.125em' },
    },
    closeButton: {
      width: '1.5em',
      height: '1.5em',
      borderRadius: '50%',
      focusRing: {
        width: '0',
        style: 'none',
        offset: '0',
      },
    },
    closeIcon: {
      size: '0.875em',
      sm: { size: '0.75em' },
      lg: { size: '1em' },
    },
    colorScheme: {
      light: messageColor,
      dark: messageColor,
    },
  },
  progressspinner: {
    colorScheme: {
      light: progressSpinnerColor,
      dark: progressSpinnerColor,
    },
  },
  skeleton: {
    root: {
      borderRadius: 'var(--cv-radius-sm)',
    },
    colorScheme: {
      light: skeletonColor,
      dark: skeletonColor,
    },
  },
  slider: {
    css: `
      .cosmos-vision-root .cv-prime-slider-handle,
      #cosmos_vision .cv-prime-slider-handle {
        border: var(--cv-border-width) solid var(--cv-outline);
      }
    `,
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
        fontSize: 'var(--cv-font-size-xs)',
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
  tag: {
    root: {
      fontSize: 'var(--cv-font-size-xs)',
      fontWeight: '600',
      padding: '0.08rem 0.32rem',
      gap: 'var(--cv-space-xs)',
      borderRadius: 'var(--cv-radius-sm)',
      roundedBorderRadius: 'var(--cv-radius-full)',
    },
    icon: {
      size: '0.7em',
    },
    colorScheme: {
      light: tagColor,
      dark: tagColor,
    },
  },
  card: {
    root: {
      borderRadius: 'var(--cv-radius-sm)',
    },
    body: {
      padding: '0',
      gap: '0',
    },
    colorScheme: {
      light: cardColor,
      dark: cardColor,
    },
  },
  accordion: {
    panel: {
      borderWidth: '0',
    },
    header: {
      borderWidth: '0',
      padding: 'var(--cv-space-2xl)',
      fontSize: 'var(--cv-font-size-base)',
      focusRing: {
        width: '0',
        style: 'none',
        color: 'transparent',
        offset: '0',
        shadow: 'none',
      },
    },
    content: {
      borderWidth: '0',
      padding: '0',
    },
    colorScheme: {
      light: accordionColor,
      dark: accordionColor,
    },
  },
  galleria: {
    root: {
      borderWidth: '0',
      borderRadius: '0',
    },
    navButton: {
      size: '2.25rem',
      gutter: '0.5rem',
      prev: { borderRadius: '50%' },
      next: { borderRadius: '50%' },
    },
    thumbnailNavButton: {
      size: '1.75rem',
      borderRadius: 'var(--cv-radius-sm)',
      gutter: '0.5rem',
    },
    colorScheme: {
      light: galleriaColor,
      dark: galleriaColor,
    },
  },
  fileupload: {
    root: {
      borderRadius: 'var(--cv-radius-md)',
    },
    header: {
      padding: '0',
      borderWidth: '0',
      borderRadius: 'var(--cv-radius-md)',
      gap: '0',
    },
    content: {
      padding: '0',
      gap: '0',
    },
    colorScheme: {
      light: fileUploadColor,
      dark: fileUploadColor,
    },
  },
  divider: {
    colorScheme: {
      light: dividerColor,
      dark: dividerColor,
    },
  },
  dialog: {
    root: {
      borderRadius: 'var(--cv-radius-lg)',
    },
    header: {
      gap: 'var(--cv-space-md)',
      padding: 'var(--cv-space-7xl) var(--cv-space-7xl) 0',
    },
    title: {
      fontSize: 'var(--cv-font-size-xl)',
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
} as const;
