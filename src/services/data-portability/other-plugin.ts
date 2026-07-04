import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  type ImagePromptPreset,
  type ImagePromptPresetSettings,
  type ImagePromptVibeRef,
} from '@/constants/image-prompt';
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';
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
import type { NovelAIVibeCacheRecord } from '@/services/novelai/vibe-types';
import type { DataPortabilityPayload, PortableNovelAIVibeBundle } from '@/services/data-portability/types';
import { normalizePromptLlmMessagePresets } from '@/services/prompt-llm/message-preset';

const DEFAULT_OTHER_PLUGIN_MODEL: NovelAIModel = 'nai-diffusion-4-5-curated';
const OTHER_PLUGIN_POSITIVE_FIELDS = ['fixedPrompt_novelai', 'fixedPrompt_end_novelai'] as const;
const OTHER_PLUGIN_NEGATIVE_FIELD = 'negativePrompt_novelai';
const OTHER_PLUGIN_TRIGGER_WORD_SPLIT_PATTERN = /[\r\n,，、|;；]+/;
const OTHER_PLUGIN_DELETE_MACROS = new Set(['世界书触发', '通用服装启用列表']);
const OTHER_PLUGIN_PROMPT_MACRO_MAP: Record<string, string> = {
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

/**
 * 判断是否为其他插件兼容导出
 * @param value 待判断数据
 * @returns 是否可识别
 */
export function isOtherPluginExport(value: unknown): boolean {
  const record = toRecord(value);
  return hasOtherPluginVibeBundle(record) || collectYushePresetRecords(value).length > 0 || collectOtherPluginPromptPresetSources(value).length > 0;
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
    .split(OTHER_PLUGIN_TRIGGER_WORD_SPLIT_PATTERN)
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
    if (OTHER_PLUGIN_DELETE_MACROS.has(name)) return '';
    return OTHER_PLUGIN_PROMPT_MACRO_MAP[name] ?? `{{${name}}}`;
  });
}

/**
 * 解析 其他插件的 yushe 固定提示词预设
 * @param value 外部 JSON 数据
 * @param warnings 警告收集器
 * @returns 生图固定提示词预设集合
 */
function parseOtherPluginYushePresets(value: unknown, warnings: string[]): ImagePromptPresetSettings | null {
  const sources = collectYushePresetRecords(value);
  const positive = sources.flatMap((source, index) => createPositivePreset(source, index));
  const negative = sources.flatMap((source, index) => createNegativePreset(source, index));
  if (!positive.length && !negative.length) return null;
  if (!positive.length || !negative.length) warnings.push('部分 yushe 预设缺少正面或负面提示词字段，已只导入可识别侧。');
  return { positive: ensurePresetSide(positive, 'other-plugin-positive-empty'), negative: ensurePresetSide(negative, 'other-plugin-negative-empty') };
}

/**
 * 收集包含 yushe 字段的记录
 * @param value 外部 JSON 数据
 * @returns yushe 预设记录
 */
function collectYushePresetRecords(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  walkRecords(value, record => {
    if (hasOtherPluginPromptFields(record)) found.push(record);
  });
  return found;
}

/**
 * 判断记录是否含其他插件固定提示词字段
 * @param record 普通记录
 * @returns 是否命中
 */
function hasOtherPluginPromptFields(record: Record<string, unknown>): boolean {
  return OTHER_PLUGIN_POSITIVE_FIELDS.some(field => typeof record[field] === 'string') || typeof record[OTHER_PLUGIN_NEGATIVE_FIELD] === 'string';
}

/**
 * 创建正面固定提示词预设
 * @param record 其他插件记录
 * @param index 预设序号
 * @returns 正面预设或空数组
 */
function createPositivePreset(record: Record<string, unknown>, index: number): ImagePromptPreset[] {
  const prefix = readText(record.fixedPrompt_novelai);
  const suffix = readText(record.fixedPrompt_end_novelai);
  if (!prefix && !suffix) return [];
  const merged = joinFixedPromptParts(prefix, suffix);
  return [createPromptPreset(`other-plugin-positive-${index + 1}`, readPresetName(record, index), merged.text, merged.offset)];
}

/**
 * 创建负面固定提示词预设
 * @param record 其他插件记录
 * @param index 预设序号
 * @returns 负面预设或空数组
 */
function createNegativePreset(record: Record<string, unknown>, index: number): ImagePromptPreset[] {
  const text = readText(record[OTHER_PLUGIN_NEGATIVE_FIELD]);
  if (!text) return [];
  const offset = clampImagePromptPlaceholderOffset(text, text.length);
  return [createPromptPreset(`other-plugin-negative-${index + 1}`, readPresetName(record, index), text, offset)];
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
  const records = Object.entries(vibeData).flatMap(([id, data]) => createVibeRecord(id, data, warnings));
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
 * 创建单条 Vibe 缓存记录
 * @param id 其他插件 vibe id
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
 * @param id 其他插件 vibe id
 * @param record vibe 数据记录
 * @param encodedData encoded vibe 数据
 * @returns NovelAI Vibe 缓存记录
 */
function buildVibeRecord(id: string, record: Record<string, unknown>, encodedData: string): NovelAIVibeCacheRecord {
  return {
    sourceHash: readSourceHash(id, record),
    sourceType: 'encoded-vibe',
    fileName: `${readText(record.name) || id}.naiv4vibe`,
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
  return [createPromptPreset(`other-plugin-vibe-group-${stableHash(name)}`, name, '', 0),].map(preset => ({ ...preset, vibes }));
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
 * @param index 序号
 * @returns 预设名
 */
function readPresetName(record: Record<string, unknown>, index: number): string {
  return readText(record.name) || readText(record.title) || `其他插件预设 ${index + 1}`;
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
 * 读取普通数组
 * @param value 外部值
 * @returns 数组或空数组
 */
function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
