import { describe, expect, it } from 'vitest';
import { buildPromptLlmTriggerContext } from '@/services/prompt-llm/runtime-request';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';

describe('prompt-llm runtime-request helper', () => {
  it('builds trigger context correctly from settings', () => {
    const settings = {
      imageSource: 'novelai' as const,
      novelai: DEFAULT_SETTINGS.novelai,
      comfyui: DEFAULT_SETTINGS.comfyui,
    };
    const ctx = buildPromptLlmTriggerContext(settings);
    expect(ctx.imageSource).toBe('novelai');
    expect(ctx.modelId).toBe(settings.novelai.model);
  });
});
