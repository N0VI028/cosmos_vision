import { describe, expect, it } from 'vitest';
import {
  normalizePromptLlmMessageKeywordGroups,
  normalizePromptLlmMessageKeywords,
  shouldSendPromptLlmMessage,
} from '@/services/prompt-llm/message-trigger';

describe('prompt-llm message-trigger', () => {
  it('normalizes keywords and keyword groups', () => {
    expect(normalizePromptLlmMessageKeywords([' cat ', '', 'dog', 'cat'])).toEqual(['cat', 'dog']);
    expect(normalizePromptLlmMessageKeywordGroups([['cat', ''], [' ']])).toEqual([['cat']]);
  });

  it('evaluates shouldSendPromptLlmMessage with always mode', () => {
    const message = {
      triggerMatchMode: 'always' as const,
      triggerKeywordGroups: [],
      triggerModels: [],
      triggerImageSources: [],
    };
    const context = { historyContent: 'hello', imageSource: 'comfyui' as const, modelId: 'm1' };
    expect(shouldSendPromptLlmMessage(message, context)).toBe(true);
  });

  it('evaluates any_match mode correctly', () => {
    const message = {
      triggerMatchMode: 'any_match' as const,
      triggerKeywordGroups: [['dragon'], ['unicorn']],
      triggerModels: ['m1'],
      triggerImageSources: ['comfyui' as const],
    };

    expect(
      shouldSendPromptLlmMessage(message, { historyContent: 'A big dragon appears', imageSource: 'novelai', modelId: 'm2' }),
    ).toBe(true);

    expect(
      shouldSendPromptLlmMessage(message, { historyContent: 'Nothing match', imageSource: 'novelai', modelId: 'm2' }),
    ).toBe(false);
  });
});
