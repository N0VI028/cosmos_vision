import '@sillytavern/lib/jszip.min';

import type { InlineImageDownloadOptions } from '@/services/inline-image/download-options';
import { formatTimestampForFileName } from '@/services/inline-image/filename-utils';
import {
  downloadInlineImageBlob,
  transformInlineImageForDownload,
  triggerBrowserDownload,
} from '@/services/inline-image/image-download-transform';
import type {
  InlineImageFavoriteGroup,
  InlineImageFavoriteListItem,
} from '@/services/inline-image/favorites-cache';

interface DownloadZipArchive {
  file(name: string, data: BlobPart): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface DownloadZipConstructor {
  new (): DownloadZipArchive;
}

interface FavoriteDownloadAppendResult {
  succeededCount: number;
  failedCount: number;
}

const DownloadJSZip = JSZip as unknown as DownloadZipConstructor;
const DEFAULT_ARCHIVE_NAME = 'cosmos-vision-inline-image-favorites.zip';
const SELECTED_ARCHIVE_NAME = 'cosmos-vision-selected-favorites.zip';

/**
 * 下载单个收藏图片分组
 * @param group 收藏图片分组
 * @param options 下载配置
 */
export async function downloadInlineImageFavoriteGroup(
  group: InlineImageFavoriteGroup,
  options: InlineImageDownloadOptions,
): Promise<void> {
  if (!group.records.length) return;
  if (group.records.length === 1) {
    await downloadSingleInlineImageFavorite(group, group.records[0], options);
    return;
  }
  await downloadFavoriteRecordsAsZip(group.records, options, `${buildGroupFolderName(group)}.zip`);
}

/**
 * 下载全部收藏图片分组
 * @param groups 收藏图片分组列表
 * @param options 下载配置
 */
export async function downloadAllInlineImageFavoriteGroups(
  groups: InlineImageFavoriteGroup[],
  options: InlineImageDownloadOptions,
): Promise<void> {
  const zip = new DownloadJSZip();
  const usedFolders = new Set<string>();
  let succeededCount = 0;
  let failedCount = 0;
  for (const group of groups) {
    const folder = getUniquePath(buildGroupFolderName(group), usedFolders);
    const result = await appendInlineImageFavoriteGroup(zip, group, options, folder);
    succeededCount += result.succeededCount;
    failedCount += result.failedCount;
  }
  if (!succeededCount) throw new Error('没有可成功导出的收藏图片');
  logFavoriteDownloadSkipSummary(failedCount);
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), DEFAULT_ARCHIVE_NAME);
}

/**
 * 批量下载选中的收藏图片
 * @param ids 选中的收藏记录 ID 列表
 * @param groups 全部收藏图片分组
 * @param options 下载配置
 */
export async function downloadInlineImageFavoriteItems(
  ids: number[],
  groups: InlineImageFavoriteGroup[],
  options: InlineImageDownloadOptions,
): Promise<void> {
  const records = groups.flatMap(group => group.records).filter(record => ids.includes(record.id));
  if (!records.length) return;
  if (records.length === 1) {
    const group = groups.find(candidate => candidate.records.some(record => record.id === records[0]?.id));
    if (group) await downloadSingleInlineImageFavorite(group, records[0], options);
    return;
  }
  await downloadFavoriteRecordsAsZip(records, options, SELECTED_ARCHIVE_NAME);
}

/**
 * 直接下载单张收藏图片
 * @param group 收藏图片分组
 * @param record 收藏记录
 * @param options 下载配置
 */
async function downloadSingleInlineImageFavorite(
  group: InlineImageFavoriteGroup,
  record: InlineImageFavoriteListItem | undefined,
  options: InlineImageDownloadOptions,
): Promise<void> {
  if (!record) return;
  await downloadInlineImageBlob(record.imageBlob, buildDirectDownloadBaseName(group, record), options);
}

/**
 * 把一组收藏记录导出为 ZIP
 * @param records 收藏记录列表
 * @param options 下载配置
 * @param archiveName 压缩包文件名
 */
async function downloadFavoriteRecordsAsZip(
  records: InlineImageFavoriteListItem[],
  options: InlineImageDownloadOptions,
  archiveName: string,
): Promise<void> {
  const zip = new DownloadJSZip();
  const result = await appendInlineImageFavoriteRecords(zip, records, options);
  if (!result.succeededCount) throw new Error('没有可成功导出的收藏图片');
  logFavoriteDownloadSkipSummary(result.failedCount);
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), archiveName);
}

/**
 * 将单个收藏分组写入总压缩包
 * @param zip 压缩包实例
 * @param group 收藏图片分组
 * @param options 下载配置
 * @param folderPath 分组文件夹路径
 */
async function appendInlineImageFavoriteGroup(
  zip: DownloadZipArchive,
  group: InlineImageFavoriteGroup,
  options: InlineImageDownloadOptions,
  folderPath: string,
): Promise<FavoriteDownloadAppendResult> {
  return appendInlineImageFavoriteRecords(zip, group.records, options, `${folderPath}/`);
}

/**
 * 将收藏记录写入压缩包
 * @param zip 压缩包实例
 * @param records 收藏记录列表
 * @param options 下载配置
 * @param prefix 可选路径前缀
 */
async function appendInlineImageFavoriteRecords(
  zip: DownloadZipArchive,
  records: InlineImageFavoriteListItem[],
  options: InlineImageDownloadOptions,
  prefix = '',
): Promise<FavoriteDownloadAppendResult> {
  const usedPaths = new Set<string>();
  const result: FavoriteDownloadAppendResult = { succeededCount: 0, failedCount: 0 };
  for (const [index, record] of records.entries()) {
    try {
      const payload = await transformInlineImageForDownload(record.imageBlob, options);
      const path = getUniquePath(buildZipEntryName(record, index, payload.extension), usedPaths);
      zip.file(`${prefix}${path}`, payload.blob);
      result.succeededCount += 1;
    } catch (error) {
      result.failedCount += 1;
      console.warn(`[CosmosVision] 收藏图片转换失败，已跳过第 ${index + 1} 项`, error);
    }
  }
  return result;
}

/**
 * 构建单张直下文件名主体
 * @param group 收藏图片分组
 * @param record 收藏记录
 * @returns 不含扩展名的文件名
 */
function buildDirectDownloadBaseName(group: InlineImageFavoriteGroup, record: InlineImageFavoriteListItem): string {
  return `${buildGroupFolderName(group)}-${formatFavoriteTimestamp(record.createdAt)}`;
}

/**
 * 构建 ZIP 内图片文件名
 * @param record 收藏记录
 * @param index 当前序号
 * @param extension 目标扩展名
 * @returns 文件名
 */
function buildZipEntryName(
  record: InlineImageFavoriteListItem,
  index: number,
  extension: string,
): string {
  return `${String(index + 1).padStart(3, '0')}-${formatFavoriteTimestamp(record.createdAt)}.${extension}`;
}

/**
 * 构建分组文件夹名
 * @param group 收藏图片分组
 * @returns 文件夹名
 */
function buildGroupFolderName(group: Pick<InlineImageFavoriteGroup, 'characterKey' | 'chatId'>): string {
  return `${sanitizeFileSegment(group.characterKey)}__${sanitizeFileSegment(group.chatId)}`;
}

/**
 * 格式化收藏时间戳
 * @param timestamp 时间戳
 * @returns 文件名安全时间文本
 */
function formatFavoriteTimestamp(timestamp: number): string {
  return formatTimestampForFileName(timestamp);
}

/**
 * 输出收藏图片跳过摘要
 * @param failedCount 失败数量
 */
function logFavoriteDownloadSkipSummary(failedCount: number): void {
  if (failedCount > 0) console.warn(`[CosmosVision] ${failedCount} 张收藏图片转换失败，已跳过`);
}

/**
 * 清洗文件名片段
 * @param value 原始文本
 * @returns 文件名安全片段
 */
function sanitizeFileSegment(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ');
  return normalized.replace(/[. ]+$/g, '') || 'unknown';
}

/**
 * 读取唯一下载路径
 * @param path 候选路径
 * @param usedPaths 已占用路径
 * @returns 唯一路径
 */
function getUniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }
  const extension = getPathExtension(path);
  const baseName = extension ? path.slice(0, -(extension.length + 1)) : path;
  let suffix = 2;
  let nextPath = `${baseName}-${suffix}${extension ? `.${extension}` : ''}`;
  while (usedPaths.has(nextPath)) {
    suffix += 1;
    nextPath = `${baseName}-${suffix}${extension ? `.${extension}` : ''}`;
  }
  usedPaths.add(nextPath);
  return nextPath;
}

/**
 * 读取路径扩展名
 * @param path 原始路径
 * @returns 扩展名
 */
function getPathExtension(path: string): string {
  return path.split('.').pop() === path ? '' : (path.split('.').pop() ?? '');
}
