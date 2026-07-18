import type { ImagePromptVibeRef, NovelAIVibePresetSettings } from '@/constants/novelai-vibe';
import { isNovelAIV3Model, type NovelAIAccount, type NovelAISettings } from '@/constants/novelai';
import {
  loadNovelAIVibeSourceCache,
  saveNovelAIVibeEncodedData,
  type NovelAIVibeSourceCacheView,
} from '@/services/novelai/vibe-cache';
import { encodeNovelAIVibeWithAccounts } from '@/services/novelai/vibe-encode';
import { stripDataUrlBase64 } from '@/services/novelai/vibe-file';
import { findNovelAIVibePreset } from '@/services/novelai/vibe-presets';
import type { NovelAIVibeParameters } from '@/services/novelai/vibe-types';

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
 * 读取当前激活的 NovelAI vibe 预设引用
 * @param presetSettings NovelAI vibe 预设集合
 * @returns vibe 引用列表
 */
export function getActiveNovelAIVibePresetRefs(
  presetSettings: NovelAIVibePresetSettings,
): ImagePromptVibeRef[] {
  return findNovelAIVibePreset(presetSettings.presets, presetSettings.activePresetId)?.vibes ?? [];
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
  const cache = await loadNovelAIVibeSourceCache(vibe.sourceHash);
  if (cache.imageData) return stripDataUrlBase64(cache.imageData);
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
  const cache = await loadNovelAIVibeSourceCache(vibe.sourceHash);
  const encodedData = pickEncodedData(cache, settings.model, vibe.informationExtracted);
  if (encodedData) return markVibePersistent(vibe, encodedData);
  if (!cache.imageData) throw new Error('当前 vibe 缓存已丢失，请重新上传图片或 .naiv4vibe 文件');
  return encodeAndCacheVibe(settings, vibe, cache, accounts, options);
}

/**
 * 按优先级挑选可用 encoding：exact → 同模型 → 任意
 * @param cache 同源缓存视图
 * @param model 当前模型
 * @param informationExtracted 当前信息提取
 * @returns encoding 或 null
 */
function pickEncodedData(
  cache: NovelAIVibeSourceCacheView,
  model: NovelAISettings['model'],
  informationExtracted: number,
): string | null {
  const exact = cache.encodings.find(
    item => item.model === model && item.informationExtracted === informationExtracted,
  );
  if (exact) return exact.encodedData;
  const sameModel = cache.encodings.find(item => item.model === model);
  if (sameModel) return sameModel.encodedData;
  // 无原图时才允许跨模型兜底，避免有图时静默用错模型 encoding
  if (!cache.imageData) return cache.encodings[0]?.encodedData ?? null;
  return null;
}

/**
 * 调用 encode-vibe 并写入缓存
 * @param settings NovelAI 设置
 * @param vibe vibe 引用
 * @param cache 已加载的同源缓存
 * @param accounts 候选 NovelAI 账号
 * @param options 请求控制选项
 * @returns encodedData base64
 */
async function encodeAndCacheVibe(
  settings: NovelAISettings,
  vibe: ImagePromptVibeRef,
  cache: NovelAIVibeSourceCacheView,
  accounts: NovelAIAccount[],
  options: NovelAIVibeResolveOptions,
): Promise<string> {
  const result = await encodeNovelAIVibeWithAccounts(
    accounts,
    stripDataUrlBase64(cache.imageData as string),
    settings.model,
    vibe.informationExtracted,
    options,
  );
  await saveNovelAIVibeEncodedData(
    {
      sourceHash: vibe.sourceHash,
      fileName: cache.fileName ?? vibe.sourceHash.slice(0, 8),
    },
    settings.model,
    vibe.informationExtracted,
    result.encodedData,
    result.cacheSecretKey,
  );
  return markVibePersistent(vibe, result.encodedData);
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
