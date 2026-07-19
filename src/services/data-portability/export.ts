import type { CosmosVisionSettings, NovelAISettings } from '@/constants/novelai';
import type { NovelAIVibePreset } from '@/constants/novelai-vibe';
import { triggerBrowserDownload } from '@/services/browser-download';
import { exportInlineImageFavoriteRecords } from '@/services/inline-image/favorites-cache';
import { exportNovelAIVibeCacheRecords } from '@/services/novelai/vibe-cache';
import type { DataPortabilitySectionId } from '@/services/data-portability/sections';
import {
  COSMOS_VISION_EXPORT_FORMAT,
  COSMOS_VISION_EXPORT_VERSION,
  type CosmosVisionExportFile,
  type DataPortabilityPayload,
  type PortableInlineFavoriteRecord,
  type PortableNovelAIVibeBundle,
} from '@/services/data-portability/types';

/**
 * 下载 CosmosVision 可迁移数据文件
 * @param settings 当前设置快照
 * @param darkMode 当前暗色偏好
 * @param sections 用户选中的 section
 * @param appVersion 插件版本号
 */
export async function downloadPortableDataFile(
  settings: CosmosVisionSettings,
  darkMode: boolean,
  sections: readonly DataPortabilitySectionId[],
  appVersion: string,
): Promise<void> {
  const file = await buildPortableDataFile(settings, darkMode, sections, appVersion);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  triggerBrowserDownload(blob, buildExportFileName());
}

/**
 * 构建 CosmosVision 原生导出文件
 * @param settings 当前设置快照
 * @param darkMode 当前暗色偏好
 * @param sections 用户选中的 section
 * @param appVersion 插件版本号
 * @returns 可序列化导出文件
 */
export async function buildPortableDataFile(
  settings: CosmosVisionSettings,
  darkMode: boolean,
  sections: readonly DataPortabilitySectionId[],
  appVersion?: string,
): Promise<CosmosVisionExportFile> {
  return {
    format: COSMOS_VISION_EXPORT_FORMAT,
    version: COSMOS_VISION_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    sections: [...sections],
    payload: await buildPortablePayload(settings, darkMode, sections),
  };
}

/**
 * 构建选中 section 的 payload
 * @param settings 当前设置快照
 * @param darkMode 当前暗色偏好
 * @param sections 用户选中的 section
 * @returns 导出 payload
 */
async function buildPortablePayload(
  settings: CosmosVisionSettings,
  darkMode: boolean,
  sections: readonly DataPortabilitySectionId[],
): Promise<DataPortabilityPayload> {
  const payload: DataPortabilityPayload = {};
  for (const section of sections) await appendPayloadSection(payload, settings, darkMode, section);
  return payload;
}

/**
 * 追加单个导出 section
 * @param payload 当前 payload
 * @param settings 当前设置快照
 * @param darkMode 当前暗色偏好
 * @param section 当前 section
 */
async function appendPayloadSection(
  payload: DataPortabilityPayload,
  settings: CosmosVisionSettings,
  darkMode: boolean,
  section: DataPortabilitySectionId,
): Promise<void> {
  const builders = createSectionBuilders(settings, darkMode);
  payload[section] = await builders[section]();
}

/**
 * 创建 section 构建器表
 * @param settings 当前设置快照
 * @param darkMode 当前暗色偏好
 * @returns section 构建器表
 */
function createSectionBuilders(
  settings: CosmosVisionSettings,
  darkMode: boolean,
): Record<DataPortabilitySectionId, () => Promise<unknown> | unknown> {
  return {
    basicSettings: () => ({
      enabled: settings.enabled,
      temporaryImageLimit: settings.temporaryImageLimit,
      imageSource: settings.imageSource,
    }),
    novelAISettings: () => stripNovelAISecrets(settings.novelai),
    novelAISecrets: () => ({ accounts: settings.novelai.accounts.map(account => ({ ...account })) }),
    comfyUISettings: () => _.cloneDeep(settings.comfyui),
    imagePromptPresets: () => _.cloneDeep(settings.imagePromptPresets),
    novelAIVibeBundle: () => buildNovelAIVibeBundle(settings.novelai.novelAIVibePresets.presets),
    promptLlmSettings: () => _.cloneDeep(settings.promptLlm),
    promptLlmMessagePresets: () => _.cloneDeep(settings.promptLlmMessagePresets),
    promptProfiles: () => _.cloneDeep(settings.promptProfiles),
    inlineFavoritesBundle: () => buildInlineFavoritesBundle(),
    uiPreferences: () => ({ darkMode }),
  };
}

/**
 * 移除 NovelAI 敏感字段
 * @param settings NovelAI 设置
 * @returns 非敏感 NovelAI 设置
 */
function stripNovelAISecrets(settings: NovelAISettings): Omit<NovelAISettings, 'accounts' | 'novelAIVibePresets'> {
  const { accounts: _accounts, novelAIVibePresets: _novelAIVibePresets, ...safeSettings } = _.cloneDeep(settings);
  return safeSettings;
}

/**
 * 构建 NovelAI Vibe 完整包
 * @param presets vibe 预设列表
 * @returns Vibe 完整包
 */
async function buildNovelAIVibeBundle(presets: readonly NovelAIVibePreset[]): Promise<PortableNovelAIVibeBundle> {
  return {
    presets: presets.map(preset => _.cloneDeep(preset)),
    records: await exportNovelAIVibeCacheRecords(),
  };
}

/**
 * 构建收藏图片完整包
 * @returns 可 JSON 序列化的收藏记录
 */
async function buildInlineFavoritesBundle(): Promise<PortableInlineFavoriteRecord[]> {
  const records = await exportInlineImageFavoriteRecords();
  return Promise.all(records.map(record => toPortableFavoriteRecord(record)));
}

/**
 * 转换单条收藏图片记录
 * @param record IndexedDB 收藏记录
 * @returns JSON 收藏记录
 */
async function toPortableFavoriteRecord(record: Awaited<ReturnType<typeof exportInlineImageFavoriteRecords>>[number]): Promise<PortableInlineFavoriteRecord> {
  return {
    characterKey: record.characterKey,
    chatId: record.chatId,
    slotId: record.slotId,
    imageData: await blobToDataUrl(record.imageBlob),
    imageType: record.imageBlob.type || 'image/png',
    promptSnapshot: _.cloneDeep(record.promptSnapshot),
    createdAt: record.createdAt,
  };
}

/**
 * 把 Blob 转成 data URL
 * @param blob 图片 Blob
 * @returns data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('图片数据读取失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

/**
 * 构建导出文件名
 * @returns 文件名
 */
function buildExportFileName(): string {
  return `cosmos-vision-data-${new Date().toISOString().slice(0, 10)}.json`;
}
