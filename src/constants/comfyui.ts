import {
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
  NOVELAI_IMAGE_SIZE_LIMITS,
  NOVELAI_RESOLUTION_PRESETS,
} from '@/constants/novelai';
import type { ImagePromptPresetReferences } from '@/constants/image-prompt';

/** 图像生成来源 */
export const IMAGE_SOURCES = [
  { value: 'novelai', label: 'NovelAI' },
  { value: 'comfyui', label: 'ComfyUI' },
] as const;

/** ComfyUI 复用现有尺寸预设 */
export const COMFYUI_RESOLUTION_PRESETS = NOVELAI_RESOLUTION_PRESETS;
export const COMFYUI_CUSTOM_RESOLUTION_PRESET = NOVELAI_CUSTOM_RESOLUTION_PRESET;
export const COMFYUI_IMAGE_SIZE_LIMITS = NOVELAI_IMAGE_SIZE_LIMITS;

/** ComfyUI KSampler 采样器固定列表 */
export const COMFYUI_SAMPLERS = [
  { value: 'euler', label: 'Euler' },
  { value: 'euler_ancestral', label: 'Euler Ancestral' },
  { value: 'heun', label: 'Heun' },
  { value: 'dpm_2', label: 'DPM2' },
  { value: 'dpm_2_ancestral', label: 'DPM2 Ancestral' },
  { value: 'lms', label: 'LMS' },
  { value: 'dpm_fast', label: 'DPM Fast' },
  { value: 'dpm_adaptive', label: 'DPM Adaptive' },
  { value: 'dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'dpmpp_sde_gpu', label: 'DPM++ SDE GPU' },
  { value: 'dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { value: 'dpmpp_2m_sde_gpu', label: 'DPM++ 2M SDE GPU' },
  { value: 'dpmpp_3m_sde', label: 'DPM++ 3M SDE' },
  { value: 'dpmpp_3m_sde_gpu', label: 'DPM++ 3M SDE GPU' },
  { value: 'ddpm', label: 'DDPM' },
  { value: 'lcm', label: 'LCM' },
  { value: 'ipndm', label: 'IPNDM' },
  { value: 'ipndm_v', label: 'IPNDM V' },
  { value: 'deis', label: 'DEIS' },
  { value: 'ddim', label: 'DDIM' },
  { value: 'uni_pc', label: 'UniPC' },
  { value: 'uni_pc_bh2', label: 'UniPC BH2' },
] as const;

/** ComfyUI 默认采样器 */
export const COMFYUI_DEFAULT_SAMPLER = 'euler_ancestral';

/** ComfyUI seed 模式 */
export const COMFYUI_SEED_MODES = [
  { value: 'random', label: '随机' },
  { value: 'fixed', label: '固定' },
] as const;

/** ComfyUI 可用的最大安全 seed */
export const COMFYUI_MAX_SEED = Number.MAX_SAFE_INTEGER;

/** 图像来源类型 */
export type ImageSource = (typeof IMAGE_SOURCES)[number]['value'];

/** ComfyUI 采样器类型 */
export type ComfyUISampler = (typeof COMFYUI_SAMPLERS)[number]['value'];

/** ComfyUI seed 模式类型 */
export type ComfyUISeedMode = (typeof COMFYUI_SEED_MODES)[number]['value'];

/** ComfyUI 尺寸预设类型 */
export type ComfyUIResolutionPreset =
  | (typeof COMFYUI_RESOLUTION_PRESETS)[number]['value']
  | typeof COMFYUI_CUSTOM_RESOLUTION_PRESET;

/** ComfyUI LoRA 覆盖条目 */
export interface ComfyUILoraSetting {
  id: string;
  name: string;
  strength: number;
  enabled: boolean;
}

/**
 * 创建 ComfyUI LoRA 条目
 * @param id LoRA 条目 ID
 * @param overrides 需要覆写的字段
 * @returns 可写入设置的 LoRA 条目
 */
export function createComfyUILoraSetting(
  id: string,
  overrides: Partial<Omit<ComfyUILoraSetting, 'id'>> = {},
): ComfyUILoraSetting {
  return {
    id,
    name: '',
    strength: 1,
    enabled: true,
    ...overrides,
  };
}

/** ComfyUI 子设置 */
export interface ComfyUISettings extends ImagePromptPresetReferences {
  url: string;
  workflowJson: string;
  checkpointName: string;
  loras: ComfyUILoraSetting[];
  resolutionPreset: ComfyUIResolutionPreset;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: ComfyUISampler;
  seedMode: ComfyUISeedMode;
  seed: number;
}
