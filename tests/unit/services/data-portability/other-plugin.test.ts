import { describe, expect, it } from 'vitest';
import { isOtherPluginExport, parseOtherPluginExport } from '@/services/data-portability/other-plugin';
import type { PromptLlmMessagePresetSettings } from '@/constants/novelai';

describe('other-plugin import adapter', () => {
  const sampleStChat8Export = {
    fixedPrompt_novelai: 'masterpiece',
    negativePrompt_novelai: 'lowres',
    defaultLlmPreset: {
      name: 'Default LLM',
      entries: [{ role: 'system', content: 'You are an image prompt generator {{正文}}' }],
    },
  };

  it('identifies third-party plugin export format', () => {
    expect(isOtherPluginExport(sampleStChat8Export)).toBe(true);
    expect(isOtherPluginExport({})).toBe(false);
  });

  it('parses third-party plugin payload and translates macros', () => {
    const { payload, warnings } = parseOtherPluginExport(sampleStChat8Export);
    const presets = payload.promptLlmMessagePresets as PromptLlmMessagePresetSettings | undefined;
    expect(presets?.presets).toBeDefined();
    expect(presets?.presets[0].messages[0].content).toContain('{focus_paragraph}');
    expect(warnings).toEqual([]);
  });
});
