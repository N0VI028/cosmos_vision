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
    const context = { historyContent: 'hello', imageSource: 'comfyui' as const, modelIds: ['m1'] };
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
      shouldSendPromptLlmMessage(message, {
        historyContent: 'A big dragon appears',
        imageSource: 'novelai',
        modelIds: ['m2'],
      }),
    ).toBe(true);

    expect(
      shouldSendPromptLlmMessage(message, { historyContent: 'Nothing match', imageSource: 'novelai', modelIds: ['m2'] }),
    ).toBe(false);
  });

  it('matches trigger models by regex body without delimiters', () => {
    const message = {
      triggerMatchMode: 'all_match' as const,
      triggerKeywordGroups: [],
      triggerModels: ['animal.*'],
      triggerImageSources: [],
    };

    expect(
      shouldSendPromptLlmMessage(message, { historyContent: '', imageSource: 'comfyui', modelIds: ['animal_xl_v2'] }),
    ).toBe(true);
    expect(
      shouldSendPromptLlmMessage(message, { historyContent: '', imageSource: 'comfyui', modelIds: ['ANIMAL'] }),
    ).toBe(true);
    expect(
      shouldSendPromptLlmMessage(message, { historyContent: '', imageSource: 'comfyui', modelIds: ['creature'] }),
    ).toBe(false);
  });

  it('matches any model in runtime model collection', () => {
    const message = {
      triggerMatchMode: 'all_match' as const,
      triggerKeywordGroups: [],
      triggerModels: ['noob.*'],
      triggerImageSources: [],
    };
    const context = { historyContent: '', imageSource: 'comfyui' as const, modelIds: ['illustrious_v15', 'noobxl'] };
    expect(shouldSendPromptLlmMessage(message, context)).toBe(true);
    expect(shouldSendPromptLlmMessage({ ...message, triggerModels: ['flux'] }, context)).toBe(false);
  });

  it('falls back to exact comparison for invalid regex model pattern', () => {
    const message = {
      triggerMatchMode: 'all_match' as const,
      triggerKeywordGroups: [],
      triggerModels: ['[animal'],
      triggerImageSources: [],
    };

    expect(
      shouldSendPromptLlmMessage(message, { historyContent: '', imageSource: 'comfyui', modelIds: ['[animal'] }),
    ).toBe(true);
    expect(
      shouldSendPromptLlmMessage(message, { historyContent: '', imageSource: 'comfyui', modelIds: ['animal'] }),
    ).toBe(false);
  });
});
