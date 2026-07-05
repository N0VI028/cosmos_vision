import type { ImagePromptPreset, ImagePromptPresetSettings } from '@/constants/image-prompt';
import type { CosmosVisionSettings } from '@/constants/novelai';
import type { NovelAIVibePreset } from '@/constants/novelai-vibe';
import { triggerBrowserDownload } from '@/services/browser-download';
import { applyDataImport, buildDataImportPreview } from '@/services/data-portability/import';
import type { DataPortabilitySectionId } from '@/services/data-portability/sections';
import {
  COSMOS_VISION_EXPORT_FORMAT,
  COSMOS_VISION_EXPORT_VERSION,
  type CosmosVisionExportFile,
  type DataImportPreview,
  type DataImportResult,
  type DataPortabilityPayload,
  type PortableNovelAIVibeBundle,
} from '@/services/data-portability/types';
import { exportNovelAIVibeCacheRecords } from '@/services/novelai/vibe-cache';
import { findNovelAIVibePreset } from '@/services/novelai/vibe-presets';

export type PresetPackageSection = Extract<DataPortabilitySectionId, 'imagePromptPresets' | 'novelAIVibeBundle' | 'promptLlmMessagePresets'>;
export type ImagePromptPresetKind = keyof ImagePromptPresetSettings;

/**
 * 导出当前激活的 LLM 消息预设
 * @param settings 当前设置
 * @param appVersion 插件版本
 */
export function downloadActivePromptLlmPresetPackage(settings: CosmosVisionSettings, appVersion?: string): void {
  const { activePresetId, presets } = settings.promptLlmMessagePresets;
  const preset = presets.find(item => item.id === activePresetId);
  if (!preset) throw new Error('未找到当前激活的 LLM 预设');
  downloadPresetPayloadFile(
    { promptLlmMessagePresets: { activePresetId: preset.id, presets: [_.cloneDeep(preset)] } },
    ['promptLlmMessagePresets'],
    preset.name,
    appVersion,
  );
}

/**
 * 导出当前激活的生图固定提示词预设
 * @param settings 当前设置
 * @param kind 正面或负面
 * @param activePresetId 当前预设 ID
 * @param appVersion 插件版本
 */
export async function downloadActiveImagePromptPresetPackage(
  settings: CosmosVisionSettings,
  kind: ImagePromptPresetKind,
  activePresetId: string,
  appVersion?: string,
): Promise<void> {
  const preset = settings.imagePromptPresets[kind].find(item => item.id === activePresetId);
  if (!preset) throw new Error('未找到当前激活的生图预设');
  await downloadImagePromptPresetPackage(kind, preset, appVersion);
}

/**
 * 导出当前激活的 NovelAI vibe 预设
 * @param settings 当前设置
 * @param appVersion 插件版本
 */
export async function downloadActiveNovelAIVibePresetPackage(
  settings: CosmosVisionSettings,
  appVersion?: string,
): Promise<void> {
  const preset = findNovelAIVibePreset(
    settings.novelai.novelAIVibePresets.presets,
    settings.novelai.novelAIVibePresets.activePresetId,
  );
  if (!preset) throw new Error('未找到当前激活的 NovelAI vibe 预设');
  downloadPresetPayloadFile(
    { novelAIVibeBundle: await buildNovelAIVibeBundle([preset]) },
    ['novelAIVibeBundle'],
    preset.name,
    appVersion,
  );
}

/**
 * 从文件中快速导入指定预设 section
 * @param file 用户选择的 JSON 文件
 * @param section 允许导入的预设 section
 * @param currentSettings 当前设置
 * @returns 导入结果
 */
export async function importPresetPackageFile(
  file: File,
  section: PresetPackageSection,
  currentSettings: CosmosVisionSettings,
): Promise<DataImportResult> {
  const preview = buildDataImportPreview(await file.text());
  if (!preview.sections.some(item => item.id === section)) throw new Error('文件中没有可导入的对应预设');
  return applyDataImport(
    preview,
    resolveImportSections(
      preview.sections.map(item => item.id),
      section,
    ),
    currentSettings,
  );
}

/**
 * 从文件中快速导入单侧生图提示词预设
 * @param file 用户选择的 JSON 文件
 * @param kind 正面或负面
 * @param currentSettings 当前设置
 * @returns 导入结果
 */
export async function importImagePromptPresetPackageFile(
  file: File,
  kind: ImagePromptPresetKind,
  currentSettings: CosmosVisionSettings,
): Promise<DataImportResult> {
  const preview = buildDataImportPreview(await file.text());
  const nextPreview = buildSingleSideImagePromptPreview(preview, kind);
  return applyDataImport(nextPreview, resolveImportSections(nextPreview.sections.map(item => item.id), 'imagePromptPresets'), currentSettings);
}

/**
 * 从文件中快速导入 NovelAI vibe 预设
 * @param file 用户选择的文件
 * @param currentSettings 当前设置
 * @returns 导入结果
 */
export async function importNovelAIVibePresetPackageFile(
  file: File,
  currentSettings: CosmosVisionSettings,
): Promise<DataImportResult> {
  const preview = buildDataImportPreview(await file.text());
  if (!preview.sections.some(section => section.id === 'novelAIVibeBundle')) {
    throw new Error('文件中没有可导入的 NovelAI vibe 预设');
  }
  const result = await applyDataImport(preview, ['novelAIVibeBundle'], currentSettings);
  activateImportedNovelAIVibePreset(result, preview.payload.novelAIVibeBundle);
  return result;
}

/**
 * 单独导入 vibe 预设时优先切换到本次导入的预设
 * @param result 导入结果
 * @param payload 原始 vibe bundle
 */
function activateImportedNovelAIVibePreset(result: DataImportResult, payload: unknown): void {
  const presets = readImportedNovelAIVibePresets(payload);
  if (presets.length !== 1) return;
  const importedPresetId = presets[0].id;
  if (!result.settings.novelai.novelAIVibePresets.presets.some(preset => preset.id === importedPresetId)) return;
  result.settings.novelai.novelAIVibePresets.activePresetId = importedPresetId;
}

/**
 * 读取导入 bundle 里的 vibe 预设列表
 * @param payload 原始 vibe bundle
 * @returns 预设列表
 */
function readImportedNovelAIVibePresets(payload: unknown): NovelAIVibePreset[] {
  const record = _.isPlainObject(payload) ? (payload as Record<string, unknown>) : {};
  const presets = record.presets;
  return Array.isArray(presets) ? presets.filter(isNovelAIVibePreset).map(preset => _.cloneDeep(preset)) : [];
}

/**
 * 判断是否为 NovelAI vibe 预设
 * @param value 外部值
 * @returns 是否为合法预设
 */
function isNovelAIVibePreset(value: unknown): value is NovelAIVibePreset {
  const record = _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
  return typeof record.id === 'string' && Array.isArray(record.vibes);
}

/**
 * 构建单侧生图提示词预设 payload
 * @param kind 正面或负面
 * @param preset 当前预设
 * @returns 导入导出 payload
 */
function buildImagePromptPayload(kind: ImagePromptPresetKind, preset: ImagePromptPreset): ImagePromptPresetSettings {
  const safePreset = _.cloneDeep(preset);
  return { positive: kind === 'positive' ? [safePreset] : [], negative: kind === 'negative' ? [safePreset] : [] };
}

/**
 * 构建只包含单侧生图预设的导入预览
 * @param preview 原始导入预览
 * @param kind 正面或负面
 * @returns 单侧导入预览
 */
function buildSingleSideImagePromptPreview(preview: DataImportPreview, kind: ImagePromptPresetKind): DataImportPreview {
  const presets = readImagePromptPayload(preview.payload.imagePromptPresets, kind);
  if (!presets.length) throw new Error(`文件中没有可导入的${kind === 'positive' ? '正面' : '负面'}预设`);
  return {
    ...preview,
    sections: preview.sections.filter(section => section.id === 'imagePromptPresets'),
    payload: {
      imagePromptPresets: buildImagePromptSidePayload(kind, presets),
    },
  };
}

/**
 * 读取单侧生图预设 payload
 * @param payload 外部 payload
 * @param kind 正面或负面
 * @returns 单侧预设列表
 */
function readImagePromptPayload(payload: unknown, kind: ImagePromptPresetKind): ImagePromptPreset[] {
  const record = _.isPlainObject(payload) ? (payload as Record<string, unknown>) : {};
  const value = record[kind];
  return Array.isArray(value) ? value.filter(isImagePromptPreset).map(preset => _.cloneDeep(preset)) : [];
}

/**
 * 构建只包含单侧的生图预设 payload
 * @param kind 正面或负面
 * @param presets 单侧预设
 * @returns 生图预设 payload
 */
function buildImagePromptSidePayload(kind: ImagePromptPresetKind, presets: ImagePromptPreset[]): ImagePromptPresetSettings {
  return { positive: kind === 'positive' ? presets : [], negative: kind === 'negative' ? presets : [] };
}

/**
 * 判断是否为生图提示词预设
 * @param value 外部值
 * @returns 是否为预设
 */
function isImagePromptPreset(value: unknown): value is ImagePromptPreset {
  const record = _.isPlainObject(value) ? (value as Record<string, unknown>) : {};
  return typeof record.id === 'string' && typeof record.text === 'string';
}

/**
 * 下载单个生图提示词预设
 * @param kind 正面或负面
 * @param preset 当前预设
 * @param appVersion 插件版本
 */
async function downloadImagePromptPresetPackage(
  kind: ImagePromptPresetKind,
  preset: ImagePromptPreset,
  appVersion?: string,
): Promise<void> {
  downloadPresetPayloadFile({ imagePromptPresets: buildImagePromptPayload(kind, preset) }, ['imagePromptPresets'], preset.name, appVersion);
}

/**
 * 构建 NovelAI vibe 完整包
 * @param presets 当前要导出的 vibe 预设
 * @returns Vibe 完整包
 */
async function buildNovelAIVibeBundle(presets: readonly NovelAIVibePreset[]): Promise<PortableNovelAIVibeBundle> {
  const sourceHashes = new Set(presets.flatMap(preset => preset.vibes.map(vibe => vibe.sourceHash)));
  const records = (await exportNovelAIVibeCacheRecords()).filter(record => sourceHashes.has(record.sourceHash));
  return { presets: presets.map(preset => _.cloneDeep(preset)), records };
}

/**
 * 下载预设 payload 文件
 * @param payload 导出内容
 * @param section 导出 section
 * @param presetName 预设名称
 * @param appVersion 插件版本
 */
function downloadPresetPayloadFile(
  payload: DataPortabilityPayload,
  sections: readonly DataPortabilitySectionId[],
  presetName: string,
  appVersion?: string,
): void {
  const file = buildPresetExportFile(payload, sections, appVersion);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  triggerBrowserDownload(blob, buildPresetFileName(sections, presetName));
}

/**
 * 构建原生预设导出文件
 * @param payload 导出内容
 * @param section 导出 section
 * @param appVersion 插件版本
 * @returns 原生导出文件
 */
function buildPresetExportFile(
  payload: DataPortabilityPayload,
  sections: readonly DataPortabilitySectionId[],
  appVersion?: string,
): CosmosVisionExportFile {
  return {
    format: COSMOS_VISION_EXPORT_FORMAT,
    version: COSMOS_VISION_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    sections: [...sections],
    payload,
  };
}

/**
 * 构建预设文件名
 * @param section 预设 section
 * @param presetName 预设名称
 * @returns 文件名
 */
function buildPresetFileName(sections: readonly DataPortabilitySectionId[], presetName: string): string {
  const scope = resolvePresetFileScope(sections);
  return `cosmos-vision-${scope}-${normalizeFileNamePart(presetName)}-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * 解析预设文件名作用域
 * @param sections 当前导出 section
 * @returns 文件名前缀
 */
function resolvePresetFileScope(sections: readonly DataPortabilitySectionId[]): string {
  if (sections.includes('promptLlmMessagePresets')) return 'llm';
  if (sections.includes('novelAIVibeBundle')) return 'novelai-vibe';
  return 'image-prompt';
}

/**
 * 解析快速导入允许应用的 section
 * @param available 文件中存在的 section
 * @param primary 目标主 section
 * @returns 本次导入 section 列表
 */
function resolveImportSections(
  available: readonly DataPortabilitySectionId[],
  primary: PresetPackageSection,
): DataPortabilitySectionId[] {
  return available.filter(section => section === primary);
}

/**
 * 规范化文件名片段
 * @param value 原始名称
 * @returns 可用于文件名的片段
 */
function normalizeFileNamePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'preset'
  );
}
