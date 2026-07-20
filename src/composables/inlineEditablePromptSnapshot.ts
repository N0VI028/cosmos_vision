import type { NovelAISettings } from '@/constants/novelai';
import {
  resolveEditedUseCharacterCoords,
  toCharacterDraft,
  toCharacterPromptItem,
  type InlineCharacterPromptDraft,
} from '@/composables/inlineEditableCharacterPrompt';
import { cloneInlinePromptSnapshot, type InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  buildNovelAIFinalPromptsFromEditable,
  readNovelAIEditablePrompts,
} from '@/services/novelai/prompt-presets';

/** 编辑 TAG 后的正负与角色提示词 */
export interface EditablePromptPairValue {
  positive: string;
  negative: string;
  characters: InlineCharacterPromptDraft[];
}

/**
 * 读取编辑弹窗默认展示的提示词
 * NovelAI 会过滤内置质量标签和 UC 预设
 * @param settings NovelAI 设置
 * @param snapshot 当前图片保存的提示词快照
 * @returns 可直接显示在编辑弹窗中的正负与角色提示词
 */
export function readEditablePromptInput(
  settings: NovelAISettings,
  snapshot: InlinePromptSnapshot,
): EditablePromptPairValue {
  if (!snapshot.novelai) {
    return { positive: snapshot.positivePrompt, negative: snapshot.negativePrompt, characters: [] };
  }
  const prompts = readNovelAIEditablePrompts(settings, snapshot.novelai);
  return {
    positive: prompts.positivePrompt,
    negative: prompts.negativePrompt,
    characters: (snapshot.novelai.characterPrompts ?? []).map(toCharacterDraft),
  };
}

/**
 * 创建替换正负与角色提示词后的快照
 * @param settings NovelAI 设置
 * @param snapshot 原提示词快照
 * @param prompts 编辑结果
 * @returns 更新后的提示词快照
 */
export function createEditedPromptSnapshot(
  settings: NovelAISettings,
  snapshot: InlinePromptSnapshot,
  prompts: EditablePromptPairValue,
): InlinePromptSnapshot {
  const edited = cloneInlinePromptSnapshot(snapshot);
  const { positive: positivePrompt, negative: negativePrompt } = prompts;
  if (edited.novelai) {
    const base = buildNovelAIFinalPromptsFromEditable(settings, { positivePrompt, negativePrompt });
    const characterPrompts = prompts.characters.map(toCharacterPromptItem);
    edited.positivePrompt = base.positivePrompt;
    edited.negativePrompt = base.negativePrompt;
    Object.assign(edited.novelai, base, {
      characterPrompts,
      useCharacterCoords: resolveEditedUseCharacterCoords(
        characterPrompts.length,
        snapshot.novelai?.useCharacterCoords,
        settings.autoCharacterCoords,
      ),
    });
    return edited;
  }
  edited.positivePrompt = positivePrompt;
  edited.negativePrompt = negativePrompt;
  if (edited.comfyui) Object.assign(edited.comfyui, { positivePrompt, negativePrompt });
  return edited;
}
