import type { ImagePromptPair } from '@/services/image-prompt/presets';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import type { NovelAIModel, NovelAIQualityPreset, NovelAISettings, NovelAIUcPreset } from '@/constants/novelai';
import { isNovelAIV3Model } from '@/constants/novelai';
import { resolveImagePromptPreset, getImagePromptPreset } from '@/services/image-prompt/presets';
import {
  resolvePromptLlmSource,
  type PromptLlmExtractSettings,
  type PromptLlmPromptMode,
} from '@/services/tavern-helper/prompt-llm';

const QUALITY_PRESETS: Record<NovelAIModel, Partial<Record<NovelAIQualityPreset, string>>> = {
  'nai-diffusion-5-curated': {
    Standard: 'very aesthetic, masterpiece, no text',
    Light: 'very aesthetic, amazing quality, no text',
  },
  'nai-diffusion-5-full': {
    Standard: 'very aesthetic, masterpiece, no text',
    Light: 'very aesthetic, amazing quality, no text',
  },
  'nai-diffusion-4-5-full': {
    Standard: 'very aesthetic, masterpiece, no text',
  },
  'nai-diffusion-4-5-curated': {
    Standard: 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
  },
  'nai-diffusion-4-full': {
    Standard: 'no text, best quality, very aesthetic, absurdres',
  },
  'nai-diffusion-4-curated-preview': {
    Standard: 'rating:general, best quality, very aesthetic, absurdres',
  },
  'nai-diffusion-3': {
    Standard: 'best quality, amazing quality, very aesthetic, absurdres',
  },
  'nai-diffusion-furry-3': {
    Standard: '{best quality}, {amazing quality}',
  },
};

/**
 * 获取指定模型和预设类型的质量词
 * @param model 模型
 * @param preset 质量词预设类型 ('Standard' | 'Light' | 'None')
 * @returns 质量提示词
 */
export function getQualityPresetPrompt(model: NovelAIModel, preset: NovelAIQualityPreset = 'Standard'): string {
  if (preset === 'None') return '';
  const modelPresets = QUALITY_PRESETS[model];
  if (!modelPresets) return '';
  return modelPresets[preset] || (preset === 'Standard' ? modelPresets.Standard || '' : '');
}

/**
 * 获取指定模型支持的质量词预设选项列表
 * @param model 模型
 * @returns 支持的预设列表
 */
export function getSupportedQualityPresets(model: NovelAIModel): NovelAIQualityPreset[] {
  const modelPresets = QUALITY_PRESETS[model];
  if (!modelPresets) return ['Standard', 'None'];
  const supported: NovelAIQualityPreset[] = ['Standard'];
  if (modelPresets.Light) supported.push('Light');
  supported.push('None');
  return supported;
}

const UC_PRESETS: Record<NovelAIModel, Partial<Record<NovelAIUcPreset, string>>> = {
  'nai-diffusion-5-full': {
    Heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
    Human_Focus:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
    Furry_Focus:
      '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  },
  'nai-diffusion-5-curated': {
    Heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
    Human_Focus:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
  },
  'nai-diffusion-4-5-full': {
    Heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
    Human_Focus:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
    Furry_Focus:
      '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  },
  'nai-diffusion-4-5-curated': {
    Heavy:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
    Light:
      'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
    Human_Focus:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
  },
  'nai-diffusion-4-full': {
    Heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page',
    Light:
      'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page',
  },
  'nai-diffusion-4-curated-preview': {
    Heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, white blank page, blank page',
    Light:
      'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature, white blank page, blank page',
  },
  'nai-diffusion-3': {
    Heavy:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
    Light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
    Human_Focus:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
  },
  'nai-diffusion-furry-3': {
    Heavy:
      '{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast',
    Light:
      '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text',
  },
};

/**
 * 获取指定模型支持的 UC 预设列表
 * @param model 模型
 * @returns 支持的预设列表
 */
export function getSupportedUcPresets(model: NovelAIModel): NovelAIUcPreset[] {
  const modelPresets = UC_PRESETS[model];
  if (!modelPresets) return ['Heavy', 'Light', 'None'];
  const supported: NovelAIUcPreset[] = [];
  if (modelPresets.Heavy) supported.push('Heavy');
  if (modelPresets.Light) supported.push('Light');
  if (modelPresets.Human_Focus) supported.push('Human_Focus');
  if (modelPresets.Furry_Focus) supported.push('Furry_Focus');
  supported.push('None');
  return supported;
}

/**
 * 获取指定模型和预设类型的负面提示词
 * @param model 模型
 * @param preset 预设类型
 * @returns 负面预设词
 */
export function getUcPresetPrompt(model: NovelAIModel, preset: NovelAIUcPreset): string {
  if (preset === 'None') return '';
  return UC_PRESETS[model]?.[preset] ?? '';
}

export type NovelAIPromptMode = PromptLlmPromptMode;

/**
 * 组合 NovelAI 正向提示词
 * @param settings NovelAI 设置
 * @param presetSettings 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param llmPrompt LLM 正向提示词
 * @param mode 提取模式
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
  const qualityTags = getQualityPresetPrompt(settings.model, settings.qualityPreset);
  return [custom, qualityTags].filter(Boolean).join(', ');
}

/**
 * 组合 NovelAI 负向提示词
 * @param settings NovelAI 设置
 * @param presetSettings 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param llmPrompt LLM 负向提示词
 * @param mode 提取模式
 * @param positivePrompt 正向提示词（用于 V3 系列检测是否缺少 nsfw）
 * @returns 最终发送给官方 API 的 negative_prompt
 */
export function buildNegativePrompt(
  settings: NovelAISettings,
  presetSettings: ImagePromptPresetSettings,
  extractSettings: PromptLlmExtractSettings,
  llmPrompt = '',
  mode: NovelAIPromptMode = 'extract',
  positivePrompt = '',
): string {
  const presetPrompt = UC_PRESETS[settings.model]?.[settings.ucPreset] ?? '';
  const prompt = resolvePromptLlmSource(llmPrompt, mode, extractSettings, 'negative');
  const preset = getImagePromptPreset(presetSettings.negative, settings.negativePromptPresetId);
  const custom = resolveImagePromptPreset(preset, prompt);
  let result = [presetPrompt, custom].filter(Boolean).join(', ');

  // 仅针对 V3 系列旧模型：开启预设且正面未包含 "nsfw" 时自动在最前添加 "nsfw, "
  if (
    isNovelAIV3Model(settings.model) &&
    settings.ucPreset !== 'None' &&
    presetPrompt &&
    !positivePrompt.toLowerCase().includes('nsfw')
  ) {
    result = result ? `nsfw, ${result}` : 'nsfw';
  }

  return result;
}

/**
 * 读取用于编辑的 NovelAI 提示词
 * 过滤质量标签和 UC 预设,仅保留用户可编辑部分
 * @param settings NovelAI 设置
 * @param prompts 最终发送给官方 API 的提示词
 * @returns 适合回填到编辑框的提示词
 */
export function readNovelAIEditablePrompts(settings: NovelAISettings, prompts: ImagePromptPair): ImagePromptPair {
  return {
    positivePrompt: stripPromptSuffix(prompts.positivePrompt, readNovelAIQualityTags(settings)),
    negativePrompt: stripPromptPrefix(prompts.negativePrompt, readNovelAIUcPresetPrompt(settings)),
  };
}

/**
 * 将编辑后的提示词重新补回 NovelAI 内置质量标签和 UC 预设
 * @param settings NovelAI 设置
 * @param prompts 编辑后的提示词
 * @returns 可直接发送给官方 API 的最终提示词
 */
export function buildNovelAIFinalPromptsFromEditable(
  settings: NovelAISettings,
  prompts: ImagePromptPair,
): ImagePromptPair {
  return {
    positivePrompt: appendPromptSuffix(prompts.positivePrompt, readNovelAIQualityTags(settings)),
    negativePrompt: appendPromptPrefix(prompts.negativePrompt, readNovelAIUcPresetPrompt(settings)),
  };
}

/**
 * 转换 NovelAI UC 预设为官方数值 (非 V5 旧模型)
 * @param preset 负向提示词程度
 * @param model 模型 ID（用于区分 Furry 模型）
 * @returns NovelAI API 的 ucPreset 数值
 */
export function getUcPresetValue(preset: NovelAIUcPreset, model?: NovelAIModel): number {
  const isFurry = model?.includes('furry') ?? false;
  switch (preset) {
    case 'Heavy':
      return 0;
    case 'Light':
      return 1;
    case 'Human_Focus':
      return isFurry ? 3 : 2;
    case 'Furry_Focus':
      return isFurry ? 2 : 3;
    case 'None':
      return 3;
    default:
      return 0;
  }
}

/**
 * 读取当前模型启用的质量标签
 * @param settings NovelAI 设置
 * @returns 质量标签
 */
function readNovelAIQualityTags(settings: NovelAISettings): string {
  return getQualityPresetPrompt(settings.model, settings.qualityPreset);
}

/**
 * 读取当前模型启用的 UC 预设文本
 * @param settings NovelAI 设置
 * @returns 负面预设文本
 */
function readNovelAIUcPresetPrompt(settings: NovelAISettings): string {
  return getUcPresetPrompt(settings.model, settings.ucPreset);
}

/**
 * 为提示词追加固定后缀
 * @param prompt 原提示词
 * @param suffix 固定后缀
 * @returns 拼接后的提示词
 */
function appendPromptSuffix(prompt: string, suffix: string): string {
  const trimmedPrompt = prompt.trim();
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) return trimmedPrompt;
  if (!trimmedPrompt) return trimmedSuffix;
  return trimmedPrompt.endsWith(trimmedSuffix) ? trimmedPrompt : `${trimmedPrompt}, ${trimmedSuffix}`;
}

/**
 * 为提示词追加固定前缀
 * @param prompt 原提示词
 * @param prefix 固定前缀
 * @returns 拼接后的提示词
 */
function appendPromptPrefix(prompt: string, prefix: string): string {
  const trimmedPrompt = prompt.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedPrefix) return trimmedPrompt;
  if (!trimmedPrompt) return trimmedPrefix;
  return trimmedPrompt.startsWith(trimmedPrefix) ? trimmedPrompt : `${trimmedPrefix}, ${trimmedPrompt}`;
}

/**
 * 从提示词尾部剥离固定后缀
 * @param prompt 原提示词
 * @param suffix 固定后缀
 * @returns 剥离后的提示词
 */
function stripPromptSuffix(prompt: string, suffix: string): string {
  const trimmedPrompt = prompt.trim();
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) return trimmedPrompt;
  if (trimmedPrompt === trimmedSuffix) return '';
  const trailing = `, ${trimmedSuffix}`;
  return trimmedPrompt.endsWith(trailing) ? trimmedPrompt.slice(0, -trailing.length).trim() : trimmedPrompt;
}

/**
 * 从提示词头部剥离固定前缀
 * @param prompt 原提示词
 * @param prefix 固定前缀
 * @returns 剥离后的提示词
 */
function stripPromptPrefix(prompt: string, prefix: string): string {
  const trimmedPrompt = prompt.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedPrefix) return trimmedPrompt;
  if (trimmedPrompt === trimmedPrefix) return '';
  const leading = `${trimmedPrefix}, `;
  return trimmedPrompt.startsWith(leading) ? trimmedPrompt.slice(leading.length).trim() : trimmedPrompt;
}
