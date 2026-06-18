import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import type { NovelAIModel, NovelAISettings, NovelAIUcPreset } from '@/constants/novelai';
import { resolveImagePromptPreset, getImagePromptPreset } from '@/services/image-prompt/presets';
import {
  resolvePromptLlmSource,
  type PromptLlmExtractSettings,
  type PromptLlmPromptMode,
} from '@/services/tavern-helper/prompt-llm';

const QUALITY_PRESETS: Record<NovelAIModel, string> = {
  'nai-diffusion-4-5-full': 'location, very aesthetic, masterpiece, no text',
  'nai-diffusion-4-5-curated': 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
  'nai-diffusion-4-full': 'no text, best quality, very aesthetic, absurdres',
  'nai-diffusion-3': 'best quality, amazing quality, very aesthetic, absurdres',
};

const UC_PRESETS: Record<NovelAIModel, Partial<Record<NovelAIUcPreset, string>>> = {
  'nai-diffusion-4-5-full': {
    Heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
  },
  'nai-diffusion-4-5-curated': {
    Heavy:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
  },
  'nai-diffusion-4-full': {
    Heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks',
    Light: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing',
  },
  'nai-diffusion-3': {
    Heavy:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
    Light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
  },
};

export type NovelAIPromptMode = PromptLlmPromptMode;

/**
 * 组合 NovelAI 正向提示词
 * @param settings NovelAI 设置
 * @param presetSettings 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param llmPrompt LLM 正向提示词
 * @returns 最终发送给官方 API 的 input
 */
export function buildPositivePrompt(
  settings: NovelAISettings,
  presetSettings: ImagePromptPresetSettings,
  extractSettings: PromptLlmExtractSettings,
  llmPrompt = '',
  mode: NovelAIPromptMode = 'extract',
): string {
  const prompt = resolvePromptLlmSource(llmPrompt, mode, extractSettings, 'positive');
  const preset = getImagePromptPreset(presetSettings.positive, settings.positivePromptPresetId);
  const custom = resolveImagePromptPreset(preset, prompt);
  const qualityTags = settings.addQualityTags ? QUALITY_PRESETS[settings.model] : '';
  return [custom, qualityTags].filter(Boolean).join(', ');
}

/**
 * 组合 NovelAI 负向提示词
 * @param settings NovelAI 设置
 * @param presetSettings 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param llmPrompt LLM 负向提示词
 * @returns 最终发送给官方 API 的 negative_prompt
 */
export function buildNegativePrompt(
  settings: NovelAISettings,
  presetSettings: ImagePromptPresetSettings,
  extractSettings: PromptLlmExtractSettings,
  llmPrompt = '',
  mode: NovelAIPromptMode = 'extract',
): string {
  const presetPrompt = UC_PRESETS[settings.model][settings.ucPreset] ?? '';
  const prompt = resolvePromptLlmSource(llmPrompt, mode, extractSettings, 'negative');
  const preset = getImagePromptPreset(presetSettings.negative, settings.negativePromptPresetId);
  const custom = resolveImagePromptPreset(preset, prompt);
  return [presetPrompt, custom].filter(Boolean).join(', ');
}

/**
 * 转换 NovelAI UC 预设为官方数值
 * @param preset 负向提示词程度
 * @returns NovelAI API 的 ucPreset 数值
 */
export function getUcPresetValue(preset: NovelAIUcPreset): number {
  const values: Record<NovelAIUcPreset, number> = { Heavy: 0, Light: 1, None: 3 };
  return values[preset];
}
