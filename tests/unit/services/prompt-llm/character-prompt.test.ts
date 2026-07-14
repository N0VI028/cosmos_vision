import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { readCharacterPrompts } from '@/services/prompt-llm/character-prompt';

describe('readCharacterPrompts', () => {
  it('读取 JSON 角色数组并保留合法坐标', () => {
    const raw = JSON.stringify({
      positivePrompt: 'scene', negativePrompt: 'bad',
      characterPrompts: [{ prompt: 'alice', uc: 'blur', position: { x: 0.25, y: 0.75 } }],
    });

    expect(readCharacterPrompts(raw, DEFAULT_SETTINGS.promptLlm)).toEqual([
      { prompt: 'alice', uc: 'blur', position: { x: 0.25, y: 0.75 } },
    ]);
  });

  it('在坐标非法时保留角色并回退中心点', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = JSON.stringify({ characterPrompts: [{ prompt: 'alice', uc: '', position: { x: 2, y: 0.5 } }] });

    expect(readCharacterPrompts(raw, DEFAULT_SETTINGS.promptLlm)).toEqual([
      { prompt: 'alice', uc: '', position: { x: 0.5, y: 0.5 } },
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('使用默认 NAI 正则提取角色字段', () => {
    const settings = { ...DEFAULT_SETTINGS.promptLlm, preferJsonSchemaExtraction: false };
    const raw = JSON.stringify({
      characterPrompts: [
        { prompt: 'alice', uc: 'blur', position: { x: 0.25, y: 0.75 } },
        { prompt: 'bob', uc: '', position: { x: 0.5, y: 0.5 } },
      ],
    });

    expect(readCharacterPrompts(raw, settings)).toEqual([
      { prompt: 'alice', uc: 'blur', position: { x: 0.25, y: 0.75 } },
      { prompt: 'bob', uc: '', position: { x: 0.5, y: 0.5 } },
    ]);
  });

  it('按正面匹配顺序合并正则角色字段', () => {
    const settings = {
      ...DEFAULT_SETTINGS.promptLlm,
      preferJsonSchemaExtraction: false,
      characterPromptExtractPattern: '/P:(\\w+)/g',
      characterUcExtractPattern: '/U:(\\w+)/g',
      characterPositionXExtractPattern: '/X:([0-9.]+)/g',
      characterPositionYExtractPattern: '/Y:([0-9.]+)/g',
    };
    const raw = 'P:alice U:blur X:0.25 Y:0.75 P:bob X:0.5 Y:0.5';

    expect(readCharacterPrompts(raw, settings)).toEqual([
      { prompt: 'alice', uc: 'blur', position: { x: 0.25, y: 0.75 } },
      { prompt: 'bob', uc: '', position: { x: 0.5, y: 0.5 } },
    ]);
  });
});
