import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  type ImagePromptPreset,
  type ImagePromptPresetSettings,
  type ImagePromptVibeRef,
} from '@/constants/image-prompt';
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';
import { NOVELAI_MODELS, type NovelAIModel } from '@/constants/novelai';
import type { NovelAIVibeCacheRecord } from '@/services/novelai/vibe-types';
import type { DataPortabilityPayload, PortableNovelAIVibeBundle } from '@/services/data-portability/types';

const DEFAULT_CHATU8_MODEL: NovelAIModel = 'nai-diffusion-4-5-curated';
const CHATU8_POSITIVE_FIELDS = ['fixedPrompt_novelai', 'fixedPrompt_end_novelai'] as const;
const CHATU8_NEGATIVE_FIELD = 'negativePrompt_novelai';

interface Chatu8ParseResult {
  payload: DataPortabilityPayload;
  warnings: string[];
}

interface Chatu8VibeRefInput {
  vibeDataId: string;
  strength: number;
}

/**
 * 判断是否为 st-chatu8 兼容导出
 * @param value 待判断数据
 * @returns 是否可识别
 */
export function isChatu8Export(value: unknown): boolean {
  const record = toRecord(value);
  return Boolean(record.groups && record.vibeData) || collectYushePresetRecords(value).length > 0;
}

/**
 * 解析 st-chatu8 兼容导出
 * @param value 外部 JSON 数据
 * @returns 可导入 payload 与警告
 */
export function parseChatu8Export(value: unknown): Chatu8ParseResult {
  const warnings: string[] = [];
  const imagePromptPresets = parseChatu8YushePresets(value, warnings);
  const novelAIVibeBundle = parseChatu8VibeBundle(value, warnings);
  return { payload: buildChatu8Payload(imagePromptPresets, novelAIVibeBundle), warnings };
}

/**
 * 构建 st-chatu8 导入 payload
 * @param imagePromptPresets 画师串预设
 * @param novelAIVibeBundle Vibe 完整包
 * @returns 导入 payload
 */
function buildChatu8Payload(
  imagePromptPresets: ImagePromptPresetSettings | null,
  novelAIVibeBundle: PortableNovelAIVibeBundle | null,
): DataPortabilityPayload {
  const payload: DataPortabilityPayload = {};
  if (imagePromptPresets) payload.imagePromptPresets = imagePromptPresets;
  if (novelAIVibeBundle) payload.novelAIVibeBundle = novelAIVibeBundle;
  return payload;
}

/**
 * 解析 st-chatu8 的 yushe 固定提示词预设
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns 生图固定提示词预设集合
 */
function parseChatu8YushePresets(value: unknown, warnings: string[]): ImagePromptPresetSettings | null {
  const sources = collectYushePresetRecords(value);
  const positive = sources.flatMap((source, index) => createPositivePreset(source, index));
  const negative = sources.flatMap((source, index) => createNegativePreset(source, index));
  if (!positive.length && !negative.length) return null;
  if (!positive.length || !negative.length) warnings.push('部分 yushe 预设缺少正面或负面提示词字段，已只导入可识别侧。');
  return { positive: ensurePresetSide(positive, 'chatu8-positive-empty'), negative: ensurePresetSide(negative, 'chatu8-negative-empty') };
}

/**
 * 收集包含 yushe 字段的记录
 * @param value 外部 JSON 数据
 * @returns yushe 预设记录
 */
function collectYushePresetRecords(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  walkRecords(value, record => {
    if (hasChatu8PromptFields(record)) found.push(record);
  });
  return found;
}

/**
 * 判断记录是否含 st-chatu8 固定提示词字段
 * @param record 普通记录
 * @returns 是否命中
 */
function hasChatu8PromptFields(record: Record<string, unknown>): boolean {
  return CHATU8_POSITIVE_FIELDS.some(field => typeof record[field] === 'string') || typeof record[CHATU8_NEGATIVE_FIELD] === 'string';
}

/**
 * 创建正面固定提示词预设
 * @param record st-chatu8 记录
 * @param index 预设序号
 * @returns 正面预设或空数组
 */
function createPositivePreset(record: Record<string, unknown>, index: number): ImagePromptPreset[] {
  const prefix = readText(record.fixedPrompt_novelai);
  const suffix = readText(record.fixedPrompt_end_novelai);
  if (!prefix && !suffix) return [];
  const merged = joinFixedPromptParts(prefix, suffix);
  return [createPromptPreset(`chatu8-positive-${index + 1}`, readPresetName(record, index), merged.text, merged.offset)];
}

/**
 * 创建负面固定提示词预设
 * @param record st-chatu8 记录
 * @param index 预设序号
 * @returns 负面预设或空数组
 */
function createNegativePreset(record: Record<string, unknown>, index: number): ImagePromptPreset[] {
  const text = readText(record[CHATU8_NEGATIVE_FIELD]);
  if (!text) return [];
  const offset = clampImagePromptPlaceholderOffset(text, text.length);
  return [createPromptPreset(`chatu8-negative-${index + 1}`, readPresetName(record, index), text, offset)];
}

/**
 * 组合前置和后置固定提示词
 * @param prefix 前置固定提示词
 * @param suffix 后置固定提示词
 * @returns 合并文本与占位符位置
 */
function joinFixedPromptParts(prefix: string, suffix: string): { text: string; offset: number } {
  if (!prefix) return { text: suffix, offset: 0 };
  if (!suffix) return { text: prefix, offset: prefix.length };
  const separator = /[,，、\s]$/.test(prefix) || /^[,，、\s]/.test(suffix) ? '' : ', ';
  return { text: `${prefix}${separator}${suffix}`, offset: prefix.length + separator.length };
}

/**
 * 创建提示词预设对象
 * @param id 预设 ID
 * @param name 预设名称
 * @param text 预设文本
 * @param placeholderOffset 占位符位置
 * @returns 生图提示词预设
 */
function createPromptPreset(id: string, name: string, text: string, placeholderOffset: number): ImagePromptPreset {
  return { id, name, text, placeholderOffset, vibes: [] };
}

/**
 * 确保预设单侧非空
 * @param presets 已解析预设
 * @param id 兜底 ID
 * @returns 非空预设列表
 */
function ensurePresetSide(presets: ImagePromptPreset[], id: string): ImagePromptPreset[] {
  return presets.length ? presets : [createPromptPreset(id, 'st-chatu8 空预设', '', 0)];
}

/**
 * 解析 st-chatu8 Vibe 完整包
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns Vibe 完整包
 */
function parseChatu8VibeBundle(value: unknown, warnings: string[]): PortableNovelAIVibeBundle | null {
  const record = toRecord(value);
  const groups = toRecord(record.groups);
  const vibeData = toRecord(record.vibeData);
  const records = Object.entries(vibeData).flatMap(([id, data]) => createVibeRecord(id, data, warnings));
  const presets = Object.entries(groups).flatMap(([name, group]) => createVibeGroupPreset(name, group, vibeData));
  if (!records.length && !presets.length) return null;
  return { records, presets };
}

/**
 * 创建单条 Vibe 缓存记录
 * @param id st-chatu8 vibe id
 * @param value vibe 数据
 * @param warnings 警告收集器
 * @returns 缓存记录或空数组
 */
function createVibeRecord(id: string, value: unknown, warnings: string[]): NovelAIVibeCacheRecord[] {
  const record = toRecord(value);
  const encodedData = readEncodedData(record.encodings);
  if (!encodedData) {
    warnings.push(`Vibe ${id} 缺少 encodings，已跳过缓存写入。`);
    return [];
  }
  return [buildVibeRecord(id, record, encodedData)];
}

/**
 * 构建 Vibe 缓存记录
 * @param id st-chatu8 vibe id
 * @param record vibe 数据记录
 * @param encodedData encoded vibe 数据
 * @returns NovelAI Vibe 缓存记录
 */
function buildVibeRecord(id: string, record: Record<string, unknown>, encodedData: string): NovelAIVibeCacheRecord {
  return {
    sourceHash: readSourceHash(id, record),
    sourceType: 'encoded-vibe',
    fileName: `${readText(record.name) || id}.vibe`,
    model: readModel(record),
    informationExtracted: readInformationExtracted(record),
    encodedData,
    thumbnailData: readText(record.thumbnail) || readText(record.image) || undefined,
    createdAt: readTimestamp(record.createdAt),
  };
}

/**
 * 创建 Vibe 组对应正面预设
 * @param name 组名
 * @param value 组数据
 * @param vibeData Vibe 数据表
 * @returns 正面预设或空数组
 */
function createVibeGroupPreset(name: string, value: unknown, vibeData: Record<string, unknown>): ImagePromptPreset[] {
  const vibes = readVibeRefs(toRecord(value).vibes, vibeData, name);
  if (!vibes.length) return [];
  return [createPromptPreset(`chatu8-vibe-group-${stableHash(name)}`, name, '', 0),].map(preset => ({ ...preset, vibes }));
}

/**
 * 读取 Vibe 组引用
 * @param value 原始引用列表
 * @param vibeData Vibe 数据表
 * @param groupName 组名
 * @returns CosmosVision Vibe 引用
 */
function readVibeRefs(value: unknown, vibeData: Record<string, unknown>, groupName: string): ImagePromptVibeRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => createVibeRef(item, vibeData, groupName, index));
}

/**
 * 创建单个 Vibe 引用
 * @param value 原始引用
 * @param vibeData Vibe 数据表
 * @param groupName 组名
 * @param index 序号
 * @returns Vibe 引用或空数组
 */
function createVibeRef(value: unknown, vibeData: Record<string, unknown>, groupName: string, index: number): ImagePromptVibeRef[] {
  const input = readChatu8VibeRef(value);
  if (!input) return [];
  const data = toRecord(vibeData[input.vibeDataId]);
  return [{
    id: `chatu8-vibe-ref-${stableHash(`${groupName}-${index}-${input.vibeDataId}`)}`,
    sourceHash: readSourceHash(input.vibeDataId, data),
    enabled: true,
    referenceStrength: clamp01(input.strength),
    informationExtracted: readInformationExtracted(data),
  }];
}

/**
 * 读取 st-chatu8 Vibe 引用
 * @param value 原始引用
 * @returns 规范化引用或 null
 */
function readChatu8VibeRef(value: unknown): Chatu8VibeRefInput | null {
  const record = toRecord(value);
  const vibeDataId = readText(record.vibeDataId);
  if (!vibeDataId) return null;
  return { vibeDataId, strength: readNumber(record.strength, 0.6) };
}

/**
 * 读取 encodedData 字符串
 * @param value 原始 encodings 字段
 * @returns encodedData 或空字符串
 */
function readEncodedData(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return readText(value[0]);
  return readText(Object.values(toRecord(value))[0]);
}

/**
 * 读取信息提取强度
 * @param record Vibe 数据记录
 * @returns 信息提取强度
 */
function readInformationExtracted(record: Record<string, unknown>): number {
  const importInfo = toRecord(record.importInfo);
  return clamp01(readNumber(importInfo.information_extracted, DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED));
}

/**
 * 读取模型名
 * @param record Vibe 数据记录
 * @returns NovelAI 模型
 */
function readModel(record: Record<string, unknown>): NovelAIModel {
  const model = readText(record.model);
  return isNovelAIModel(model) ? model : DEFAULT_CHATU8_MODEL;
}

/**
 * 判断模型名是否为 CosmosVision 支持的 NovelAI 模型
 * @param value 外部模型名
 * @returns 是否为合法模型
 */
function isNovelAIModel(value: string): value is NovelAIModel {
  return NOVELAI_MODELS.some(model => model.value === value);
}

/**
 * 读取来源 hash
 * @param id st-chatu8 vibe id
 * @param record Vibe 数据记录
 * @returns 来源 hash
 */
function readSourceHash(id: string, record: Record<string, unknown>): string {
  return readText(record.id) || readText(record.identifier) || `chatu8-${stableHash(id)}`;
}

/**
 * 读取预设名称
 * @param record 原始记录
 * @param index 序号
 * @returns 预设名
 */
function readPresetName(record: Record<string, unknown>, index: number): string {
  return readText(record.name) || readText(record.title) || `st-chatu8 预设 ${index + 1}`;
}

/**
 * 深度遍历普通记录
 * @param value 待遍历值
 * @param visit 访问回调
 */
function walkRecords(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) value.forEach(item => walkRecords(item, visit));
  const record = toRecord(value);
  if (!Object.keys(record).length) return;
  visit(record);
  Object.values(record).forEach(item => walkRecords(item, visit));
}

/**
 * 读取普通记录
 * @param value 外部值
 * @returns 普通记录或空对象
 */
function toRecord(value: unknown): Record<string, unknown> {
  return _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
}

/**
 * 读取字符串
 * @param value 外部值
 * @returns 字符串或空字符串
 */
function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 读取数字
 * @param value 外部值
 * @param fallback 默认值
 * @returns 数字
 */
function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 读取时间戳
 * @param value 外部值
 * @returns 时间戳
 */
function readTimestamp(value: unknown): number {
  return readNumber(value, Date.now());
}

/**
 * 约束 0 到 1 的数值
 * @param value 原始数值
 * @returns 合法数值
 */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 简单稳定 hash
 * @param value 原始字符串
 * @returns hash 字符串
 */
function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}
