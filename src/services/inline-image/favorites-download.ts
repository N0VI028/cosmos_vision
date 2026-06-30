import '@sillytavern/lib/jszip.min';

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

const DownloadJSZip = JSZip as unknown as DownloadZipConstructor;
const DEFAULT_ARCHIVE_NAME = 'cosmos-vision-inline-image-favorites.zip';

/**
 * 下载单个收藏图片分组
 * @param group 收藏图片分组
 */
export async function downloadInlineImageFavoriteGroup(group: InlineImageFavoriteGroup): Promise<void> {
  if (!group.records.length) return;
  if (group.records.length === 1) {
    downloadSingleInlineImageFavorite(group, group.records[0]);
    return;
  }
  const zip = new DownloadJSZip();
  appendInlineImageFavoriteRecords(zip, group.records);
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), `${buildGroupFolderName(group)}.zip`);
}

/**
 * 下载全部收藏图片分组
 * @param groups 收藏图片分组列表
 */
export async function downloadAllInlineImageFavoriteGroups(groups: InlineImageFavoriteGroup[]): Promise<void> {
  const zip = new DownloadJSZip();
  const usedFolders = new Set<string>();
  groups.forEach(group => appendInlineImageFavoriteGroup(zip, group, getUniquePath(buildGroupFolderName(group), usedFolders)));
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), DEFAULT_ARCHIVE_NAME);
}

/**
 * 批量下载选中的收藏图片
 * @param ids 选中的收藏记录 ID 列表
 * @param groups 全部收藏图片分组
 */
export async function downloadInlineImageFavoriteItems(
  ids: number[],
  groups: InlineImageFavoriteGroup[],
): Promise<void> {
  const records = groups.flatMap(g => g.records).filter(r => ids.includes(r.id));
  if (!records.length) return;
  if (records.length === 1) {
    const record = records[0];
    const group = groups.find(g => g.records.some(r => r.id === record.id));
    if (group) downloadSingleInlineImageFavorite(group, record);
    return;
  }
  const zip = new DownloadJSZip();
  appendInlineImageFavoriteRecords(zip, records);
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), 'cosmos-vision-selected-favorites.zip');
}

/**
 * 直接下载单张收藏图片
 * @param group 收藏图片分组
 * @param record 收藏记录
 */
function downloadSingleInlineImageFavorite(
  group: InlineImageFavoriteGroup,
  record?: InlineImageFavoriteListItem,
): void {
  if (!record) return;
  triggerBrowserDownload(record.imageBlob, buildDirectDownloadName(group, record));
}

/**
 * 将单个收藏分组写入总压缩包
 * @param zip 压缩包实例
 * @param group 收藏图片分组
 * @param folderPath 分组文件夹路径
 */
function appendInlineImageFavoriteGroup(
  zip: DownloadZipArchive,
  group: InlineImageFavoriteGroup,
  folderPath: string,
): void {
  appendInlineImageFavoriteRecords(zip, group.records, `${folderPath}/`);
}

/**
 * 将收藏记录写入压缩包
 * @param zip 压缩包实例
 * @param records 收藏记录列表
 * @param prefix 可选路径前缀
 */
function appendInlineImageFavoriteRecords(
  zip: DownloadZipArchive,
  records: InlineImageFavoriteListItem[],
  prefix = '',
): void {
  const usedPaths = new Set<string>();
  records.forEach((record, index) => {
    const fileName = getUniquePath(buildInlineImageFavoriteFileName(record, index), usedPaths);
    zip.file(`${prefix}${fileName}`, record.imageBlob);
  });
}

/**
 * 构建单张直下文件名
 * @param group 收藏图片分组
 * @param record 收藏记录
 * @returns 下载文件名
 */
function buildDirectDownloadName(group: InlineImageFavoriteGroup, record: InlineImageFavoriteListItem): string {
  return `${buildGroupFolderName(group)}-${formatFavoriteTimestamp(record.createdAt)}.${getImageExtension(record.imageBlob)}`;
}

/**
 * 构建分组内图片文件名
 * @param record 收藏记录
 * @param index 当前序号
 * @returns 文件名
 */
function buildInlineImageFavoriteFileName(record: InlineImageFavoriteListItem, index: number): string {
  return `${String(index + 1).padStart(3, '0')}-${formatFavoriteTimestamp(record.createdAt)}.${getImageExtension(record.imageBlob)}`;
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
 * 读取图片扩展名
 * @param imageBlob 图片 Blob
 * @returns 扩展名
 */
function getImageExtension(imageBlob: Blob): string {
  const extension = imageBlob.type.split('/')[1]?.toLowerCase();
  if (!extension) return 'png';
  return extension === 'jpeg' ? 'jpg' : extension.replace(/[^a-z0-9]+/g, '') || 'png';
}

/**
 * 格式化收藏时间戳
 * @param timestamp 时间戳
 * @returns 文件名安全时间文本
 */
function formatFavoriteTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
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

/**
 * 触发浏览器下载
 * @param blob 文件内容
 * @param fileName 下载文件名
 */
function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
