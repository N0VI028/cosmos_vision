import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
  MAX_NOVELAI_VIBES_PER_PRESET,
  type ImagePromptVibeRef,
  type NovelAIVibePreset,
} from '@/constants/novelai-vibe';
import type { NovelAIModel } from '@/constants/novelai';
import { saveNovelAIVibeFilePayload } from '@/services/novelai/vibe-cache';
import { stripNovelAIVibeFileExtension } from '@/services/novelai/vibe-shared';
import type { ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

interface NovelAIVibeImportDefaults {
  model: NovelAIModel;
  informationExtracted: number;
}

interface NovelAIVibeFileSource {
  name: string;
}

export interface NovelAIVibePayloadLimitResult {
  payloads: ParsedNovelAIVibeFile[];
  skipped: number;
}

export interface ImportedNovelAIVibePresetResult {
  preset: NovelAIVibePreset;
  savedPayloads: ParsedNovelAIVibeFile[];
  skipped: number;
  imported: number;
}

/**
 * 按单个预设上限截取可导入 vibe 载荷
 * @param payloads 已解析的 vibe 载荷
 * @param currentCount 当前预设已有数量
 * @returns 可写入载荷与跳过数量
 */
export function limitNovelAIVibePayloads(
  payloads: ParsedNovelAIVibeFile[],
  currentCount: number,
): NovelAIVibePayloadLimitResult {
  const availableCount = MAX_NOVELAI_VIBES_PER_PRESET - currentCount;
  if (availableCount <= 0) throw new Error(`单个 Vibe 组最多只能添加 ${MAX_NOVELAI_VIBES_PER_PRESET} 个 vibe`);
  return {
    payloads: payloads.slice(0, availableCount),
    skipped: Math.max(payloads.length - availableCount, 0),
  };
}

/**
 * 批量写入已解析的 NovelAI vibe 缓存
 * @param payloads 已解析的 vibe 载荷
 * @param defaults 当前设置提供的兜底值
 */
export async function saveNovelAIVibePayloads(
  payloads: readonly ParsedNovelAIVibeFile[],
  defaults: NovelAIVibeImportDefaults,
): Promise<void> {
  for (const payload of payloads) {
    await saveNovelAIVibeFilePayload(
      payload,
      payload.model ?? defaults.model,
      payload.informationExtracted ?? defaults.informationExtracted,
    );
  }
}

/**
 * 从文件载荷创建轻量 vibe 引用
 * @param payloads 已解析的 vibe 载荷
 * @returns 轻量 vibe 引用列表
 */
export function createNovelAIVibeRefs(payloads: readonly ParsedNovelAIVibeFile[]): ImagePromptVibeRef[] {
  return payloads.map(createNovelAIVibeRef);
}

/**
 * 将官网 vibe 载荷导入为一个新的预设
 * @param source 原始导入来源
 * @param payloads 已解析的 vibe 载荷
 * @param defaults 当前设置提供的兜底值
 * @returns 导入后的预设结果
 */
export async function importNovelAIVibePayloadsAsPreset(
  source: NovelAIVibeFileSource,
  payloads: ParsedNovelAIVibeFile[],
  defaults: NovelAIVibeImportDefaults,
): Promise<ImportedNovelAIVibePresetResult> {
  const limited = limitNovelAIVibePayloads(payloads, 0);
  await saveNovelAIVibePayloads(limited.payloads, defaults);
  return {
    preset: createImportedNovelAIVibePreset(source, limited.payloads),
    savedPayloads: limited.payloads,
    skipped: limited.skipped,
    imported: limited.payloads.length,
  };
}

/**
 * 构建导入入口使用的新 vibe 预设
 * @param file 原始导入文件
 * @param payloads 已解析的 vibe 载荷
 * @returns 新 vibe 预设
 */
export function createImportedNovelAIVibePreset(
  file: NovelAIVibeFileSource,
  payloads: readonly ParsedNovelAIVibeFile[],
): NovelAIVibePreset {
  return {
    id: uuidv4(),
    name: resolveImportedPresetName(file, payloads),
    vibes: createNovelAIVibeRefs(payloads),
  };
}

/**
 * 创建单个轻量 vibe 引用
 * @param payload 已解析的 vibe 载荷
 * @returns 轻量 vibe 引用
 */
function createNovelAIVibeRef(payload: ParsedNovelAIVibeFile): ImagePromptVibeRef {
  return {
    id: uuidv4(),
    sourceHash: payload.sourceHash,
    enabled: true,
    referenceStrength: payload.referenceStrength ?? DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
    informationExtracted: payload.informationExtracted ?? DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
    temporary: payload.sourceType === 'image',
  };
}

/**
 * 解析导入预设名称
 * @param file 原始导入文件
 * @param payloads 已解析的 vibe 载荷
 * @returns 预设名称
 */
function resolveImportedPresetName(file: NovelAIVibeFileSource, payloads: readonly ParsedNovelAIVibeFile[]): string {
  return normalizePresetName(stripNovelAIVibeFileExtension(file.name)) || normalizePresetName(payloads[0]?.fileName) || '导入 Vibe 预设';
}

/**
 * 规范化预设名称
 * @param value 原始名称
 * @returns 可显示名称
 */
function normalizePresetName(value: string | undefined): string {
  return value?.trim() ?? '';
}
