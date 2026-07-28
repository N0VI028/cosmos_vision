import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { readCharacterPrompts } from '@/services/prompt-llm/character-prompt';

describe('readCharacterPrompts', () => {
  it('reads JSON character array and preserves valid position coordinates', () => {
    const raw = JSON.stringify({
      positivePrompt: 'scene',
      negativePrompt: 'bad',
      characterPrompts: [{ positivePrompt: 'alice', negativePrompt: 'blur', position: { x: 0.25, y: 0.75 } }],
    });

    expect(readCharacterPrompts(raw, DEFAULT_SETTINGS.promptLlm)).toEqual([
      { positivePrompt: 'alice', negativePrompt: 'blur', position: { x: 0.25, y: 0.75 } },
    ]);
  });

  it('falls back to default position when coordinates are invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = JSON.stringify({
      characterPrompts: [{ positivePrompt: 'alice', negativePrompt: '', position: { x: 2, y: 0.5 } }],
    });

    expect(readCharacterPrompts(raw, DEFAULT_SETTINGS.promptLlm)).toEqual([
      { positivePrompt: 'alice', negativePrompt: '', position: { x: 0.5, y: 0.5 } },
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses regex extraction when JSON schema extraction is disabled', () => {
    const settings = {
      ...DEFAULT_SETTINGS.promptLlm,
      preferJsonSchemaExtraction: false,
      characterPositivePromptExtractPattern: '/P:(\\w+)/g',
      characterNegativePromptExtractPattern: '/N:(\\w+)/g',
      characterPositionXExtractPattern: '/X:([0-9.]+)/g',
      characterPositionYExtractPattern: '/Y:([0-9.]+)/g',
    };
    const raw = 'P:alice N:blur X:0.25 Y:0.75 P:bob N:none X:0.5 Y:0.5';

    expect(readCharacterPrompts(raw, settings)).toEqual([
      { positivePrompt: 'alice', negativePrompt: 'blur', position: { x: 0.25, y: 0.75 } },
      { positivePrompt: 'bob', negativePrompt: 'none', position: { x: 0.5, y: 0.5 } },
    ]);
  });
});
