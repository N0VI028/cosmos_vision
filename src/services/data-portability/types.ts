import type { CosmosVisionSettings } from '@/constants/novelai';
import type { ImagePromptPreset } from '@/constants/image-prompt';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { NovelAIVibeCacheRecord } from '@/services/novelai/vibe-types';
import type { DataPortabilitySectionId } from '@/services/data-portability/sections';

export const COSMOS_VISION_EXPORT_FORMAT = 'cosmos-vision-portable-data';
export const COSMOS_VISION_EXPORT_VERSION = 1;

/** CosmosVision 原生导出文件 */
export interface CosmosVisionExportFile {
  format: typeof COSMOS_VISION_EXPORT_FORMAT;
  version: typeof COSMOS_VISION_EXPORT_VERSION;
  exportedAt: string;
  appVersion?: string;
  sections: DataPortabilitySectionId[];
  payload: DataPortabilityPayload;
}

/** 数据导入导出 payload */
export type DataPortabilityPayload = Partial<Record<DataPortabilitySectionId, unknown>>;

/** 导入预览来源 */
export type DataImportSource = 'cosmos_vision' | 'other_plugin';

/** 导入预览 section */
export interface DataImportPreviewSection {
  id: DataPortabilitySectionId;
  label: string;
  count: number;
  warnings: string[];
}

/** 导入预览 */
export interface DataImportPreview {
  source: DataImportSource;
  label: string;
  sections: DataImportPreviewSection[];
  payload: DataPortabilityPayload;
  warnings: string[];
}

/** 导入结果摘要 */
export interface DataImportResult {
  imported: number;
  skipped: number;
  failed: number;
  warnings: string[];
  settings: CosmosVisionSettings;
  darkMode?: boolean;
}

/** 收藏图片 JSON 记录 */
export interface PortableInlineFavoriteRecord {
  characterKey: string;
  chatId: string;
  globalParagraphIndex: number;
  mesId?: string;
  swipeId?: number;
  paragraphTextHash?: string;
  imageData: string;
  imageType: string;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

/** Vibe 完整包 */
export interface PortableNovelAIVibeBundle {
  presets: ImagePromptPreset[];
  records: NovelAIVibeCacheRecord[];
}
