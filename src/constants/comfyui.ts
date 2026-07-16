import type { ImagePromptPresetReferences } from '@/constants/image-prompt';
import defaultComfyUIWorkflowJson from './default-comfyui-workflow.json?raw';

/** 图像生成来源 */
export const IMAGE_SOURCES = [
  { value: 'novelai', label: 'NovelAI' },
  { value: 'comfyui', label: 'ComfyUI' },
] as const;

/** ComfyUI 可用的最大安全 seed */
export const COMFYUI_MAX_SEED = Number.MAX_SAFE_INTEGER;

/**
 * width/height 常用尺寸（对齐 NAI 分辨率预设轴值去重）
 * 不 import novelai，避免循环依赖
 */
export const COMFYUI_DIMENSION_PRESETS: number[] = [
  512, 640, 768, 832, 1024, 1088, 1216, 1472, 1536, 1920,
];

export const DEFAULT_COMFYUI_LORA_PRESET_ID = 'comfyui-lora-default-preset';
export const DEFAULT_COMFYUI_LORA_PRESET_NAME = '默认 LoRA 组';
export const DEFAULT_COMFYUI_WORKFLOW_PRESET_ID = 'comfyui-workflow-default';
export const DEFAULT_COMFYUI_WORKFLOW_PRESET_NAME = '默认工作流';

/** ComfyUI 默认工作流
 * 来自 https://github.com/willmiao/ComfyUI-Lora-Manager 的示例模板
 */
export const DEFAULT_COMFYUI_WORKFLOW_JSON = defaultComfyUIWorkflowJson.trim();

/**
 * 创建默认 ComfyUI LoRA 设置
 * @returns 可安全修改的默认 LoRA 列表
 */
export function createDefaultComfyUILoraSettings(): ComfyUILoraSetting[] {
  return [];
}

/** 图像来源类型 */
export type ImageSource = (typeof IMAGE_SOURCES)[number]['value'];

/** ComfyUI LoRA 覆盖条目 */
export interface ComfyUILoraSetting {
  id: string;
  name: string;
  strength: number;
  enabled: boolean;
}

/** ComfyUI LoRA 预设组 */
export interface ComfyUILoraPreset {
  id: string;
  name: string;
  loras: ComfyUILoraSetting[];
}

/** ComfyUI LoRA 预设组集合 */
export interface ComfyUILoraPresetSettings {
  activePresetId: string;
  presets: ComfyUILoraPreset[];
}

/** ComfyUI 工作流预设 */
export interface ComfyUIWorkflowPreset {
  id: string;
  name: string;
  workflowJson: string;
}

/** ComfyUI 工作流预设集合 */
export interface ComfyUIWorkflowPresetSettings {
  activePresetId: string;
  presets: ComfyUIWorkflowPreset[];
}

/**
 * 创建 ComfyUI 工作流预设
 * @param id 预设 ID
 * @param name 预设名称
 * @param workflowJson 工作流 JSON
 * @returns 工作流预设
 */
export function createComfyUIWorkflowPreset(
  id: string,
  name: string,
  workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON,
): ComfyUIWorkflowPreset {
  return { id, name, workflowJson };
}

/**
 * 创建默认 ComfyUI 工作流预设集合
 * @returns 工作流预设集合
 */
export function createComfyUIWorkflowPresetSettings(): ComfyUIWorkflowPresetSettings {
  const preset = createComfyUIWorkflowPreset(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID, DEFAULT_COMFYUI_WORKFLOW_PRESET_NAME);
  return { activePresetId: preset.id, presets: [preset] };
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

/**
 * 创建单个 ComfyUI LoRA 预设组
 * @param id 预设组 ID
 * @param name 预设组名称
 * @param loras 预设组内的 LoRA 列表
 * @returns LoRA 预设组
 */
export function createComfyUILoraPreset(
  id: string,
  name: string,
  loras: ComfyUILoraSetting[] = createDefaultComfyUILoraSettings(),
): ComfyUILoraPreset {
  return {
    id,
    name,
    loras: loras.map(lora => ({ ...lora })),
  };
}

/**
 * 创建默认 ComfyUI LoRA 预设组集合
 * @param id 默认预设组 ID
 * @param name 默认预设组名称
 * @returns LoRA 预设组集合
 */
export function createComfyUILoraPresetSettings(
  id = DEFAULT_COMFYUI_LORA_PRESET_ID,
  name = DEFAULT_COMFYUI_LORA_PRESET_NAME,
): ComfyUILoraPresetSettings {
  const preset = createComfyUILoraPreset(id, name);
  return {
    activePresetId: preset.id,
    presets: [preset],
  };
}

/** ComfyUI 子设置：当前工作流预设为参数唯一来源 */
export interface ComfyUISettings extends ImagePromptPresetReferences {
  url: string;
  workflowPresets: ComfyUIWorkflowPresetSettings;
  loraPresets: ComfyUILoraPresetSettings;
}
