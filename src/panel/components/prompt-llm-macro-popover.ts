import type { PopoverDesignTokens } from '@primeuix/themes/types/popover';
import type { PopoverPassThroughOptions } from 'primevue/popover';
import './prompt-llm-macro-popover.css';

import {
  PROMPT_LLM_FIXED_TAGS_TOKEN,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
  PROMPT_LLM_TRIGGER_NAMES_TOKEN,
} from '@/constants/default-settings';

export const PROMPT_LLM_TOKEN_OPTIONS = [
  { label: '历史消息', token: PROMPT_LLM_HISTORY_TOKEN },
  { label: '人物信息', token: PROMPT_LLM_PARTICIPANT_TOKEN },
  { label: '焦点段落', token: PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN },
  { label: '特别要求', token: PROMPT_LLM_SPECIAL_REQUEST_TOKEN },
] as const;

export const PROMPT_PERSON_TOKEN_OPTIONS = [
  { label: '关键词', token: PROMPT_LLM_TRIGGER_NAMES_TOKEN },
  { label: '固定 tag', token: PROMPT_LLM_FIXED_TAGS_TOKEN },
] as const;

export interface MacroPopoverInstance {
  hide: () => void;
  toggle: (event: Event) => void;
}

export const MACRO_POPOVER_BASE_Z_INDEX = 3200;

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

export const MACRO_POPOVER_PT = {
  root: {
    class: 'cosmos-vision-root cv-macro-popover',
  },
  content: {
    class: 'cv-macro-popover-content',
  },
} satisfies PopoverPassThroughOptions;
