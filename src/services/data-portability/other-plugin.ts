import {
  type ImagePromptPreset,
  type ImagePromptPresetSettings,
} from '@/constants/image-prompt';
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';
import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  createNovelAIVibePreset,
  type ImagePromptVibeRef,
  type NovelAIVibePreset,
} from '@/constants/novelai-vibe';
import {
  NOVELAI_MODELS,
  type NovelAIModel,
  type PromptLlmMessage,
  type PromptLlmMessagePreset,
  type PromptLlmMessagePresetSettings,
  type PromptLlmMessageRole,
  type PromptLlmMessageTriggerMode,
} from '@/constants/novelai';
import {
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
} from '@/constants/prompt-llm-tokens';
import { stripDataUrlBase64 } from '@/services/novelai/vibe-file';
import type { NovelAIVibeCacheRecord } from '@/services/novelai/vibe-types';
import type { DataPortabilityPayload, PortableNovelAIVibeBundle } from '@/services/data-portability/types';
import { normalizePromptLlmMessagePresets } from '@/services/prompt-llm/message-preset';

const DEFAULT_OTHER_PLUGIN_MODEL: NovelAIModel = 'nai-diffusion-4-5-curated';
const ST_CHAT8_POSITIVE_PREFIX_FIELDS = ['fixedPrompt_novelai', 'fixedPrompt'] as const;
const ST_CHAT8_POSITIVE_SUFFIX_FIELDS = ['fixedPrompt_end_novelai', 'fixedPrompt_end'] as const;
const ST_CHAT8_NEGATIVE_FIELDS = ['negativePrompt_novelai', 'negativePrompt'] as const;
const ST_CHAT8_TRIGGER_WORD_SPLIT_PATTERN = /[\r\n,，、|;；]+/;
const ST_CHAT8_DELETE_MACROS = new Set(['世界书触发', '通用服装启用列表']);
const ST_CHAT8_PROMPT_MACRO_MAP: Record<string, string> = {
  正文: PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  用户需求: PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
  上下文: PROMPT_LLM_HISTORY_TOKEN,
  角色启用列表: PROMPT_LLM_PARTICIPANT_TOKEN,
  通用角色启用列表: PROMPT_LLM_PARTICIPANT_TOKEN,
};

interface OtherPluginParseResult {
  payload: DataPortabilityPayload;
  warnings: string[];
}

interface OtherPluginVibeRefInput {
  vibeDataId: string;
  strength: number;
}

interface OtherPluginPromptPresetSource {
  key: string;
  name: string;
  entries: unknown[];
}

interface OtherPluginYushePresetSource {
  key: string;
  name: string;
  record: Record<string, unknown>;
}

interface OtherPluginVibeAsset {
  imageData?: string;
  thumbnailData?: string;
}

/**
 * 判断是否为其他插件兼容导出
 * @param value 待判断数据
 * @returns 是否可识别
 */
export function isOtherPluginExport(value: unknown): boolean {
  const record = toRecord(value);
  return hasOtherPluginVibeBundle(record) || collectYushePresetSources(value).length > 0 || collectOtherPluginPromptPresetSources(value).length > 0;
}

/**
 * 解析其他插件兼容导出
 * @param value 外部 JSON 数据
 * @returns 可导入 payload 与警告
 */
export function parseOtherPluginExport(value: unknown): OtherPluginParseResult {
  const warnings: string[] = [];
  const imagePromptPresets = parseOtherPluginYushePresets(value, warnings);
  const novelAIVibeBundle = parseOtherPluginVibeBundle(value, warnings);
  const promptLlmMessagePresets = parseOtherPluginPromptLlmPresets(value, warnings);
  return { payload: buildOtherPluginPayload(imagePromptPresets, novelAIVibeBundle, promptLlmMessagePresets), warnings };
}

/**
 * 构建其他插件导入 payload
 * @param imagePromptPresets 画师串预设
 * @param novelAIVibeBundle Vibe 完整包
 * @param promptLlmMessagePresets LLM 条目预设
 * @returns 导入 payload
 */
function buildOtherPluginPayload(
  imagePromptPresets: ImagePromptPresetSettings | null,
  novelAIVibeBundle: PortableNovelAIVibeBundle | null,
  promptLlmMessagePresets: PromptLlmMessagePresetSettings | null,
): DataPortabilityPayload {
  const payload: DataPortabilityPayload = {};
  if (imagePromptPresets) payload.imagePromptPresets = imagePromptPresets;
  if (novelAIVibeBundle) payload.novelAIVibeBundle = novelAIVibeBundle;
  if (promptLlmMessagePresets) payload.promptLlmMessagePresets = promptLlmMessagePresets;
  return payload;
}

/**
 * 解析 其他插件的 LLM 预设
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns LLM 预设集合
 */
function parseOtherPluginPromptLlmPresets(
  value: unknown,
  warnings: string[],
): PromptLlmMessagePresetSettings | null {
  const sources = collectOtherPluginPromptPresetSources(value);
  const presets = sources.flatMap((source, index) => createPromptLlmPreset(source, index, warnings));
  if (!presets.length) return null;
  return normalizePromptLlmMessagePresets({ activePresetId: presets[0].id, presets });
}

/**
 * 收集 其他插件的 LLM 预设源
 * @param value 外部 JSON 数据
 * @returns 预设源列表
 */
function collectOtherPluginPromptPresetSources(value: unknown): OtherPluginPromptPresetSource[] {
  const root = toRecord(value);
  if (hasPromptPresetEntries(root)) return [createPromptPresetSource('default', root)];
  return Object.entries(root).flatMap(([key, preset]) => {
    const record = toRecord(preset);
    return hasPromptPresetEntries(record) ? [createPromptPresetSource(key, record)] : [];
  });
}

/**
 * 判断对象是否为 LLM 预设容器
 * @param record 普通记录
 * @returns 是否含 entries 列表
 */
function hasPromptPresetEntries(record: Record<string, unknown>): boolean {
  return readArray(record.entries).some(entry => isOtherPluginPromptEntryRecord(toRecord(entry)));
}

/**
 * 创建预设源对象
 * @param key 顶层键名
 * @param record 预设记录
 * @returns 标准化预设源
 */
function createPromptPresetSource(key: string, record: Record<string, unknown>): OtherPluginPromptPresetSource {
  const name = readText(record.name) || key || '其他插件预设';
  return { key: key || name, name, entries: readArray(record.entries) };
}

/**
 * 创建单个导入用 LLM 预设
 * @param source 预设源
 * @param index 预设序号
 * @param warnings 警告收集器
 * @returns LLM 预设或空数组
 */
function createPromptLlmPreset(
  source: OtherPluginPromptPresetSource,
  index: number,
  warnings: string[],
): PromptLlmMessagePreset[] {
  const messages = source.entries.flatMap((entry, entryIndex) => createPromptLlmMessage(entry, source, entryIndex));
  if (!messages.length) {
    warnings.push(`LLM 预设「${source.name}」未找到可导入条目，已跳过。`);
    return [];
  }
  return [{
    id: `other-plugin-prompt-${stableHash(`${source.key}-${index}`)}`,
    name: source.name,
    messages,
  }];
}

/**
 * 创建单个导入用 LLM 条目
 * @param value 原始条目
 * @param source 所属预设源
 * @param index 条目序号
 * @returns LLM 条目或空数组
 */
function createPromptLlmMessage(
  value: unknown,
  source: OtherPluginPromptPresetSource,
  index: number,
): PromptLlmMessage[] {
  const record = toRecord(value);
  if (!isOtherPluginPromptEntryRecord(record)) return [];
  const content = convertOtherPluginPromptContent(readRawText(record.content));
  const role = readPromptLlmRole(record.role);
  return [{
    id: readPromptLlmMessageId(record, source, index),
    title: readPromptLlmMessageTitle(record, index),
    role,
    content,
    enabled: readBoolean(record.enabled, true),
    triggerMode: readPromptLlmTriggerMode(record.triggerMode),
    triggerKeywords: readPromptLlmTriggerKeywords(record.triggerWords),
  }];
}

/**
 * 判断记录是否像 其他插件的 LLM 条目
 * @param record 普通记录
 * @returns 是否可识别
 */
function isOtherPluginPromptEntryRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.content === 'string' ||
    typeof record.role === 'string' ||
    typeof record.name === 'string' ||
    typeof record.triggerMode === 'string' ||
    typeof record.triggerWords === 'string'
  );
}

/**
 * 读取导入条目的消息 id
 * @param record 原始条目
 * @param source 所属预设源
 * @param index 条目序号
 * @returns 稳定消息 id
 */
function readPromptLlmMessageId(
  record: Record<string, unknown>,
  source: OtherPluginPromptPresetSource,
  index: number,
): string {
  return readText(record.id) || `other-plugin-message-${stableHash(`${source.key}-${index}-${readRawText(record.content)}`)}`;
}

/**
 * 读取导入条目的标题
 * @param record 原始条目
 * @param index 条目序号
 * @returns 条目标题
 */
function readPromptLlmMessageTitle(record: Record<string, unknown>, index: number): string {
  return readText(record.name) || `导入条目 ${index + 1}`;
}

/**
 * 读取导入条目的角色
 * @param value 原始角色值
 * @returns 合法角色
 */
function readPromptLlmRole(value: unknown): PromptLlmMessageRole {
  return value === 'system' || value === 'assistant' ? value : 'user';
}

/**
 * 读取导入条目的触发模式
 * @param value 原始触发模式
 * @returns 兼容后的触发模式
 */
function readPromptLlmTriggerMode(value: unknown): PromptLlmMessageTriggerMode {
  const normalized = readText(value).toLowerCase();
  return normalized === 'keyword' || normalized === 'trigger' ? 'keyword' : 'always';
}

/**
 * 读取导入条目的触发词列表
 * @param value 原始触发词文本
 * @returns 标准化触发词数组
 */
function readPromptLlmTriggerKeywords(value: unknown): string[] {
  return readRawText(value)
    .split(ST_CHAT8_TRIGGER_WORD_SPLIT_PATTERN)
    .map(keyword => keyword.trim())
    .filter(Boolean);
}

/**
 * 转换 其他插件的内容宏
 * @param content 原始条目内容
 * @returns 转换后的内容
 */
function convertOtherPluginPromptContent(content: string): string {
  return content.replace(/\{\{([^{}]+)\}\}/g, (_, rawName: string) => {
    const name = rawName.trim();
    if (ST_CHAT8_DELETE_MACROS.has(name)) return '';
    return ST_CHAT8_PROMPT_MACRO_MAP[name] ?? `{{${name}}}`;
  });
}

/**
 * 解析 其他插件的 yushe 固定提示词预设
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns 生图固定提示词预设集合
 */
function parseOtherPluginYushePresets(value: unknown, warnings: string[]): ImagePromptPresetSettings | null {
  const sources = collectYushePresetSources(value);
  const positive = sources.flatMap((source, index) => createPositivePreset(source, index));
  const negative = sources.flatMap((source, index) => createNegativePreset(source, index));
  if (!positive.length && !negative.length) return null;
  if (!positive.length || !negative.length) warnings.push('部分 yushe 预设缺少正面或负面提示词字段，已只导入可识别侧。');
  return { positive: ensurePresetSide(positive, 'other-plugin-positive-empty'), negative: ensurePresetSide(negative, 'other-plugin-negative-empty') };
}

/**
 * 收集包含 yushe 字段的预设源
 * @param value 外部 JSON 数据
 * @returns yushe 预设源
 */
function collectYushePresetSources(value: unknown): OtherPluginYushePresetSource[] {
  const root = toRecord(value);
  const fromPresets = collectNamedYushePresetSources(toRecord(root.presets));
  if (fromPresets.length) return fromPresets;
  if (hasOtherPluginPromptFields(root)) return [createYushePresetSource('default', root)];
  return Object.entries(root).flatMap(([key, item]) => {
    const record = toRecord(item);
    return hasOtherPluginPromptFields(record) ? [createYushePresetSource(key, record)] : [];
  });
}

/**
 * 收集 presets 容器内的命名 yushe 预设
 * @param presets 预设映射
 * @returns 命名预设源
 */
function collectNamedYushePresetSources(presets: Record<string, unknown>): OtherPluginYushePresetSource[] {
  return Object.entries(presets).flatMap(([key, item]) => {
    const record = toRecord(item);
    return hasOtherPluginPromptFields(record) ? [createYushePresetSource(key, record)] : [];
  });
}

/**
 * 创建 yushe 预设源
 * @param key 预设键名
 * @param record 预设记录
 * @returns 标准化预设源
 */
function createYushePresetSource(key: string, record: Record<string, unknown>): OtherPluginYushePresetSource {
  const name = readPresetName(record, key);
  return { key: key || name, name, record };
}

/**
 * 判断记录是否含其他插件固定提示词字段
 * @param record 普通记录
 * @returns 是否命中
 */
function hasOtherPluginPromptFields(record: Record<string, unknown>): boolean {
  return hasAnyTextField(record, ST_CHAT8_POSITIVE_PREFIX_FIELDS)
    || hasAnyTextField(record, ST_CHAT8_POSITIVE_SUFFIX_FIELDS)
    || hasAnyTextField(record, ST_CHAT8_NEGATIVE_FIELDS);
}

/**
 * 创建正面固定提示词预设
 * @param source 其他插件预设源
 * @param index 预设序号
 * @returns 正面预设或空数组
 */
function createPositivePreset(source: OtherPluginYushePresetSource, index: number): ImagePromptPreset[] {
  const prefix = readFirstText(source.record, ST_CHAT8_POSITIVE_PREFIX_FIELDS);
  const suffix = readFirstText(source.record, ST_CHAT8_POSITIVE_SUFFIX_FIELDS);
  if (!prefix && !suffix) return [];
  const merged = joinFixedPromptParts(prefix, suffix);
  return [createPromptPreset(`other-plugin-positive-${stableHash(`${source.key}-${index}`)}`, source.name, merged.text, merged.offset)];
}

/**
 * 创建负面固定提示词预设
 * @param source 其他插件预设源
 * @param index 预设序号
 * @returns 负面预设或空数组
 */
function createNegativePreset(source: OtherPluginYushePresetSource, index: number): ImagePromptPreset[] {
  const text = readFirstText(source.record, ST_CHAT8_NEGATIVE_FIELDS);
  if (!text) return [];
  const offset = clampImagePromptPlaceholderOffset(text, text.length);
  return [createPromptPreset(`other-plugin-negative-${stableHash(`${source.key}-${index}`)}`, source.name, text, offset)];
}

/**
 * 组合前置和后置固定提示词
 * @param prefix 前置固定提示词
 * @param suffix 后置固定提示词
 * @returns 合并文本与占位符位置
 */
function joinFixedPromptParts(prefix: string, suffix: string): { text: string; offset: number } {
  const normalizedPrefix = normalizePrefixPromptPart(prefix);
  const normalizedSuffix = normalizeSuffixPromptPart(suffix);
  return {
    text: `${normalizedPrefix}${normalizedSuffix}`,
    offset: normalizedPrefix.length,
  };
}

/**
 * 规范化前置固定提示词，保证末尾恰好一个英文逗号
 * @param prefix 前置固定提示词
 * @returns 规范化后的前置文本
 */
function normalizePrefixPromptPart(prefix: string): string {
  if (!prefix) return '';
  return `${prefix.replace(/[\s,，、]+$/u, '')},`;
}

/**
 * 规范化后置固定提示词，保证开头恰好一个英文逗号
 * @param suffix 后置固定提示词
 * @returns 规范化后的后置文本
 */
function normalizeSuffixPromptPart(suffix: string): string {
  if (!suffix) return '';
  return `,${suffix.replace(/^[\s,，、]+/u, '')}`;
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
  return { id, name, text, placeholderOffset };
}

/**
 * 确保预设单侧非空
 * @param presets 已解析预设
 * @param id 兜底 ID
 * @returns 非空预设列表
 */
function ensurePresetSide(presets: ImagePromptPreset[], id: string): ImagePromptPreset[] {
  return presets.length ? presets : [createPromptPreset(id, '其他插件空预设', '', 0)];
}

/**
 * 解析 其他插件Vibe 完整包
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns Vibe 完整包
 */
function parseOtherPluginVibeBundle(value: unknown, warnings: string[]): PortableNovelAIVibeBundle | null {
  const record = toRecord(value);
  if (!hasOtherPluginVibeBundle(record)) return null;
  const groups = toRecord(record.groups);
  const vibeData = toRecord(record.vibeData);
  const assets = collectOtherPluginVibeAssets(toRecord(record.vibePresets), toRecord(record.presetImages));
  const records = Object.entries(vibeData).flatMap(([id, data]) => createVibeRecords(id, data, assets[id], warnings));
  const presets = Object.entries(groups).flatMap(([name, group]) => createVibeGroupPreset(name, group, vibeData));
  if (!records.length && !presets.length) return null;
  return { records, presets };
}

/**
 * 判断对象是否含 其他插件Vibe 完整包
 * @param record 普通记录
 * @returns 是否命中
 */
function hasOtherPluginVibeBundle(record: Record<string, unknown>): boolean {
  return _.isPlainObject(record.groups) && _.isPlainObject(record.vibeData);
}

/**
 * 收集其他插件 vibe 的原图与缩略图
 * @param vibePresets 其他插件预设映射
 * @param presetImages 其他插件原图映射
 * @returns 按 vibeDataId 聚合后的媒体资源
 */
function collectOtherPluginVibeAssets(
  vibePresets: Record<string, unknown>,
  presetImages: Record<string, unknown>,
): Record<string, OtherPluginVibeAsset> {
  const assets: Record<string, OtherPluginVibeAsset> = {};
  Object.values(vibePresets).forEach(value => {
    const record = toRecord(value);
    const vibeDataId = readText(record.vibeDataId);
    if (!vibeDataId) return;
    const current = assets[vibeDataId] ?? {};
    const imageData = current.imageData || readImageDataUrl(presetImages[readText(record.imageId)]);
    const thumbnailData = current.thumbnailData || readImageDataUrl(record.thumbnail);
    assets[vibeDataId] = { imageData: imageData || undefined, thumbnailData: thumbnailData || undefined };
  });
  return assets;
}

/**
 * 创建一组 Vibe 缓存记录
 * @param id 其他插件 vibe id
 * @param value vibe 数据
 * @param asset 兜底媒体资源
 * @param warnings 警告收集器
 * @returns 缓存记录列表
 */
function createVibeRecords(
  id: string,
  value: unknown,
  asset: OtherPluginVibeAsset | undefined,
  warnings: string[],
): NovelAIVibeCacheRecord[] {
  const record = toRecord(value);
  const imageData = readImageDataUrl(record.image) || asset?.imageData;
  const encodedData = readEncodedData(record.encodings);
  const thumbnailData = readImageDataUrl(record.thumbnail) || asset?.thumbnailData || imageData;
  const records: NovelAIVibeCacheRecord[] = [];
  if (imageData) records.push(buildImageVibeRecord(id, record, imageData, thumbnailData));
  if (encodedData) records.push(buildEncodedVibeRecord(id, record, encodedData, thumbnailData));
  if (!encodedData) warnings.push(`Vibe ${id} 缺少 encodings，已跳过已解析缓存导入。`);
  return records;
}

/**
 * 构建 Vibe 原图缓存记录
 * @param id 其他插件 vibe id
 * @param record vibe 数据记录
 * @param imageData 原图 data URL
 * @param thumbnailData 缩略图 data URL
 * @returns NovelAI Vibe 缓存记录
 */
function buildImageVibeRecord(
  id: string,
  record: Record<string, unknown>,
  imageData: string,
  thumbnailData?: string,
): NovelAIVibeCacheRecord {
  return {
    ...buildVibeRecordBase(id, record, thumbnailData),
    sourceType: 'image',
    fileName: buildImageFileName(readText(record.name) || id, imageData),
    imageData,
  };
}

/**
 * 构建 Vibe 已解析缓存记录
 * @param id 其他插件 vibe id
 * @param record vibe 数据记录
 * @param encodedData encoded vibe 数据
 * @param thumbnailData 缩略图 data URL
 * @returns NovelAI Vibe 缓存记录
 */
function buildEncodedVibeRecord(
  id: string,
  record: Record<string, unknown>,
  encodedData: string,
  thumbnailData?: string,
): NovelAIVibeCacheRecord {
  return {
    ...buildVibeRecordBase(id, record, thumbnailData),
    sourceType: 'encoded-vibe',
    fileName: `${readText(record.name) || id}.naiv4vibe`,
    encodedData,
  };
}

/**
 * 构建通用 Vibe 缓存字段
 * @param id 其他插件 vibe id
 * @param record vibe 数据记录
 * @param thumbnailData 缩略图 data URL
 * @returns 通用缓存字段
 */
function buildVibeRecordBase(
  id: string,
  record: Record<string, unknown>,
  thumbnailData?: string,
): Omit<NovelAIVibeCacheRecord, 'sourceType' | 'fileName'> {
  return {
    sourceHash: readSourceHash(id, record),
    model: readModel(record),
    informationExtracted: readInformationExtracted(record),
    thumbnailData,
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
function createVibeGroupPreset(name: string, value: unknown, vibeData: Record<string, unknown>): NovelAIVibePreset[] {
  const vibes = readVibeRefs(toRecord(value).vibes, vibeData, name);
  if (!vibes.length) return [];
  return [{ ...createNovelAIVibePreset(`other-plugin-vibe-group-${stableHash(name)}`, name), vibes }];
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
  const input = readOtherPluginVibeRef(value);
  if (!input) return [];
  const data = toRecord(vibeData[input.vibeDataId]);
  return [{
    id: `other-plugin-vibe-ref-${stableHash(`${groupName}-${index}-${input.vibeDataId}`)}`,
    sourceHash: readSourceHash(input.vibeDataId, data),
    enabled: true,
    referenceStrength: clamp01(input.strength),
    informationExtracted: readInformationExtracted(data),
  }];
}

/**
 * 读取 其他插件Vibe 引用
 * @param value 原始引用
 * @returns 规范化引用或 null
 */
function readOtherPluginVibeRef(value: unknown): OtherPluginVibeRefInput | null {
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
  const text = readText(value);
  if (text) return text;
  if (Array.isArray(value)) return value.map(readEncodedData).find(Boolean) ?? '';
  const record = toRecord(value);
  return readText(record.encoding) || Object.values(record).map(readEncodedData).find(Boolean) || '';
}

/**
 * 读取图片 data URL
 * @param value 原始图片字段
 * @returns 标准化后的 data URL
 */
function readImageDataUrl(value: unknown): string {
  const base64 = stripDataUrlBase64(readRawText(value).trim());
  if (!base64) return '';
  return `data:${detectImageMimeFromBase64(base64)};base64,${base64}`;
}

/**
 * 根据 data URL 推断图片扩展名
 * @param imageData 图片 data URL
 * @returns 文件扩展名
 */
function readImageExtension(imageData: string): string {
  const mime = imageData.match(/^data:([^;]+);base64,/)?.[1];
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

/**
 * 构建导入后的图片文件名
 * @param name 原始名称
 * @param imageData 图片 data URL
 * @returns 带扩展名的文件名
 */
function buildImageFileName(name: string, imageData: string): string {
  const baseName = name.replace(/\.[^.\\/]+$/, '');
  return `${baseName}.${readImageExtension(imageData)}`;
}

/**
 * 通过 base64 头部识别图片 MIME
 * @param base64 原始 base64
 * @returns MIME 类型
 */
function detectImageMimeFromBase64(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
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
  const importInfo = toRecord(record.importInfo);
  const model = readText(record.model) || readText(importInfo.model);
  return isNovelAIModel(model) ? model : DEFAULT_OTHER_PLUGIN_MODEL;
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
 * @param id 其他插件 vibe id
 * @param record Vibe 数据记录
 * @returns 来源 hash
 */
function readSourceHash(id: string, record: Record<string, unknown>): string {
  return readText(record.id) || readText(record.identifier) || `other-plugin-${stableHash(id)}`;
}

/**
 * 读取预设名称
 * @param record 原始记录
 * @param fallbackName 兜底名称
 * @returns 预设名
 */
function readPresetName(record: Record<string, unknown>, fallbackName: string): string {
  return readText(record.name) || readText(record.title) || fallbackName || '其他插件预设';
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
 * 读取普通数组
 * @param value 外部值
 * @returns 数组或空数组
 */
function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 判断对象是否包含任一非空文本字段
 * @param record 普通记录
 * @param fields 字段列表
 * @returns 是否命中
 */
function hasAnyTextField(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some(field => readText(record[field]).length > 0);
}

/**
 * 读取字段列表中的第一个非空文本
 * @param record 普通记录
 * @param fields 字段列表
 * @returns 首个非空文本
 */
function readFirstText(record: Record<string, unknown>, fields: readonly string[]): string {
  return fields.map(field => readText(record[field])).find(Boolean) ?? '';
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
 * 读取原始字符串
 * @param value 外部值
 * @returns 保留原始换行的字符串
 */
function readRawText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 读取布尔值
 * @param value 外部值
 * @param fallback 默认值
 * @returns 布尔值
 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
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
