import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { buildNovelAIResolvedRequest, buildNovelAIPromptOverrides } from '@/services/novelai/api';

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

  it('builds prompt overrides from extracted output', () => {
    const overrides = buildNovelAIPromptOverrides(
      { positivePrompt: 'scenery, sunset', negativePrompt: 'low quality' },
      [],
    );
    expect(overrides.positiveLLMPrompt).toBe('scenery, sunset');
    expect(overrides.negativeLLMPrompt).toBe('low quality');
  });
});
