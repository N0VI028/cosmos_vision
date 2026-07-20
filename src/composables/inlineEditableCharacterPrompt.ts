import { isNovelAIV4Model, type CharacterPromptItem, type NovelAIModel } from '@/constants/novelai';

/** 编辑 TAG 弹窗中的角色提示词草稿 */
export interface InlineCharacterPromptDraft {
  positivePrompt: string;
  negativePrompt: string;
  x: number;
  y: number;
}

/**
 * 判断当前 NovelAI 模型是否支持编辑角色提示词
 * @param model NovelAI 模型
 * @returns 是否支持角色提示词
 */
export function canEditInlineCharacterPrompts(model: NovelAIModel): boolean {
  return isNovelAIV4Model(model);
}

/**
 * 将快照角色提示词转为编辑草稿
 * @param item 角色提示词
 * @returns 编辑草稿
 */
export function toCharacterDraft(item: CharacterPromptItem): InlineCharacterPromptDraft {
  return {
    positivePrompt: item.positivePrompt,
    negativePrompt: item.negativePrompt,
    x: item.position.x,
    y: item.position.y,
  };
}

/**
 * 编辑草稿转 NovelAI 角色提示词
 * @param draft 编辑草稿
 * @returns 角色提示词
 */
export function toCharacterPromptItem(draft: InlineCharacterPromptDraft): CharacterPromptItem {
  return {
    positivePrompt: draft.positivePrompt,
    negativePrompt: draft.negativePrompt,
    position: {
      x: clampCharacterCoordinate(draft.x),
      y: clampCharacterCoordinate(draft.y),
    },
  };
}

/**
 * 解析编辑后是否使用手动坐标（沿用原快照策略，仅在角色数不足时关闭）
 * @param count 角色数
 * @param previous 原快照 useCharacterCoords
 * @param autoCharacterCoords 设置页自动坐标开关
 * @returns 是否手动坐标
 */
export function resolveEditedUseCharacterCoords(
  count: number,
  previous: boolean | undefined,
  autoCharacterCoords: boolean,
): boolean {
  if (count < 2) return false;
  return previous ?? !autoCharacterCoords;
}

/**
 * 将角色坐标夹到 0–1
 * @param value 坐标
 * @returns 合法坐标
 */
function clampCharacterCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
