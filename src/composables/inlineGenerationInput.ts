import type { CosmosVisionSettings } from '@/constants/novelai';
import type { ImagePromptVibeRef } from '@/constants/novelai-vibe';
import {
  canEditInlineCharacterPrompts,
  type InlineCharacterPromptDraft,
} from '@/composables/inlineEditableCharacterPrompt';
import {
  buildEditableDisplayText,
  createEditedPromptSnapshot,
  readEditablePromptInput,
  resolveStrippedPromptPart,
} from '@/composables/inlineEditablePromptSnapshot';
import type { InlineGenerationSession } from '@/composables/inlineGenerationSession';
import type { InlineImageDownloadOptions } from '@/services/inline-image/download-options';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';

export type RuntimeEnabledGetter = () => boolean;

export interface InlineTextInputOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  rows?: number;
  acceptLabel?: string;
  cancelLabel?: string;
}

export interface InlinePromptPairInputOptions {
  title?: string;
  message: string;
  positiveLabel?: string;
  negativeLabel?: string;
  positiveDefaultValue?: string;
  negativeDefaultValue?: string;
  /** 原始正面 core，供弹窗切换预设时重建整体文本 */
  positiveCore?: string;
  /** 原始负面 core，供弹窗切换预设时重建整体文本 */
  negativeCore?: string;
  positiveRows?: number;
  negativeRows?: number;
  acceptLabel?: string;
  cancelLabel?: string;
  /** 是否展示角色提示词编辑区（仅 NovelAI V4 / V4.5） */
  enableCharacters?: boolean;
  /** 角色提示词初始值 */
  charactersDefaultValue?: InlineCharacterPromptDraft[];
  /** 正面预设选择器初始值；'' = 原提示词*/
  positivePresetId?: string;
  /** 负面预设选择器初始值；'' = 原提示词*/
  negativePresetId?: string;
}

export interface InlinePromptPairInputValue {
  /** 用户所见的正面整体文本 */
  positive: string;
  /** 用户所见的负面整体文本 */
  negative: string;
  characters: InlineCharacterPromptDraft[];
  /** 弹窗选择的正面预设 ID；'' = 原提示词。未提供时沿用初始值 */
  positivePresetId?: string;
  /** 弹窗选择的负面预设 ID；'' = 原提示词。未提供时沿用初始值 */
  negativePresetId?: string;
}

export interface InlineImageGenerationOptions {
  isRuntimeEnabled?: RuntimeEnabledGetter;
  requestTextInput: (options: InlineTextInputOptions) => Promise<string | null>;
  requestPromptPairInput: (options: InlinePromptPairInputOptions) => Promise<InlinePromptPairInputValue | null>;
  requestImageDownloadOptions: () => Promise<InlineImageDownloadOptions | null>;
  getDarkMode: () => boolean;
}

export type FreshPromptMode = 'new' | 'repeat';

export interface SpecialRequestContext {
  anchor: HTMLElement;
  value: string;
}

export interface InlineGenerationBatchResult {
  imageBlobs: Blob[];
  promptSnapshot: InlinePromptSnapshot;
}

export type InlineGenerationTask = (
  session: InlineGenerationSession,
  onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
) => Promise<InlineGenerationBatchResult>;

/**
 * 请求用户编辑当前图片保存的正负提示词（含角色与预设选择）
 * @param settings 设置项
 * @param snapshot 当前图片保存的提示词快照
 * @param requestPromptPairInput 弹窗请求回调
 * @returns 编辑后的快照,取消时返回 null
 */
export async function requestEditedPromptSnapshot(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
  requestPromptPairInput: (options: InlinePromptPairInputOptions) => Promise<InlinePromptPairInputValue | null>,
): Promise<InlinePromptSnapshot | null> {
  const initialPrompts = readEditablePromptInput(settings, snapshot);
  const canEditCharacters = canEditInlineCharacterPrompts(settings.novelai.model);
  const prompts = await requestPromptPairInput({
    title: '编辑提示词后生图',
    message: canEditCharacters
      ? '直接编辑当前图片保存的全局提示词与角色提示词，确认后生成图片'
      : '直接编辑当前图片保存的提示词，确认后生成图片',
    positiveLabel: '正面提示词',
    negativeLabel: '负面提示词',
    positiveDefaultValue: buildEditableDisplayText(
      settings.imagePromptPresets.positive,
      initialPrompts.positivePresetId,
      initialPrompts.positive,
    ),
    negativeDefaultValue: buildEditableDisplayText(
      settings.imagePromptPresets.negative,
      initialPrompts.negativePresetId,
      initialPrompts.negative,
    ),
    positiveCore: initialPrompts.positive,
    negativeCore: initialPrompts.negative,
    positiveRows: 6,
    negativeRows: 4,
    enableCharacters: canEditCharacters,
    charactersDefaultValue: initialPrompts.characters,
    positivePresetId: initialPrompts.positivePresetId,
    negativePresetId: initialPrompts.negativePresetId,
  });
  if (!prompts) return null;
  const positivePart = resolveStrippedPromptPart(
    settings.imagePromptPresets.positive,
    prompts.positivePresetId ?? initialPrompts.positivePresetId,
    prompts.positive,
  );
  const negativePart = resolveStrippedPromptPart(
    settings.imagePromptPresets.negative,
    prompts.negativePresetId ?? initialPrompts.negativePresetId,
    prompts.negative,
  );
  return createEditedPromptSnapshot(settings, snapshot, {
    positive: positivePart.core,
    negative: negativePart.core,
    characters: prompts.characters,
    positivePresetId: positivePart.presetId,
    negativePresetId: negativePart.presetId,
  });
}

/**
 * 收集当前仍为临时态的 vibe 来源 hash
 * @param vibes 本次请求绑定的 vibe 引用
 * @returns 来源 hash 列表
 */
export function collectTemporaryVibeSourceHashes(vibes?: readonly ImagePromptVibeRef[]): string[] {
  return (vibes ?? []).filter(vibe => vibe.temporary).map(vibe => vibe.sourceHash);
}

/**
 * 判断本次请求是否将临时 vibe 升级为持久条目
 * @param vibes 当前 vibe 引用
 * @param sourceHashes 请求开始前的临时 vibe hash
 * @returns 是否发生升级
 */
export function hasPromotedTemporaryVibes(
  vibes: readonly ImagePromptVibeRef[] | undefined,
  sourceHashes: readonly string[],
): boolean {
  if (!sourceHashes.length || !vibes?.length) return false;
  return sourceHashes.some(sourceHash => !vibes.find(vibe => vibe.sourceHash === sourceHash)?.temporary);
}
