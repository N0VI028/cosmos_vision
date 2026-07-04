import type { ButtonDesignTokens } from '@primeuix/themes/types/button';
import type { PopoverDesignTokens } from '@primeuix/themes/types/popover';
import type { ButtonPassThroughOptions } from 'primevue/button';
import type { PopoverPassThroughOptions } from 'primevue/popover';
import {
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
} from '@/constants/default-settings';

export const PROMPT_LLM_TOKEN_OPTIONS = [
  { label: '历史消息', token: PROMPT_LLM_HISTORY_TOKEN },
  { label: '人物信息', token: PROMPT_LLM_PARTICIPANT_TOKEN },
  { label: '焦点段落', token: PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN },
  { label: '特别要求', token: PROMPT_LLM_SPECIAL_REQUEST_TOKEN },
] as const;

export const MACRO_POPOVER_BASE_Z_INDEX = 3200;

export const MACRO_BUTTON_TOKENS = {
  root: {
    borderRadius: 'var(--cv-radius-sm)',
    gap: '0',
    paddingX: 'var(--cv-space-lg)',
    paddingY: 'var(--cv-space-xs)',
    focusRing: { width: '0', style: 'none', offset: '0' },
    label: { fontWeight: '500' },
  },
  text: {
    primary: {
      color: 'var(--p-primary-color)',
      hoverBackground: 'var(--cv-surface-container)',
      activeBackground: 'var(--cv-surface-container)',
    },
  },
} satisfies ButtonDesignTokens;

export const MACRO_POPOVER_TOKENS = {
  root: {
    background: 'var(--cv-surface-container-high)',
    borderColor: 'var(--cv-outline)',
    borderRadius: 'var(--cv-radius)',
    color: 'var(--cv-on-surface)',
    gutter: 'var(--cv-space-xs)',
    shadow: 'var(--cv-popover-shadow)',
  },
  content: { padding: 'var(--cv-space-sm)' },
} satisfies PopoverDesignTokens;

export const MACRO_TRIGGER_BUTTON_PT = {
  root: { class: 'cv-macro-trigger-button', style: { flex: '0 0 auto', width: 'max-content' } },
  label: { style: { fontSize: 'var(--cv-font-size-2xs)', lineHeight: '1', whiteSpace: 'nowrap' } },
} satisfies ButtonPassThroughOptions;

export const MACRO_OPTION_BUTTON_PT = {
  root: {
    class: 'cv-macro-option-button',
    style: { justifyContent: 'flex-start', width: 'max-content', minWidth: 'max-content' },
  },
  label: { style: { fontSize: 'var(--cv-font-size-2xs)', lineHeight: '1', whiteSpace: 'nowrap' } },
} satisfies ButtonPassThroughOptions;

export const MACRO_POPOVER_PT = {
  root: {
    class: 'cosmos-vision-root cv-macro-popover',
    style: { width: 'max-content', minWidth: 'max-content' },
  },
  content: {
    class: 'cv-macro-popover-content',
    style: {
      alignItems: 'flex-start',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--cv-space-xs)',
      width: 'max-content',
    },
  },
} satisfies PopoverPassThroughOptions;
