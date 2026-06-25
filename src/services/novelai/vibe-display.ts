import type { NovelAIVibeCacheListItem, NovelAIVibeCacheSummary } from '@/services/novelai/vibe-types';

interface NovelAIVibeDisplayEntry {
  fileName: string;
  hasEncoded: boolean;
}

const VIBE_FILE_NAME_PATTERN = /\.vibe\d*$/i;

/**
 * 读取用于 UI 展示的 vibe 文件名
 * 已具备 encodedData 的图片上传条目统一显示为 .vibe 扩展名
 * @param entry vibe 摘要或列表行
 * @returns 展示文件名
 */
export function getNovelAIVibeDisplayFileName(
  entry: NovelAIVibeCacheSummary | NovelAIVibeCacheListItem | NovelAIVibeDisplayEntry,
): string {
  if (!entry.hasEncoded || VIBE_FILE_NAME_PATTERN.test(entry.fileName)) return entry.fileName;
  return replaceFileExtension(entry.fileName, 'vibe');
}

/**
 * 替换文件扩展名
 * @param fileName 原文件名
 * @param extension 新扩展名
 * @returns 替换后的文件名
 */
function replaceFileExtension(fileName: string, extension: string): string {
  const baseName = fileName.replace(/\.[^.\\/]+$/, '');
  return `${baseName}.${extension}`;
}
