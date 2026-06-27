export const sliderToken = {
  root: {
    transitionDuration: 'var(--p-transition-duration, 0.2s)',
  },
  track: {
    background: 'var(--cv-surface-variant)',
    borderRadius: 'var(--cv-radius-full)',
    size: '0.2667em',
  },
  range: {
    background: 'var(--cv-outline)',
  },
  handle: {
    width: '1.0667em',
    height: '1.0667em',
    borderRadius: '50%',
    background: 'var(--cv-surface-container)',
    hoverBackground: 'var(--cv-surface-container-high)',
    content: {
      width: '0.4em',
      height: '0.4em',
      borderRadius: '50%',
      background: 'var(--cv-on-surface)',
      hoverBackground: 'var(--cv-on-surface)',
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
} as const;
