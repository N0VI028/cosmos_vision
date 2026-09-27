import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT_LLM_PRESET_ID,
  DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID,
} from '@/constants/default-prompt-llm-preset';
import type { PromptLlmMessagePresetSettings } from '@/constants/prompt-llm';
import { normalizePromptLlmMessagePresets } from '@/services/prompt-llm/message-preset';

describe('prompt-llm message-preset normalization', () => {
  it('does not re-append the deleted special request message of the default preset', () => {
    const presetSettings: PromptLlmMessagePresetSettings = {
      activePresetId: DEFAULT_PROMPT_LLM_PRESET_ID,
      presets: [
        {
          id: DEFAULT_PROMPT_LLM_PRESET_ID,
          name: '默认预设',
          messages: [{ id: 'custom-message', title: '自定义条目', role: 'system', content: 'hello' }],
        },
      ],
    };

    const normalized = normalizePromptLlmMessagePresets(presetSettings);
    const messageIds = normalized.presets[0].messages.map(message => message.id);

    expect(messageIds).toEqual(['custom-message']);
    expect(messageIds).not.toContain(DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID);
  });
});
