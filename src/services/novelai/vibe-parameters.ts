import type { ImagePromptPresetSettings, ImagePromptVibeRef } from '@/constants/image-prompt';
import { isNovelAIV3Model, type NovelAIAccount, type NovelAISettings } from '@/constants/novelai';
import { getImagePromptPreset } from '@/services/image-prompt/presets';
import {
  getNovelAIVibeFileName,
  getNovelAIVibeAnyEncodedData,
  getNovelAIVibeEncodedData,
  getNovelAIVibeImageData,
  saveNovelAIVibeEncodedData,
} from '@/services/novelai/vibe-cache';
import { encodeNovelAIVibeWithAccounts } from '@/services/novelai/vibe-encode';
import { stripDataUrlBase64 } from '@/services/novelai/vibe-file';
import type { NovelAIVibeParameters, ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

/** NovelAI vibe 参数解析选项 */
export interface NovelAIVibeResolveOptions {
  signal?: AbortSignal;
}

interface ResolvedVibeEntry {
  image: string;
  strength: number;
  informationExtracted: number;
}

/**
 * 读取当前正面提示词预设绑定的 vibe
 * @param settings NovelAI 设置
 * @param presetSettings 共享提示词预设
 * @returns vibe 引用列表
 */
export function getNovelAIPositivePresetVibes(
  settings: NovelAISettings,
  presetSettings: ImagePromptPresetSettings,
): ImagePromptVibeRef[] {
  return getImagePromptPreset(presetSettings.positive, settings.positivePromptPresetId).vibes;
}

/**
 * 解析 NovelAI 请求需要的 vibe 三组数组
 * @param settings NovelAI 设置
 * @param vibes 当前请求绑定的 vibe 引用
 * @param accounts 候选 NovelAI 账号
 * @param options 请求控制选项
 * @returns vibe 参数或 undefined
 */
export async function resolveNovelAIVibeParameters(
  settings: NovelAISettings,
  vibes: readonly ImagePromptVibeRef[] | undefined,
  accounts: NovelAIAccount[],
  options: NovelAIVibeResolveOptions = {},
): Promise<NovelAIVibeParameters | undefined> {
  const enabledVibes = (vibes ?? []).filter(vibe => vibe.enabled);
  if (!enabledVibes.length) return undefined;
  const entries = await Promise.all(enabledVibes.map(vibe => resolveVibeEntry(settings, vibe, accounts, options)));
  return buildVibeParameters(entries);
}

/**
 * 将解析结果写为 NovelAI 官方数组
 * @param entries 单个 vibe 解析结果
 * @returns 官方 vibe 参数
 */
function buildVibeParameters(entries: ResolvedVibeEntry[]): NovelAIVibeParameters {
  return {
    reference_image_multiple: entries.map(entry => entry.image),
    reference_strength_multiple: entries.map(entry => entry.strength),
    reference_information_extracted_multiple: entries.map(entry => entry.informationExtracted),
  };
}

/**
 * 解析单个 vibe 引用
 * @param settings NovelAI 设置
 * @param vibe vibe 引用
 * @param accounts 候选 NovelAI 账号
 * @param options 请求控制选项
 * @returns 单个 vibe 参数
 */
async function resolveVibeEntry(
  settings: NovelAISettings,
  vibe: ImagePromptVibeRef,
  accounts: NovelAIAccount[],
  options: NovelAIVibeResolveOptions,
): Promise<ResolvedVibeEntry> {
  const image = isNovelAIV3Model(settings.model)
    ? await resolveV3VibeImage(vibe)
    : await resolveV4VibeImage(settings, vibe, accounts, options);
  return { image, strength: vibe.referenceStrength, informationExtracted: vibe.informationExtracted };
}

/**
 * 解析 V3 使用的原图 base64
 * @param vibe vibe 引用
 * @returns 原图 base64
 */
async function resolveV3VibeImage(vibe: ImagePromptVibeRef): Promise<string> {
  const imageData = await getNovelAIVibeImageData(vibe.sourceHash);
  if (imageData) return stripDataUrlBase64(imageData);
  throw new Error('当前 vibe 只有已解析数据，V3 模型需要重新上传原图');
}

/**
 * 解析 V4/V4.5 使用的 encodedData
 * @param settings NovelAI 设置
 * @param vibe vibe 引用
 * @param accounts 候选 NovelAI 账号
 * @param options 请求控制选项
 * @returns encodedData base64
 */
async function resolveV4VibeImage(
  settings: NovelAISettings,
  vibe: ImagePromptVibeRef,
  accounts: NovelAIAccount[],
  options: NovelAIVibeResolveOptions,
): Promise<string> {
  const cached = await getNovelAIVibeEncodedData(vibe.sourceHash, settings.model, vibe.informationExtracted);
  if (cached) return markVibePersistent(vibe, cached);
  const imageData = await getNovelAIVibeImageData(vibe.sourceHash);
  if (!imageData) return getEncodedOnlyVibeData(vibe);
  return encodeAndCacheVibe(settings, vibe, imageData, accounts, options);
}

/**
 * 读取只有已解析二进制的 vibe
 * @param vibe vibe 引用
 * @returns encodedData base64
 */
async function getEncodedOnlyVibeData(vibe: ImagePromptVibeRef): Promise<string> {
  const encodedData = await getNovelAIVibeAnyEncodedData(vibe.sourceHash);
  if (encodedData) return markVibePersistent(vibe, encodedData);
  throw new Error('当前 vibe 缓存已丢失，请重新上传图片或 .vibe 文件');
}

/**
 * 调用 encode-vibe 并写入缓存
 * @param settings NovelAI 设置
 * @param vibe vibe 引用
 * @param imageData 原图 data URL
 * @param accounts 候选 NovelAI 账号
 * @param options 请求控制选项
 * @returns encodedData base64
 */
async function encodeAndCacheVibe(
  settings: NovelAISettings,
  vibe: ImagePromptVibeRef,
  imageData: string,
  accounts: NovelAIAccount[],
  options: NovelAIVibeResolveOptions,
): Promise<string> {
  const encodedData = await encodeNovelAIVibeWithAccounts(accounts, stripDataUrlBase64(imageData), settings.model, vibe.informationExtracted, options);
  await saveNovelAIVibeEncodedData(await createCachePayload(vibe), settings.model, vibe.informationExtracted, encodedData);
  return markVibePersistent(vibe, encodedData);
}

/**
 * 创建 encodedData 缓存写入载荷
 * @param vibe vibe 引用
 * @returns 最小缓存载荷
 */
async function createCachePayload(vibe: ImagePromptVibeRef): Promise<Pick<ParsedNovelAIVibeFile, 'sourceHash' | 'fileName'>> {
  return {
    sourceHash: vibe.sourceHash,
    fileName: (await getNovelAIVibeFileName(vibe.sourceHash)) ?? vibe.sourceHash.slice(0, 8),
  };
}

/**
 * 将临时 vibe 标记为已持久化
 * @param vibe vibe 引用
 * @param value 已解析的 encodedData
 * @returns 原样返回 encodedData
 */
function markVibePersistent(vibe: ImagePromptVibeRef, value: string): string {
  if (vibe.temporary) vibe.temporary = false;
  return value;
}
