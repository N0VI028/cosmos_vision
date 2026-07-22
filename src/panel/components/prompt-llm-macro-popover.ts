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

/**
 * 宏插入 Popover 局部 PT
 * 视觉已迁全局 definePreset components.popover；全局 PT 已含 cosmos-vision-root
 * 此处仅追加业务布局类（ptOptions.mergeProps 会与全局 class 合并）
 */
export const MACRO_POPOVER_PT = {
  root: {
    class: 'cv-macro-popover',
  },
  content: {
    class: 'cv-macro-popover-content',
  },
} satisfies PopoverPassThroughOptions;
