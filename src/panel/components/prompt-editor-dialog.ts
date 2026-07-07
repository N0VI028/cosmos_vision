/**
 * Prompt 系列编辑弹窗共享尺寸
 */
export const PROMPT_EDITOR_DIALOG_STYLE = {
  width: '42rem',
  maxHeight: 'min(42rem, calc(100dvh - 2rem))',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

/**
 * Prompt 系列编辑弹窗共享 PT
 */
export const PROMPT_EDITOR_DIALOG_PT = {
  content: {
    style: {
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    },
  },
} as const;
