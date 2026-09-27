import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { createImagePromptPreset, type ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  buildNegativePrompt,
  buildNegativePromptParts,
  buildPositivePrompt,
  buildPositivePromptParts,
  getQualityPresetPrompt,
  getUcPresetPrompt,
} from '@/services/novelai/prompt-presets';

/**
 * 创建带模板预设的测试设置
 * 正面模板为后缀式（core 拼在模板后），负面模板为前缀式（core 拼在模板前）
 * @returns 扩展设置与共享预设
 */
function createTestContext() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const presetSettings: ImagePromptPresetSettings = {
    positive: [
      createImagePromptPreset('P1', 'P1', 'template one, '),
      createImagePromptPreset('P2', 'P2', 'template two, '),
    ],
    negative: [{ id: 'N1', name: 'N1', text: ', no bad stuff', placeholderOffset: 0 }],
  };
  settings.novelai.positivePromptPresetId = 'P1';
  settings.novelai.negativePromptPresetId = 'N1';
  return { settings, presetSettings };
}

describe('buildPositivePromptParts 结构化组装', () => {
  it('core / presetId / 最终串三者一致且与薄包装结果相同', () => {
    const { settings, presetSettings } = createTestContext();
    const extractSettings = settings.promptLlm;
    const parts = buildPositivePromptParts(settings.novelai, presetSettings, extractSettings, 'solo, sunset', 'direct');
    const prompt = buildPositivePrompt(settings.novelai, presetSettings, extractSettings, 'solo, sunset', 'direct');

    expect(parts.core).toBe('solo, sunset');
    expect(parts.presetId).toBe('P1');
    expect(parts.prompt).toBe(prompt);
    // 最终串 = 预设模板(core) + 质量词后缀
    const quality = getQualityPresetPrompt(settings.novelai.model, settings.novelai.qualityPreset);
    expect(parts.prompt).toBe(`template one, solo, sunset, ${quality}`);
  });

  it('presetIdOverride 覆写预设并写入 parts', () => {
    const { settings, presetSettings } = createTestContext();
    const parts = buildPositivePromptParts(
      settings.novelai,
      presetSettings,
      settings.promptLlm,
      'solo',
      'direct',
      'P2',
    );
    expect(parts.presetId).toBe('P2');
    expect(parts.prompt).toContain('template two, solo');
  });

  it('空 core 时模板照常拼接', () => {
    const { settings, presetSettings } = createTestContext();
    settings.novelai.qualityPreset = 'None';
    const parts = buildPositivePromptParts(settings.novelai, presetSettings, settings.promptLlm, '', 'direct');
    expect(parts.core).toBe('');
    // 模板尾部分隔符经 trim 保留为结尾逗号
    expect(parts.prompt).toBe('template one,');
  });
});

describe('buildNegativePromptParts 结构化组装', () => {
  it('core / presetId / 最终串三者一致且与薄包装结果相同', () => {
    const { settings, presetSettings } = createTestContext();
    const extractSettings = settings.promptLlm;
    const parts = buildNegativePromptParts(settings.novelai, presetSettings, extractSettings, 'blurry', 'direct', 'positive prompt');
    const prompt = buildNegativePrompt(settings.novelai, presetSettings, extractSettings, 'blurry', 'direct', 'positive prompt');

    expect(parts.core).toBe('blurry');
    expect(parts.presetId).toBe('N1');
    expect(parts.prompt).toBe(prompt);
    // 最终串 = UC 前缀 + 预设模板(core)
    const uc = getUcPresetPrompt(settings.novelai.model, settings.novelai.ucPreset);
    expect(parts.prompt).toBe(`${uc}, blurry, no bad stuff`);
  });

  it('presetIdOverride 覆写负面预设', () => {
    const { settings, presetSettings } = createTestContext();
    const parts = buildNegativePromptParts(
      settings.novelai,
      presetSettings,
      settings.promptLlm,
      'blurry',
      'direct',
      'positive prompt',
      'N1',
    );
    expect(parts.presetId).toBe('N1');
    expect(parts.prompt).toContain('no bad stuff');
  });

  it('空 core 时 UC 前缀与模板照常拼接', () => {
    const { settings, presetSettings } = createTestContext();
    const parts = buildNegativePromptParts(settings.novelai, presetSettings, settings.promptLlm, '', 'direct', 'positive prompt');
    expect(parts.core).toBe('');
    expect(parts.prompt).toContain('no bad stuff');
  });
});
