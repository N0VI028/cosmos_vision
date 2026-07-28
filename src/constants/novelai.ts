import type { ComfyUISettings, ImageSource } from '@/constants/comfyui';
import type { ImagePromptPresetReferences, ImagePromptPresetSettings } from '@/constants/image-prompt';
import type { NovelAIVibePresetSettings } from '@/constants/novelai-vibe';
import type { PromptLlmMessagePresetSettings, PromptLlmSettings, PromptProfilesSettings } from '@/constants/prompt-llm';

export * from './prompt-llm';

/**
 * NovelAI 设置静态枚举与默认值
 * 集中维护模型列表与默认设置,供 store 初始化与 UI 下拉使用
 */

/** NovelAI 模型固定列表(本期不开放自定义) */
export const NOVELAI_MODELS = [
  { value: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion v4.5 Curated' },
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion v4.5 Full' },
  { value: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion v4 Curated' },
  { value: 'nai-diffusion-4-full', label: 'NAI Diffusion v4 Full' },
  { value: 'nai-diffusion-3', label: 'NAI Diffusion Anime v3' },
  { value: 'nai-diffusion-furry-3', label: 'NAI Diffusion Furry v3' },
] as const;

/** NovelAI 采样器固定列表 */
export const NOVELAI_SAMPLERS = [
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim', label: 'DDIM' },
] as const;

/** NovelAI 通用噪声调度固定列表 */
export const NOVELAI_NOISE_SCHEDULES = [
  { value: 'karras', label: 'karras（推荐）' },
  { value: 'exponential', label: 'exponential' },
  { value: 'polyexponential', label: 'polyexponential' },
] as const;

/** NovelAI V3 噪声调度固定列表 */
export const NOVELAI_V3_NOISE_SCHEDULES = [
  { value: 'native', label: 'native' },
  ...NOVELAI_NOISE_SCHEDULES,
] as const;

/** NovelAI 负向提示词程度固定列表 */
export const NOVELAI_UC_PRESETS = [
  { value: 'Heavy', label: '重度' },
  { value: 'Light', label: '轻度' },
  { value: 'None', label: '无' },
] as const;

/** NovelAI 图像尺寸预设(对齐 nai-webui) */
export const NOVELAI_RESOLUTION_PRESETS = [
  { value: 'normal-portrait', label: 'Normal Portrait (832x1216)', width: 832, height: 1216 },
  { value: 'normal-landscape', label: 'Normal Landscape (1216x832)', width: 1216, height: 832 },
  { value: 'normal-square', label: 'Normal Square (1024x1024)', width: 1024, height: 1024 },
  { value: 'large-portrait', label: 'Large Portrait (1024x1536)', width: 1024, height: 1536 },
  { value: 'large-landscape', label: 'Large Landscape (1536x1024)', width: 1536, height: 1024 },
  { value: 'large-square', label: 'Large Square (1472x1472)', width: 1472, height: 1472 },
  { value: 'wallpaper-portrait', label: 'Wallpaper Portrait (1088x1920)', width: 1088, height: 1920 },
  { value: 'wallpaper-landscape', label: 'Wallpaper Landscape (1920x1088)', width: 1920, height: 1088 },
  { value: 'small-portrait', label: 'Small Portrait (512x768)', width: 512, height: 768 },
  { value: 'small-landscape', label: 'Small Landscape (768x512)', width: 768, height: 512 },
  { value: 'small-square', label: 'Small Square (640x640)', width: 640, height: 640 },
] as const;

export const NOVELAI_CUSTOM_RESOLUTION_PRESET = 'custom';
export const NOVELAI_IMAGE_SIZE_LIMITS = { min: 64, max: 2048, step: 64 } as const;
export const NOVELAI_IMAGE_COUNT_LIMITS = { min: 1, max: 4 } as const;
/** NovelAI seed 最大值，按 32 位无符号整数处理 */
export const NOVELAI_MAX_SEED = 4294967295;
export const NOVELAI_DEFAULT_URL = 'https://image.novelai.net';
export const NOVELAI_DEFAULT_ACCOUNT_ID = 'novelai-account-1';

/** NovelAI 路由模式固定列表 */
export const NOVELAI_ROUTING_MODES = [
  { value: 'sequential', label: '顺序使用' },
  { value: 'load_balance', label: '负载均衡' },
] as const;

/** NovelAI 模型 value 联合类型 */
export type NovelAIModel = (typeof NOVELAI_MODELS)[number]['value'];

/** NovelAI 采样器 value 联合类型 */
export type NovelAISampler = (typeof NOVELAI_SAMPLERS)[number]['value'];

/** NovelAI 噪声调度 value 联合类型 */
export type NovelAINoiseSchedule = (typeof NOVELAI_V3_NOISE_SCHEDULES)[number]['value'];

/** NovelAI 负向提示词程度 value 联合类型 */
export type NovelAIUcPreset = (typeof NOVELAI_UC_PRESETS)[number]['value'];

/** NovelAI 图像尺寸预设 value 联合类型 */
export type NovelAIResolutionPreset =
  | (typeof NOVELAI_RESOLUTION_PRESETS)[number]['value']
  | typeof NOVELAI_CUSTOM_RESOLUTION_PRESET;

/** NovelAI 路由模式 value 联合类型 */
export type NovelAIRoutingMode = (typeof NOVELAI_ROUTING_MODES)[number]['value'];

/**
 * 判断是否为 NovelAI V3 模型
 * @param model NovelAI 模型
 * @returns 是否为 V3 模型
 */
export function isNovelAIV3Model(model: NovelAIModel): boolean {
  return model.includes('diffusion-3') || model.includes('diffusion-furry-3');
}

/**
 * 判断是否为 NovelAI V4 模型
 * @param model NovelAI 模型
 * @returns 是否为 V4 或 V4.5 模型
 */
export function isNovelAIV4Model(model: NovelAIModel): boolean {
  return model.startsWith('nai-diffusion-4');
}

/**
 * 判断是否为 NovelAI V4.5 模型
 * @param model NovelAI 模型
 * @returns 是否为 V4.5 模型
 */
export function isNovelAIV45Model(model: NovelAIModel): boolean {
  return model.startsWith('nai-diffusion-4-5');
}

/**
 * 判断是否为 NovelAI V4 旧模型
 * @param model NovelAI 模型
 * @returns 是否为不含 V4.5 的 V4 模型
 */
export function isNovelAIV4OnlyModel(model: NovelAIModel): boolean {
  return isNovelAIV4Model(model) && !isNovelAIV45Model(model);
}

/**
 * NovelAI 订阅档位映射
 * tier 数字 → 档位标签 + 主题强调色,供订阅卡片展示
 */
export const NOVELAI_TIERS = [
  { tier: 0, label: '纸张', accent: '#c9d1e0' },
  { tier: 1, label: '石板', accent: '#60a5fa' },
  { tier: 2, label: '卷轴', accent: '#a78bfa' },
  { tier: 3, label: '巨著', accent: '#f5b942' },
] as const;

/** NovelAI 订阅档位标签联合类型 */
export type NovelAITierLabel = (typeof NOVELAI_TIERS)[number]['label'];

/** NovelAI 账号条目 */
export interface NovelAIAccount {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  enabled: boolean;
}

/** NovelAI 子设置 */
export interface NovelAISettings extends ImagePromptPresetReferences {
  accounts: NovelAIAccount[];
  routingMode: NovelAIRoutingMode;
  corsProxy: string;
  novelAIVibePresets: NovelAIVibePresetSettings;
  model: NovelAIModel;
  resolutionPreset: NovelAIResolutionPreset;
  width: number;
  height: number;
  steps: number;
  imageCount: number;
  guidance: number;
  sampler: NovelAISampler;
  seed: number | null;
  autoSampler: boolean;
  varietyPlus: boolean;
  smea: boolean;
  smeaDyn: boolean;
  decrisp: boolean;
  legacyPromptMode: boolean;
  promptGuidanceRescale: number;
  noiseSchedule: NovelAINoiseSchedule;
  addQualityTags: boolean;
  ucPreset: NovelAIUcPreset;
  /** 是否让 NovelAI 自动安排多角色坐标 */
  autoCharacterCoords: boolean;
}

/** NovelAI 角色提示词条目 */
export interface CharacterPromptItem {
  positivePrompt: string;
  negativePrompt: string;
  position: { x: number; y: number };
}

/**
 * 创建 NovelAI 账号条目
 * @param id 账号 id
 * @param url NovelAI URL
 * @param apiKey NovelAI API Key
 * @param name 账号名称
 * @returns 账号条目
 */
export function createNovelAIAccount(id: string, url = NOVELAI_DEFAULT_URL, apiKey = '', name = ''): NovelAIAccount {
  return { id, name, url, apiKey, enabled: true };
}

/** CosmosVision 顶层设置(持久化到 ST extension_settings) */
export interface CosmosVisionSettings {
  enabled: boolean;
  temporaryImageLimit: number;
  imageSource: ImageSource;
  imagePromptPresets: ImagePromptPresetSettings;
  novelai: NovelAISettings;
  comfyui: ComfyUISettings;
  promptLlm: PromptLlmSettings;
  promptLlmMessagePresets: PromptLlmMessagePresetSettings;
  promptProfiles: PromptProfilesSettings;
}
