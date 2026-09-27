import type { CosmosVisionSettings } from '@/constants/novelai';
import type { ImagePromptPreset } from '@/constants/image-prompt';
import {
  resolveEditedUseCharacterCoords,
  toCharacterDraft,
  toCharacterPromptItem,
  type InlineCharacterPromptDraft,
} from '@/composables/inlineEditableCharacterPrompt';
import {
  cloneInlinePromptSnapshot,
  type InlinePromptParts,
  type InlinePromptSnapshot,
} from '@/composables/inlineImageLightbox';
import {
  getImagePromptPreset,
  resolveImagePromptPreset,
  stripImagePromptPresetText,
} from '@/services/image-prompt/presets';
import { buildNovelAIFinalPromptsFromEditable, readNovelAIEditablePrompts } from '@/services/novelai/prompt-presets';

/** 编辑 TAG 后的正负与角色提示词（含各侧实际使用的预设 ID） */
export interface EditablePromptPairValue {
  positive: string;
  negative: string;
  characters: InlineCharacterPromptDraft[];
  /** 正面实际使用预设 ID；'' = 原提示词*/
  positivePresetId: string;
  /** 负面实际使用预设 ID；'' = 原提示词*/
  negativePresetId: string;
}

/**
 * 读取编辑弹窗默认展示的提示词与预设选择
 * 快照有 parts 用 parts；旧快照回退为剥质量词整串 + 原样（presetId = ''）
 * @param settings 扩展设置
 * @param snapshot 当前图片保存的提示词快照
 * @returns 可直接显示在编辑弹窗中的正负与角色提示词
 */
export function readEditablePromptInput(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
): EditablePromptPairValue {
  const parts = readSnapshotPromptParts(settings, snapshot);
  return {
    positive: parts.positive.core,
    negative: parts.negative.core,
    characters: (snapshot.novelai?.characterPrompts ?? []).map(toCharacterDraft),
    positivePresetId: parts.positive.presetId,
    negativePresetId: parts.negative.presetId,
  };
}

/**
 * 判断是否为未修改内容的旧快照提交
 * @param snapshot 原始快照
 * @param prompts 编辑弹窗提交的值
 * @returns 是否未修改
 */
function isUnmodifiedLegacySnapshot(snapshot: InlinePromptSnapshot, prompts: EditablePromptPairValue): boolean {
  if (snapshot.promptParts) return false;
  const legacyPositive = snapshot.comfyui?.positivePrompt ?? snapshot.positivePrompt ?? '';
  const legacyNegative = snapshot.comfyui?.negativePrompt ?? snapshot.negativePrompt ?? '';
  return (
    prompts.positive === legacyPositive &&
    prompts.negative === legacyNegative &&
    !prompts.positivePresetId &&
    !prompts.negativePresetId
  );
}

/**
 * 创建替换正负与角色提示词后的快照
 * 以 parts（core + presetId）重建最终串并写入新 parts，切换预设不会还原 core；
 * ComfyUI 分支仅更新 promptParts，不动最终串与 comfyui 最终串，由紧随的异步重生成写入。
 * @param settings 扩展设置
 * @param snapshot 原提示词快照
 * @param prompts 编辑结果
 * @returns 更新后的提示词快照
 */
export function createEditedPromptSnapshot(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
  prompts: EditablePromptPairValue,
): InlinePromptSnapshot {
  const edited = cloneInlinePromptSnapshot(snapshot);
  const promptParts = {
    positive: { core: prompts.positive, presetId: prompts.positivePresetId },
    negative: { core: prompts.negative, presetId: prompts.negativePresetId },
  };

  if (edited.novelai) {
    const positivePrompt = resolveEditedImagePrompt(settings.imagePromptPresets.positive, promptParts.positive);
    const negativePrompt = resolveEditedImagePrompt(settings.imagePromptPresets.negative, promptParts.negative);
    edited.promptParts = promptParts;
    const base = buildNovelAIFinalPromptsFromEditable(settings.novelai, { positivePrompt, negativePrompt });
    const characterPrompts = prompts.characters.map(toCharacterPromptItem);
    edited.positivePrompt = base.positivePrompt;
    edited.negativePrompt = base.negativePrompt;
    Object.assign(edited.novelai, base, {
      characterPrompts,
      useCharacterCoords: resolveEditedUseCharacterCoords(
        characterPrompts.length,
        snapshot.novelai?.useCharacterCoords,
        settings.novelai.autoCharacterCoords,
        settings.novelai.model,
      ),
    });
    return edited;
  }

  // ComfyUI 分支：旧快照未修改保持无 parts 原样回放语义；修改或已有 parts 则更新 promptParts
  if (!isUnmodifiedLegacySnapshot(snapshot, prompts)) {
    edited.promptParts = promptParts;
  }
  return edited;
}

/**
 * 读取快照的提示词部件
 * 新链路快照直接用 parts；旧快照回退为剥质量词整串 + 原样（presetId = ''）
 * @param settings 扩展设置
 * @param snapshot 提示词快照
 * @returns 正负两侧部件
 */
function readSnapshotPromptParts(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
): { positive: InlinePromptParts; negative: InlinePromptParts } {
  if (snapshot.promptParts) return snapshot.promptParts;
  const fallback = snapshot.novelai
    ? readNovelAIEditablePrompts(settings.novelai, snapshot.novelai)
    : { positivePrompt: snapshot.positivePrompt, negativePrompt: snapshot.negativePrompt };
  return {
    positive: { core: fallback.positivePrompt, presetId: '' },
    negative: { core: fallback.negativePrompt, presetId: '' },
  };
}

/**
 * 构建编辑弹窗中展示的整体文本
 * presetId 为空时返回 core 本身；否则使用对应预设模板包裹 core
 * @param presets 单侧预设列表
 * @param presetId 预设 ID；为空表示原样
 * @param core 核心提示词
 * @returns 弹窗展示的整体文本
 */
export function buildEditableDisplayText(
  presets: readonly ImagePromptPreset[],
  presetId: string,
  core: string,
): string {
  if (!presetId) return core;
  return resolveImagePromptPreset(getImagePromptPreset(presets, presetId), core);
}

/**
 * 从用户编辑的整体文本中精确剥离预设模板
 * 预设存在且成功剥离模板时保留 presetId；若模板被改动导致剥离失败，则回退为原样语义（presetId = ''，core = 用户整串）
 * @param presets 单侧预设列表
 * @param presetId 选中的预设 ID；为空表示原样
 * @param text 用户编辑后的整体文本
 * @returns 剥离后的核心提示词与实际生效的预设 ID
 */
export function resolveStrippedPromptPart(
  presets: readonly ImagePromptPreset[],
  presetId: string,
  text: string,
): InlinePromptParts {
  if (!presetId || !presets.length) return { core: text, presetId: '' };
  const preset = getImagePromptPreset(presets, presetId);
  const stripped = stripImagePromptPresetText(text, preset);
  if (stripped !== null) return { core: stripped, presetId };
  return { core: text, presetId: '' };
}

/**
 * 按 parts 重建单侧最终串
 * presetId 为空表示原样（不套模板）；否则用该预设占位符包裹 core
 * @param presets 单侧预设列表
 * @param parts 单侧部件
 * @returns 重建后的最终串
 */
export function resolveEditedImagePrompt(presets: readonly ImagePromptPreset[], parts: InlinePromptParts): string {
  return buildEditableDisplayText(presets, parts.presetId, parts.core);
}
