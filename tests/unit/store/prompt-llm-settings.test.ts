import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { promptLlmSettingsSchema, recoverPromptLlmSettings } from '@/store/prompt-llm-settings';

describe('prompt-llm settings schema and recovery', () => {
  it('validates default prompt-llm settings schema', () => {
    const result = promptLlmSettingsSchema.safeParse(DEFAULT_SETTINGS.promptLlm);
    expect(result.success).toBe(true);
  });

  it('recovers corrupted settings gracefully with fallback defaults', () => {
    const corrupted = {
      model: 12345, // bad type
      temperature: 'invalid', // bad type
      historyFloorCount: -5, // bad value
      apiKey: 'sk-secret-key', // valid
    };

    const recovered = recoverPromptLlmSettings(corrupted);
    expect(recovered.apiKey).toBe('sk-secret-key');
    expect(recovered.model).toBe(DEFAULT_SETTINGS.promptLlm.model);
    expect(recovered.temperature).toBe(DEFAULT_SETTINGS.promptLlm.temperature);
    expect(recovered.historyFloorCount).toBe(DEFAULT_SETTINGS.promptLlm.historyFloorCount);
  });
});
