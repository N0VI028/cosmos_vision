import type {
  NovelAIModel,
  NovelAINoiseSchedule,
  NovelAIQualityPreset,
  NovelAISampler,
  NovelAISettings,
  NovelAIUcPreset,
  CharacterPromptItem,
} from '@/constants/novelai';
import {
  canPositionOneCharacter,
  isNovelAIV3Model,
  isNovelAIV45Model,
  isNovelAIV4OnlyModel,
  isNovelAIV4OrNewer,
  isNovelAIV5Model,
} from '@/constants/novelai';
import { getUcPresetValue } from './prompt-presets';
import type { NovelAIFinalPrompts } from './types';

const REFERENCE_PIXEL_COUNT = 1011712;
const SIGMA_MAGIC_NUMBER_V3_V4 = 19;
const SIGMA_MAGIC_NUMBER_V4_5 = 58;
const GRID_COORDS = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

export interface NovelAIPayload {
  action: 'generate';
  input: string;
  model: string;
  parameters: Record<string, unknown>;
  use_new_shared_trial: boolean;
}

/**
 * 将角色坐标转换为官方 NovelAI 坐标 (0.1 ~ 0.9)
 * 约定：0~4 的整数视为 5 点网格索引（对齐官网 [0.1,0.3,0.5,0.7,0.9]）；
 * 其余浮点视为 0-1 连续坐标（V5），>1 的遗留值按旧网格除以 4 归一化。
 * @param v 原始坐标（0-4 网格索引或 0-1 浮点数）
 * @returns 官方归一化坐标
 */
export function toNovelAICoordinate(v: number): number {
  if (Number.isInteger(v) && v >= 0 && v <= 4) {
    return GRID_COORDS[v as 0 | 1 | 2 | 3 | 4];
  }
  const normalized = v > 1 ? v / 4 : v;
  const clamped = Math.min(1, Math.max(0, normalized));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * 获取 tag_hint_uc_preset 数值
 * None: 0, Heavy: 2, Light: 3, Human_Focus: 4, Furry_Focus: 5
 * @param preset 负面预设
 * @returns 预设数字
 */
export function getTagHintUcPreset(preset: NovelAIUcPreset): number {
  switch (preset) {
    case 'None':
      return 0;
    case 'Heavy':
      return 2;
    case 'Light':
      return 3;
    case 'Human_Focus':
      return 4;
    case 'Furry_Focus':
      return 5;
    default:
      return 2;
  }
}

/**
 * 获取 tag_hint_qt 数值 (None:0, Standard:1, Light:3)
 * @param preset 质量预设
 * @returns 预设数字
 */
export function getTagHintQt(preset: NovelAIQualityPreset): number {
  if (preset === 'Light') return 3;
  if (preset === 'Standard') return 1;
  return 0;
}

/**
 * 决定是否让 NovelAI 使用手动坐标
 * @param count 有效角色数
 * @param auto 自动坐标开关（true = "让 AI 决定"，此时禁用手动坐标，对齐官网 characterPromptsGlobalAiChoice）
 * @param model 当前模型
 * @returns use_coords 请求值
 */
export function resolveUseCoords(count: number, auto: unknown, model: NovelAIModel): boolean {
  if (auto === true || count === 0) return false;
  if (count === 1) return canPositionOneCharacter(model);
  return count >= 2;
}

/**
 * 构建 NovelAI 官方请求体
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @param imageCount 请求图片数
 * @returns 官方 API payload
 */
export function buildPayload(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  seed: number,
  imageCount: number,
): NovelAIPayload {
  return {
    action: 'generate',
    input: prompts.positivePrompt,
    model: settings.model,
    parameters: buildParameters(settings, prompts, seed, imageCount),
    use_new_shared_trial: true,
  };
}

/**
 * 构建 NovelAI parameters 字段(对齐 nai-webui 文生图实现)
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @param imageCount 请求图片数
 * @returns 官方 parameters
 */
export function buildParameters(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  seed: number,
  imageCount: number,
): Record<string, unknown> {
  const parameters = createBaseParameters(settings, prompts, seed, imageCount);
  if (isNovelAIV3Model(settings.model)) applyV3Parameters(parameters, settings);
  if (isNovelAIV4OrNewer(settings.model)) {
    applyV4Prompts(parameters, prompts, settings.autoCharacterCoords, settings.model);
  }
  if (!isNovelAIV5Model(settings.model) && prompts.vibeParameters) {
    Object.assign(parameters, prompts.vibeParameters);
  }
  return parameters;
}

/**
 * 构建 NovelAI parameters 基础字段
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @param imageCount 请求图片数
 * @returns 官方 parameters 基础对象
 */
export function createBaseParameters(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  seed: number,
  imageCount: number,
): Record<string, unknown> {
  const isV5 = isNovelAIV5Model(settings.model);
  const isQtEnabled = settings.qualityPreset !== 'None';
  const promptCount = prompts.characterPrompts?.length ?? 0;
  const useCoords =
    prompts.useCharacterCoords ?? resolveUseCoords(promptCount, settings.autoCharacterCoords, settings.model);

  const parameters: Record<string, unknown> = {
    params_version: 4,
    width: settings.width,
    height: settings.height,
    scale: settings.guidance,
    sampler: getEffectiveSampler(settings),
    steps: settings.steps,
    n_samples: imageCount,
    qualityPresetId: (settings.qualityPreset || 'none').toLowerCase(),
    ucPresetId: (settings.ucPreset || 'Heavy').toLowerCase(),
    autoSmea: false,
    controlnet_strength: 1,
    add_original_image: true,
    cfg_rescale: settings.promptGuidanceRescale,
    noise_schedule: getEffectiveNoiseSchedule(settings),
    legacy_v3_extend: false,
    legacy_uc: false,
    use_coords: useCoords,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    seed,
    characterPrompts: [],
    negative_prompt: prompts.negativePrompt,
    tag_hint_qt: getTagHintQt(settings.qualityPreset),
    tag_hint_uc_preset: getTagHintUcPreset(settings.ucPreset),
    deliberate_euler_ancestral_bug: false,
    prefer_brownian: true,
    ...createModelCompatibilityParameters(settings),
  };

  if (isV5) {
    parameters.straight_alpha = true;
  } else {
    parameters.ucPreset = getUcPresetValue(settings.ucPreset, settings.model);
    parameters.qualityToggle = isQtEnabled;
  }
  return parameters;
}

/**
 * 构建 NovelAI 模型兼容字段
 * @param settings NovelAI 设置页参数
 * @returns 与模型能力相关的 parameters 字段
 */
export function createModelCompatibilityParameters(settings: NovelAISettings): Record<string, unknown> {
  if (isNovelAIV5Model(settings.model)) {
    return { dynamic_thresholding: false, legacy: false, deliberate_euler_ancestral_bug: false };
  }
  const legacy = isNovelAIV4OnlyModel(settings.model) && settings.legacyPromptMode;
  const compatibility: Record<string, unknown> = {
    dynamic_thresholding: isNovelAIV3Model(settings.model) && settings.decrisp,
    legacy,
    deliberate_euler_ancestral_bug: false,
  };
  const skipCfg = calculateSkipCfgAboveSigma(settings);
  if (skipCfg !== null) {
    compatibility.skip_cfg_above_sigma = skipCfg;
  }
  return compatibility;
}

/**
 * 写入 V3 专属 NovelAI 参数
 * @param parameters 官方 parameters
 * @param settings NovelAI 设置页参数
 */
export function applyV3Parameters(parameters: Record<string, unknown>, settings: NovelAISettings): void {
  parameters.sm = settings.smea;
  parameters.sm_dyn = settings.smea && settings.smeaDyn;
}

/**
 * 写入 V4/V4.5/V5 提示词结构
 * @param parameters 官方 parameters
 * @param prompts 最终提示词
 * @param autoCharacterCoords 自动坐标开关
 * @param model 当前模型
 */
export function applyV4Prompts(
  parameters: Record<string, unknown>,
  prompts: NovelAIFinalPrompts,
  autoCharacterCoords: boolean,
  model: NovelAIModel,
): void {
  const promptCharacters = prompts.characterPrompts ?? [];
  const charCaptions: Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> = [];
  const charNegativeCaptions: Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> = [];
  const characterPromptsArray: Array<{
    prompt: string;
    uc: string;
    center: { x: number; y: number };
    enabled: boolean;
  }> = [];

  for (const item of promptCharacters) {
    const center = {
      x: toNovelAICoordinate(item.position.x),
      y: toNovelAICoordinate(item.position.y),
    };
    const positive = item.positivePrompt?.trim() || '';
    const negative = item.negativePrompt?.trim() || '';

    if (positive) {
      charCaptions.push({
        char_caption: positive,
        centers: [center],
      });
    }
    if (negative) {
      charNegativeCaptions.push({
        char_caption: negative,
        centers: [center],
      });
    }
    characterPromptsArray.push({
      prompt: positive,
      uc: negative,
      center,
      enabled: true,
    });
  }

  const useCoords = prompts.useCharacterCoords ?? resolveUseCoords(promptCharacters.length, autoCharacterCoords, model);
  parameters.characterPrompts = characterPromptsArray;
  parameters.use_coords = useCoords;
  parameters.v4_prompt = {
    caption: { base_caption: prompts.positivePrompt, char_captions: charCaptions },
    use_coords: useCoords,
    use_order: true,
  };
  parameters.v4_negative_prompt = {
    caption: { base_caption: prompts.negativePrompt, char_captions: charNegativeCaptions },
    use_coords: useCoords,
    use_order: true,
    legacy_uc: false,
  };
}

/**
 * 将内部角色条目转换为 NovelAI V4/V5 字段
 * @param item 角色提示词
 * @returns 参数与正负 caption
 */
export function createV4CharacterPrompt(item: CharacterPromptItem) {
  const center = {
    x: toNovelAICoordinate(item.position.x),
    y: toNovelAICoordinate(item.position.y),
  };
  const positive = item.positivePrompt?.trim() || '';
  const negative = item.negativePrompt?.trim() || '';
  return {
    parameter: { prompt: positive, uc: negative, center, enabled: true },
    positiveCaption: { char_caption: positive, centers: [center] },
    negativeCaption: { char_caption: negative, centers: [center] },
  };
}

/**
 * 读取实际发送的采样器
 * V3 Auto 模式按 nai-webui 逻辑使用 Euler Ancestral
 * @param settings NovelAI 设置页参数
 * @returns 实际发送的 sampler
 */
export function getEffectiveSampler(settings: NovelAISettings): NovelAISampler {
  return isNovelAIV3Model(settings.model) && settings.autoSampler ? 'k_euler_ancestral' : settings.sampler;
}

/**
 * 读取实际发送的噪声调度
 * native 仅 V3 支持，其他模型自动回退 karras
 * @param settings NovelAI 设置页参数
 * @returns 实际发送的噪声调度
 */
export function getEffectiveNoiseSchedule(settings: NovelAISettings): NovelAINoiseSchedule {
  return !isNovelAIV3Model(settings.model) && settings.noiseSchedule === 'native' ? 'karras' : settings.noiseSchedule;
}

/**
 * 计算 Variety+ 的 skip_cfg_above_sigma
 * @param settings NovelAI 设置页参数
 * @returns NovelAI sigma 阈值或 null
 */
export function calculateSkipCfgAboveSigma(settings: NovelAISettings): number | null {
  if (!settings.varietyPlus || (!isNovelAIV3Model(settings.model) && !isNovelAIV45Model(settings.model))) return null;
  const ratio = Math.sqrt((settings.width * settings.height) / REFERENCE_PIXEL_COUNT);
  return ratio * (isNovelAIV45Model(settings.model) ? SIGMA_MAGIC_NUMBER_V4_5 : SIGMA_MAGIC_NUMBER_V3_V4);
}
