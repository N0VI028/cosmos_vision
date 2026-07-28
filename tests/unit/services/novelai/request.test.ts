import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { buildNovelAIResolvedRequest, buildNovelAILlmPromptOverrides } from '@/services/novelai/api';

describe('novelai request builder', () => {
  it('builds resolved request with default settings and presets', () => {
    const settings = DEFAULT_SETTINGS.novelai;
    const imagePromptPresets = DEFAULT_SETTINGS.imagePromptPresets;
    const extractSettings = DEFAULT_SETTINGS.promptLlm;

    const resolved = buildNovelAIResolvedRequest(settings, imagePromptPresets, extractSettings, {
      positiveLLMPrompt: 'masterpiece, solo',
      negativeLLMPrompt: 'blurry',
    });

    expect(resolved.snapshot.model).toBe(settings.model);
    expect(resolved.snapshot.positivePrompt).toContain('masterpiece');
    expect(resolved.snapshot.negativePrompt).toContain('blurry');
    expect(resolved.seed).toBeGreaterThanOrEqual(0);
  });

  it('builds LLM prompt overrides from JSON response string', () => {
    const settings = { ...DEFAULT_SETTINGS.promptLlm, preferJsonSchemaExtraction: true };
    const rawResponse = JSON.stringify({
      positivePrompt: 'scenery, sunset',
      negativePrompt: 'low quality',
    });

    const overrides = buildNovelAILlmPromptOverrides(settings, rawResponse);
    expect(overrides.positiveLLMPrompt).toBe('scenery, sunset');
    expect(overrides.negativeLLMPrompt).toBe('low quality');
  });
});
