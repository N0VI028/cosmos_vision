import type { NovelAIModel } from '@/constants/novelai';

/**
 * 随机预设池
 * 池成员引用现有提示词预设 ID，按条件触发后合并去重随机抽一个预设
 */

/** 随机池触发模式 */
export const RANDOM_PRESET_POOL_TRIGGER_MODES = ['always', 'model', 'workflow'] as const;

/** 随机池触发模式 */
export type RandomPresetPoolTriggerMode = (typeof RANDOM_PRESET_POOL_TRIGGER_MODES)[number];

/** 随机池范围（lora 仅 ComfyUI，引用 settings.comfyui.loraPresets.presets 的预设组 ID） */
export const RANDOM_PRESET_POOL_SIDES = ['positive', 'negative', 'lora'] as const;

/** 随机池范围 */
export type RandomPresetPoolSide = (typeof RANDOM_PRESET_POOL_SIDES)[number];

/** 随机预设池 */
export interface RandomPresetPool {
  id: string;
  name: string;
  side: RandomPresetPoolSide;
  enabled: boolean;
  /** always 两源通吃；model 仅 NovelAI；workflow 仅 ComfyUI */
  triggerMode: RandomPresetPoolTriggerMode;
  /** model 模式：命中的 NovelAI 模型列表 */
  triggerModels: NovelAIModel[];
  /** workflow 模式：命中的 ComfyUI 工作流预设 ID */
  triggerWorkflowIds: string[];
  /** 引用的该侧预设 ID（lora 侧为 ComfyUI LoRA 预设组 ID） */
  presetIds: string[];
}

/** 随机预设池设置 */
export interface RandomPresetPoolSettings {
  /** 随机预设池总开关 */
  enabled: boolean;
  pools: RandomPresetPool[];
}

/**
 * 创建随机预设池
 * @param id 池 id
 * @param overrides 需覆写的字段
 * @returns 随机预设池
 */
export function createRandomPresetPool(
  id: string,
  overrides: Partial<Omit<RandomPresetPool, 'id'>> = {},
): RandomPresetPool {
  return {
    id,
    name: '',
    side: 'positive',
    enabled: true,
    triggerMode: 'always',
    triggerModels: [],
    triggerWorkflowIds: [],
    presetIds: [],
    ...overrides,
  };
}

/**
 * 创建默认随机预设池设置（空池，总开关默认关闭）
 * @returns 随机预设池设置
 */
export function createRandomPresetPoolSettings(): RandomPresetPoolSettings {
  return { enabled: false, pools: [] };
}
