/**
 * WD Tagger 单个标签
 */
export interface WdTag {
  label: string;
  confidence: number;
}

/**
 * WD Tagger 分类标签结果
 */
export interface WdTagResult {
  generalTags: WdTag[];
  characterTags: WdTag[];
}

/**
 * WD Tagger 分析阈值
 */
export interface WdTaggerThresholds {
  general: number;
  character: number;
}

/**
 * WD Tagger 图片来源
 */
export type WdImageSource = 'user-avatar' | 'character-avatar' | 'upload';

/**
 * WD Tagger 默认阈值
 */
export const DEFAULT_WD_TAGGER_THRESHOLDS: WdTaggerThresholds = {
  general: 0.35,
  character: 0.85,
};
