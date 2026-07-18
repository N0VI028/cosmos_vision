import type { NovelAIModel } from '@/constants/novelai';

/** NovelAI vibe 缓存来源类型 */
export type NovelAIVibeSourceType = 'image' | 'encoded-vibe';

/** NovelAI vibe 文件解析结果 */
export interface ParsedNovelAIVibeFile {
  sourceHash: string;
  sourceType: NovelAIVibeSourceType;
  fileName: string;
  imageData?: string;
  encodedData?: string;
  cacheSecretKey?: string;
  model?: NovelAIModel;
  referenceStrength?: number;
  informationExtracted?: number;
  thumbnailData?: string;
}

/** NovelAI vibe IndexedDB 缓存记录 */
export interface NovelAIVibeCacheRecord {
  id?: number;
  sourceHash: string;
  sourceType: NovelAIVibeSourceType;
  fileName: string;
  model: NovelAIModel;
  informationExtracted: number;
  imageData?: string;
  encodedData?: string;
  cacheSecretKey?: string;
  thumbnailData?: string;
  createdAt: number;
}

/** NovelAI vibe 缓存摘要 */
export interface NovelAIVibeCacheSummary {
  sourceHash: string;
  fileName: string;
  sourceType: NovelAIVibeSourceType;
  hasImage: boolean;
  hasEncoded: boolean;
  hasExactEncoded: boolean;
  thumbnailData?: string;
}

/** NovelAI vibe 列表行 */
export interface NovelAIVibeCacheListItem {
  sourceHash: string;
  fileName: string;
  sourceType: NovelAIVibeSourceType;
  hasImage: boolean;
  hasEncoded: boolean;
  /** 已缓存 encoding 所属的 NovelAI 模型 */
  models: NovelAIModel[];
  thumbnailData?: string;
  createdAt: number;
}

/** NovelAI vibe 下载载荷 */
export interface NovelAIVibeDownloadPayload {
  sourceHash: string;
  fileName: string;
  imageData?: string;
  encodedData: string;
  cacheSecretKey?: string;
  model: NovelAIModel;
  informationExtracted: number;
  referenceStrength: number;
  thumbnailData?: string;
}

/** NovelAI 官方请求中的 vibe 三组数组 */
export interface NovelAIVibeParameters {
  reference_image_multiple: string[];
  reference_strength_multiple: number[];
  reference_information_extracted_multiple: number[];
}

/** NovelAI 测试快照中的 vibe 摘要 */
export interface NovelAIVibeSnapshot {
  count: number;
  resolved: boolean;
  referenceStrengths: number[];
  informationExtracted: number[];
}
