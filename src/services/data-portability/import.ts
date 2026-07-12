import {
  NOVELAI_MODELS,
  type CosmosVisionSettings,
  type NovelAISettings,
  type PromptLlmMessagePreset,
  type PromptLlmMessagePresetSettings,
  type PromptPerson,
  type PromptProfilesSettings,
} from '@/constants/novelai';
import type { ImagePromptPreset, ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  MAX_NOVELAI_VIBES_PER_PRESET,
  type NovelAIVibePreset,
  type NovelAIVibePresetSettings,
} from '@/constants/novelai-vibe';
import type { InlineImageFavoriteRecord } from '@/services/inline-image/favorites-cache';
import { importInlineImageFavoriteRecords } from '@/services/inline-image/favorites-cache';
import { importNovelAIVibeCacheRecords } from '@/services/novelai/vibe-cache';
import {
  countOfficialNovelAIVibeTransferEntries,
  isOfficialNovelAIVibeTransferValue,
  parseOfficialNovelAIVibeTransferContent,
} from '@/services/novelai/vibe-file';
import { importNovelAIVibePayloadsAsPreset } from '@/services/novelai/vibe-import';
import type { NovelAIVibeCacheRecord } from '@/services/novelai/vibe-types';
import { DATA_PORTABILITY_SECTIONS, isDataPortabilitySectionId, type DataPortabilitySectionId } from './sections';
import { isOtherPluginExport, parseOtherPluginExport } from './other-plugin';
import {
  COSMOS_VISION_EXPORT_FORMAT,
  COSMOS_VISION_EXPORT_VERSION,
  type DataImportPreview,
  type DataImportPreviewSection,
  type DataImportResult,
  type DataPortabilityPayload,
  type OfficialVibeImportPreview,
  type PortableInlineFavoriteRecord,
  type PortableNovelAIVibeBundle,
} from './types';

interface DataImportPreviewOptions {
  fileName?: string;
}

/**
 * 解析 JSON 文本并构建导入预览
 * @param text 文件文本
 * @returns 导入预览
 */
export function buildDataImportPreview(text: string, options: DataImportPreviewOptions = {}): DataImportPreview {
  const data = parseJson(text);
  if (isNativeExportFile(data)) return buildNativePreview(data);
  if (isOtherPluginExport(data)) return buildOtherPluginPreview(data);
  if (isOfficialNovelAIVibeTransferValue(data)) return buildOfficialVibePreview(data, text, options.fileName);
  throw new Error('未识别的导入文件格式');
}

/**
 * 应用用户选中的导入 section
 * @param preview 导入预览
 * @param selectedSections 用户选中的 section
 * @param currentSettings 当前设置
 * @returns 导入结果
 */
export async function applyDataImport(
  preview: DataImportPreview,
  selectedSections: readonly DataPortabilitySectionId[],
  currentSettings: CosmosVisionSettings,
): Promise<DataImportResult> {
  const result = createInitialResult(currentSettings, preview.warnings);
  for (const section of selectedSections) {
    await importSection(section, resolvePreviewSectionPayload(preview, section), result);
  }
  result.skipped += preview.sections.length - selectedSections.length;
  return result;
}

/**
 * 读取导入预览里某个 section 的实际载荷
 * @param preview 导入预览
 * @param section 目标 section
 * @returns section 对应载荷
 */
function resolvePreviewSectionPayload(preview: DataImportPreview, section: DataPortabilitySectionId): unknown {
  if (section === 'novelAIVibeBundle' && preview.officialVibeImport) return preview.officialVibeImport;
  return preview.payload[section];
}

/**
 * 解析 JSON
 * @param text JSON 文本
 * @returns 外部数据
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('JSON 解析失败，请选择有效的 JSON 文件');
  }
}

/**
 * 判断是否为 CosmosVision 原生导出文件
 * @param value 外部数据
 * @returns 是否匹配
 */
function isNativeExportFile(value: unknown): boolean {
  const record = toRecord(value);
  return record.format === COSMOS_VISION_EXPORT_FORMAT && record.version === COSMOS_VISION_EXPORT_VERSION;
}

/**
 * 构建原生导入预览
 * @param value 原生导出文件
 * @returns 导入预览
 */
function buildNativePreview(value: unknown): DataImportPreview {
  const record = toRecord(value);
  const payload = toRecord(record.payload) as DataPortabilityPayload;
  const sections = readNativeSections(record.sections, payload).map(section => buildPreviewSection(section, payload[section], []));
  return { source: 'cosmos_vision', label: 'CosmosVision 原生数据', sections, payload, warnings: [] };
}

/**
 * 构建其他插件导入预览
 * @param value 其他插件导出数据
 * @returns 导入预览
 */
function buildOtherPluginPreview(value: unknown): DataImportPreview {
  const parsed = parseOtherPluginExport(value);
  const sections = Object.keys(parsed.payload)
    .filter(isDataPortabilitySectionId)
    .map(section => buildPreviewSection(section, parsed.payload[section], parsed.warnings));
  return { source: 'other_plugin', label: '其他插件兼容数据', sections, payload: parsed.payload, warnings: parsed.warnings };
}

/**
 * 构建官网 vibe 导入预览
 * @param value 官网 vibe JSON
 * @param text 原始 JSON 文本
 * @returns 导入预览
 */
function buildOfficialVibePreview(value: unknown, text: string, fileName?: string): DataImportPreview {
  const count = countOfficialNovelAIVibeTransferEntries(value);
  return {
    source: 'official_vibe',
    label: 'NovelAI Vibe',
    sections: [{ id: 'novelAIVibeBundle', label: getSectionLabel('novelAIVibeBundle'), count, warnings: [] }],
    payload: {},
    officialVibeImport: { text, fileName },
    warnings: [],
  };
}

/**
 * 读取原生导出声明的 section
 * @param value section 列表
 * @param payload payload 对象
 * @returns 合法 section
 */
function readNativeSections(value: unknown, payload: DataPortabilityPayload): DataPortabilitySectionId[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDataPortabilitySectionId).filter(section => section in payload);
}

/**
 * 构建单个 section 预览
 * @param id section id
 * @param payload section payload
 * @param warnings 全局警告
 * @returns section 预览
 */
function buildPreviewSection(id: DataPortabilitySectionId, payload: unknown, warnings: string[]): DataImportPreviewSection {
  return { id, label: getSectionLabel(id), count: countPayloadItems(id, payload), warnings };
}

/**
 * 读取 section 标签
 * @param id section id
 * @returns 标签
 */
function getSectionLabel(id: DataPortabilitySectionId): string {
  return DATA_PORTABILITY_SECTIONS.find(section => section.id === id)?.label ?? id;
}

/**
 * 统计 section 项目数量
 * @param id section id
 * @param payload section payload
 * @returns 数量
 */
function countPayloadItems(id: DataPortabilitySectionId, payload: unknown): number {
  if (id === 'novelAIVibeBundle') return countVibeBundle(payload);
  if (id === 'inlineFavoritesBundle' && Array.isArray(payload)) return payload.length;
  if (id === 'imagePromptPresets') return countPromptPresets(payload);
  return 1;
}

/**
 * 统计 Vibe 完整包数量
 * @param payload section payload
 * @returns 数量
 */
function countVibeBundle(payload: unknown): number {
  const bundle = toRecord(payload);
  return readArray(bundle.presets).length + readArray(bundle.records).length;
}

/**
 * 统计固定提示词预设数量
 * @param payload section payload
 * @returns 数量
 */
function countPromptPresets(payload: unknown): number {
  const presets = toRecord(payload);
  return readArray(presets.positive).length + readArray(presets.negative).length;
}

/**
 * 创建初始导入结果
 * @param settings 当前设置
 * @param warnings 初始警告
 * @returns 导入结果
 */
function createInitialResult(settings: CosmosVisionSettings, warnings: string[]): DataImportResult {
  return { imported: 0, skipped: 0, failed: 0, warnings: [...warnings], settings: _.cloneDeep(settings) };
}

/**
 * 导入单个 section
 * @param section section id
 * @param payload section payload
 * @param result 导入结果
 */
async function importSection(section: DataPortabilitySectionId, payload: unknown, result: DataImportResult): Promise<void> {
  if (payload === undefined) {
    result.skipped += 1;
    return;
  }
  try {
    await createSectionImporters(result)[section](payload);
  } catch (error) {
    result.failed += 1;
    result.warnings.push(error instanceof Error ? error.message : `${section} 导入失败`);
  }
}

/**
 * 创建 section 导入器表
 * @param result 导入结果
 * @returns 导入器表
 */
function createSectionImporters(result: DataImportResult): Record<DataPortabilitySectionId, (payload: unknown) => Promise<void> | void> {
  return {
    basicSettings: payload => assignObjectSection(result.settings, payload, ['enabled', 'imageSource'], result),
    novelAISettings: payload => mergeNovelAISettings(result.settings.novelai, payload, result),
    novelAISecrets: payload => mergeObject(result.settings.novelai, payload, result),
    comfyUISettings: payload => mergeObject(result.settings.comfyui, payload, result),
    imagePromptPresets: payload => importImagePromptPresets(result.settings, payload, result),
    novelAIVibeBundle: payload => importNovelAIVibeBundle(result.settings, payload, result),
    promptLlmSettings: payload => mergeObject(result.settings.promptLlm, payload, result),
    promptLlmMessagePresets: payload => importPromptLlmMessagePresets(result.settings, payload, result),
    promptProfiles: payload => importPromptProfiles(result.settings, payload, result),
    inlineFavoritesBundle: payload => importInlineFavoritesBundle(payload, result),
    uiPreferences: payload => importUiPreferences(payload, result),
  };
}

/**
 * 只赋值对象 section 的指定字段
 * @param target 目标对象
 * @param payload 外部 payload
 * @param keys 字段列表
 * @param result 导入结果
 */
function assignObjectSection<T extends object>(target: T, payload: unknown, keys: readonly (keyof T)[], result: DataImportResult): void {
  const source = toRecord(payload);
  keys.forEach(key => {
    if (key in source) (target as Record<string, unknown>)[key as string] = _.cloneDeep(source[key as string]);
  });
  result.imported += 1;
}

/**
 * 合并普通对象字段
 * @param target 目标对象
 * @param payload 外部 payload
 * @param result 导入结果
 */
function mergeObject(target: object, payload: unknown, result: DataImportResult): void {
  Object.assign(target, _.cloneDeep(toRecord(payload)));
  result.imported += 1;
}

/**
 * 合并 NovelAI 非密钥设置，避免配置导入擦掉本地账号
 * @param target 当前 NovelAI 设置
 * @param payload 外部 payload
 * @param result 导入结果
 */
function mergeNovelAISettings(target: NovelAISettings, payload: unknown, result: DataImportResult): void {
  const source = _.cloneDeep(toRecord(payload));
  delete source.accounts;
  delete source.novelAIVibePresets;
  Object.assign(target, source);
  result.imported += 1;
}

/**
 * 导入提示词 LLM 消息预设(按 id 合并:相同 id 覆盖,本地独有保留,导入独有追加)
 * @param settings 目标设置
 * @param payload 外部 payload
 * @param result 导入结果
 */
function importPromptLlmMessagePresets(settings: CosmosVisionSettings, payload: unknown, result: DataImportResult): void {
  const incoming = toPromptLlmPresetSettings(payload);
  const merged = mergeById(settings.promptLlmMessagePresets.presets, incoming.presets);
  const activePresetId = merged.some(preset => preset.id === incoming.activePresetId)
    ? incoming.activePresetId
    : settings.promptLlmMessagePresets.activePresetId;
  settings.promptLlmMessagePresets = { activePresetId, presets: merged };
  result.imported += incoming.presets.length;
}

/**
 * 导入人物设置(按 id 合并:相同 id 覆盖,本地独有保留,导入独有追加)
 * @param settings 目标设置
 * @param payload 外部 payload
 * @param result 导入结果
 */
function importPromptProfiles(settings: CosmosVisionSettings, payload: unknown, result: DataImportResult): void {
  const incoming = toPromptProfilesSettings(payload);
  settings.promptProfiles = { profiles: mergeById(settings.promptProfiles.profiles, incoming.profiles) };
  result.imported += incoming.profiles.length;
}

/**
 * 导入固定提示词预设
 * @param settings 目标设置
 * @param payload 外部 payload
 * @param result 导入结果
 */
function importImagePromptPresets(settings: CosmosVisionSettings, payload: unknown, result: DataImportResult): void {
  const incoming = toPromptPresetSettings(payload);
  settings.imagePromptPresets = mergePromptPresetSettings(settings.imagePromptPresets, incoming);
  result.imported += incoming.positive.length + incoming.negative.length;
}

/**
 * 导入 NovelAI Vibe 完整包
 * @param settings 目标设置
 * @param payload 外部 payload
 * @param result 导入结果
 */
async function importNovelAIVibeBundle(settings: CosmosVisionSettings, payload: unknown, result: DataImportResult): Promise<void> {
  if (isOfficialVibeImportPreview(payload)) {
    await importOfficialNovelAIVibeBundle(settings, payload, result);
    return;
  }
  const bundle = toVibeBundle(payload, result.warnings);
  const importedRecords = await importNovelAIVibeCacheRecords(bundle.records);
  if (!importedRecords && bundle.presets.length) {
    result.warnings.push('本次导入只写入了 vibe 预设，没有写入任何缓存记录；切换到该预设后会显示为失效。');
  }
  settings.novelai.novelAIVibePresets = mergeNovelAIVibePresetSettings(settings.novelai.novelAIVibePresets, bundle.presets);
  result.imported += importedRecords + bundle.presets.length;
}

/**
 * 导入官网 vibe JSON
 * @param settings 目标设置
 * @param payload 官网 vibe 载荷
 * @param result 导入结果
 */
async function importOfficialNovelAIVibeBundle(
  settings: CosmosVisionSettings,
  payload: OfficialVibeImportPreview,
  result: DataImportResult,
): Promise<void> {
  const source = { name: payload.fileName || 'import.naiv4vibe.json' };
  const payloads = await parseOfficialNovelAIVibeTransferContent(payload.text, source.name);
  const imported = await importNovelAIVibePayloadsAsPreset(source, payloads, {
    model: settings.novelai.model,
    informationExtracted: DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  });
  if (imported.skipped) result.warnings.push(`已忽略 ${imported.skipped} 个超出上限的 vibe`);
  settings.novelai.novelAIVibePresets.presets = [...settings.novelai.novelAIVibePresets.presets, imported.preset];
  settings.novelai.novelAIVibePresets.activePresetId = imported.preset.id;
  result.imported += imported.imported;
}

/**
 * 导入收藏图片完整包
 * @param payload 外部 payload
 * @param result 导入结果
 */
async function importInlineFavoritesBundle(payload: unknown, result: DataImportResult): Promise<void> {
  const records = await toInlineFavoriteRecords(payload);
  result.imported += await importInlineImageFavoriteRecords(records);
}

/**
 * 导入 UI 偏好
 * @param payload 外部 payload
 * @param result 导入结果
 */
function importUiPreferences(payload: unknown, result: DataImportResult): void {
  const darkMode = toRecord(payload).darkMode;
  if (typeof darkMode === 'boolean') result.darkMode = darkMode;
  result.imported += 1;
}

/**
 * 转换固定提示词预设集合
 * @param payload 外部 payload
 * @returns 预设集合
 */
function toPromptPresetSettings(payload: unknown): ImagePromptPresetSettings {
  const record = toRecord(payload);
  return { positive: readPromptPresets(record.positive), negative: readPromptPresets(record.negative) };
}

/**
 * 转换提示词 LLM 消息预设集合
 * @param payload 外部 payload
 * @returns 消息预设集合
 */
function toPromptLlmPresetSettings(payload: unknown): PromptLlmMessagePresetSettings {
  const record = toRecord(payload);
  const activePresetId = typeof record.activePresetId === 'string' ? record.activePresetId : '';
  return { activePresetId, presets: readLlmMessagePresets(record.presets) };
}

/**
 * 转换人物设置集合
 * @param payload 外部 payload
 * @returns 人物设置集合
 */
function toPromptProfilesSettings(payload: unknown): PromptProfilesSettings {
  const record = toRecord(payload);
  return { profiles: readPromptProfiles(record.profiles) };
}

/**
 * 读取提示词预设列表
 * @param value 外部值
 * @returns 预设列表
 */
function readPromptPresets(value: unknown): ImagePromptPreset[] {
  return readArray(value).filter(isPromptPreset).map(preset => _.cloneDeep(preset));
}

/**
 * 读取提示词 LLM 消息预设列表
 * @param value 外部值
 * @returns 消息预设列表
 */
function readLlmMessagePresets(value: unknown): PromptLlmMessagePreset[] {
  return readArray(value).filter(isPromptLlmMessagePreset).map(preset => _.cloneDeep(preset));
}

/**
 * 读取人物设置列表
 * @param value 外部值
 * @returns 人物列表
 */
function readPromptProfiles(value: unknown): PromptPerson[] {
  return readArray(value).filter(isPromptPerson).map(profile => _.cloneDeep(profile));
}

/**
 * 规范化导入的 NovelAI vibe 预设
 * @param preset 外部 vibe 预设
 * @param warnings 警告收集器
 * @returns 截断后的安全预设
 */
function normalizeNovelAIVibePreset(preset: NovelAIVibePreset, warnings: string[]): NovelAIVibePreset {
  const cloned = _.cloneDeep(preset);
  if (cloned.vibes.length > MAX_NOVELAI_VIBES_PER_PRESET) {
    warnings.push(`Vibe 预设「${cloned.name || cloned.id}」超过 ${MAX_NOVELAI_VIBES_PER_PRESET} 个条目，已自动截断。`);
  }
  return { ...cloned, vibes: cloned.vibes.slice(0, MAX_NOVELAI_VIBES_PER_PRESET) };
}

/**
 * 读取 NovelAI vibe 预设列表并收集警告
 * @param value 外部值
 * @param warnings 警告收集器
 * @returns vibe 预设列表
 */
function readNovelAIVibePresetsWithWarnings(value: unknown, warnings: string[]): NovelAIVibePreset[] {
  return readArray(value).filter(isNovelAIVibePreset).map(preset => normalizeNovelAIVibePreset(preset, warnings));
}

/**
 * 合并正负预设集合
 * @param current 当前预设
 * @param incoming 导入预设
 * @returns 合并后的预设
 */
function mergePromptPresetSettings(current: ImagePromptPresetSettings, incoming: ImagePromptPresetSettings): ImagePromptPresetSettings {
  return { positive: mergePresetSide(current.positive, incoming.positive), negative: mergePresetSide(current.negative, incoming.negative) };
}

/**
 * 合并单侧预设(按 id 覆盖:相同 id 用导入项覆盖,本地独有保留,导入独有追加)
 * @param current 当前预设
 * @param incoming 导入预设
 * @returns 合并结果
 */
function mergePresetSide(current: ImagePromptPreset[], incoming: ImagePromptPreset[]): ImagePromptPreset[] {
  return mergeById(current, incoming);
}

/**
 * 合并 NovelAI vibe 预设集合
 * @param current 当前预设集合
 * @param incoming 导入预设列表
 * @returns 合并后的预设集合
 */
function mergeNovelAIVibePresetSettings(
  current: NovelAIVibePresetSettings,
  incoming: NovelAIVibePreset[],
): NovelAIVibePresetSettings {
  const presets = mergeById(current.presets, incoming);
  const activePresetId = presets.some(preset => preset.id === current.activePresetId)
    ? current.activePresetId
    : presets[0]?.id ?? current.activePresetId;
  return { activePresetId, presets };
}

/**
 * 按 id 合并列表:相同 id 用导入项覆盖,本地独有保留,导入独有追加
 * @param current 当前列表
 * @param incoming 导入列表
 * @returns 合并后的列表
 */
function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map(item => [item.id, _.cloneDeep(item)]));
  incoming.forEach(item => merged.set(item.id, _.cloneDeep(item)));
  return [...merged.values()];
}

/**
 * 转换 Vibe 完整包
 * @param payload 外部 payload
 * @returns Vibe 完整包
 */
function toVibeBundle(payload: unknown, warnings: string[] = []): PortableNovelAIVibeBundle {
  const record = toRecord(payload);
  return { presets: readNovelAIVibePresetsWithWarnings(record.presets, warnings), records: readArray(record.records).filter(isVibeRecord) };
}

/**
 * 判断是否为官网 vibe 预览载荷
 * @param payload 外部 payload
 * @returns 是否为官网 vibe 载荷
 */
function isOfficialVibeImportPreview(payload: unknown): payload is OfficialVibeImportPreview {
  const record = toRecord(payload);
  return typeof record.text === 'string';
}

/**
 * 转换收藏图片记录
 * @param payload 外部 payload
 * @returns IndexedDB 收藏记录
 */
async function toInlineFavoriteRecords(payload: unknown): Promise<InlineImageFavoriteRecord[]> {
  const records = readArray(payload).filter(isPortableFavoriteRecord);
  return Promise.all(records.map(toInlineFavoriteRecord));
}

/**
 * 转换单条收藏图片记录
 * @param record JSON 收藏记录
 * @returns IndexedDB 收藏记录
 */
async function toInlineFavoriteRecord(record: PortableInlineFavoriteRecord): Promise<InlineImageFavoriteRecord> {
  return {
    characterKey: record.characterKey,
    chatId: record.chatId,
    slotId: record.slotId,
    imageBlob: dataUrlToBlob(record.imageData, record.imageType),
    promptSnapshot: _.cloneDeep(record.promptSnapshot),
    createdAt: record.createdAt,
  };
}

/**
 * 转换 data URL 为 Blob
 * @param dataUrl data URL
 * @param fallbackType 兜底 MIME
 * @returns Blob
 */
function dataUrlToBlob(dataUrl: string, fallbackType: string): Blob {
  const [header = '', base64 = ''] = dataUrl.split(',', 2);
  const mime = header.match(/^data:([^;]+);base64$/)?.[1] ?? fallbackType;
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/**
 * 判断是否为提示词预设
 * @param value 外部值
 * @returns 是否匹配
 */
function isPromptPreset(value: unknown): value is ImagePromptPreset {
  const record = toRecord(value);
  return typeof record.id === 'string' && typeof record.text === 'string';
}

/**
 * 判断是否为 NovelAI vibe 预设
 * @param value 外部值
 * @returns 是否匹配
 */
function isNovelAIVibePreset(value: unknown): value is NovelAIVibePreset {
  const record = toRecord(value);
  return typeof record.id === 'string' && typeof record.name === 'string' && Array.isArray(record.vibes);
}

/**
 * 判断是否为提示词 LLM 消息预设
 * @param value 外部值
 * @returns 是否匹配
 */
function isPromptLlmMessagePreset(value: unknown): value is PromptLlmMessagePreset {
  const record = toRecord(value);
  return typeof record.id === 'string' && typeof record.name === 'string' && Array.isArray(record.messages);
}

/**
 * 判断是否为人物设置
 * @param value 外部值
 * @returns 是否匹配
 */
function isPromptPerson(value: unknown): value is PromptPerson {
  const record = toRecord(value);
  return typeof record.id === 'string' && typeof record.name === 'string' && Array.isArray(record.templateEntries);
}

/**
 * 判断是否为 Vibe 缓存记录
 * @param value 外部值
 * @returns 是否匹配
 */
function isVibeRecord(value: unknown): value is NovelAIVibeCacheRecord {
  const record = toRecord(value);
  const hasSharedFields = (
    typeof record.sourceHash === 'string' &&
    typeof record.fileName === 'string' &&
    isNovelAIModel(record.model) &&
    typeof record.informationExtracted === 'number' &&
    typeof record.createdAt === 'number'
  );
  if (!hasSharedFields) return false;
  if (record.sourceType === 'image') return typeof record.imageData === 'string';
  if (record.sourceType === 'encoded-vibe') return typeof record.encodedData === 'string';
  return false;
}

/**
 * 判断模型名是否为 CosmosVision 支持的 NovelAI 模型
 * @param value 外部模型名
 * @returns 是否为合法模型
 */
function isNovelAIModel(value: unknown): value is NovelAIVibeCacheRecord['model'] {
  return typeof value === 'string' && NOVELAI_MODELS.some(model => model.value === value);
}

/**
 * 判断是否为 JSON 收藏图片记录（须含 slotId；缺字段视为畸形跳过）
 * @param value 外部值
 * @returns 是否匹配
 */
function isPortableFavoriteRecord(value: unknown): value is PortableInlineFavoriteRecord {
  const record = toRecord(value);
  return (
    typeof record.imageData === 'string' &&
    typeof record.characterKey === 'string' &&
    typeof record.chatId === 'string' &&
    typeof record.slotId === 'string' &&
    record.slotId.length > 0
  );
}

/**
 * 读取普通数组
 * @param value 外部值
 * @returns 数组
 */
function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 读取普通对象
 * @param value 外部值
 * @returns 普通对象
 */
function toRecord(value: unknown): Record<string, unknown> {
  return _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
}
