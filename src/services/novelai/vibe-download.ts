import '@sillytavern/lib/jszip.min';

import { getNovelAIVibeDisplayFileName } from '@/services/novelai/vibe-display';
import type { NovelAIVibeDownloadPayload } from '@/services/novelai/vibe-types';

interface DownloadedNovelAIVibeFile {
  fileName: string;
  vibeData: ArrayBuffer;
  thumbnailFile?: { name: string; data: ArrayBuffer };
}

interface DownloadZipArchive {
  file(name: string, data: BlobPart): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface DownloadZipConstructor {
  new (): DownloadZipArchive;
}

const DownloadJSZip = JSZip as unknown as DownloadZipConstructor;

/**
 * 下载单个 vibe 文件
 * @param payload 下载载荷
 */
export async function downloadNovelAIVibe(payload: NovelAIVibeDownloadPayload): Promise<void> {
  const file = buildDownloadedNovelAIVibeFile(payload);
  if (!file.thumbnailFile) {
    triggerBrowserDownload(new Blob([file.vibeData]), file.fileName);
    return;
  }
  const zip = new DownloadJSZip();
  zip.file(file.fileName, file.vibeData);
  zip.file(file.thumbnailFile.name, file.thumbnailFile.data);
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), replaceFileExtension(file.fileName, 'zip'));
}

/**
 * 下载全部 vibe 文件
 * @param payloads 下载载荷列表
 */
export async function downloadAllNovelAIVibes(payloads: NovelAIVibeDownloadPayload[]): Promise<void> {
  const zip = new DownloadJSZip();
  const usedPaths = new Set<string>();
  payloads.map(buildDownloadedNovelAIVibeFile).forEach(file => appendNovelAIVibeToZip(zip, file, usedPaths));
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), 'cosmos-vision-vibes.zip');
}

/**
 * 解析下载载荷
 * @param payload 下载载荷
 * @returns 可下载文件
 */
function buildDownloadedNovelAIVibeFile(payload: NovelAIVibeDownloadPayload): DownloadedNovelAIVibeFile {
  const fileName = getNovelAIVibeDisplayFileName({ fileName: payload.fileName, hasEncoded: true });
  return {
    fileName,
    vibeData: decodeBase64(payload.encodedData),
    thumbnailFile: payload.thumbnailData ? buildThumbnailFile(payload.thumbnailData) : undefined,
  };
}

/**
 * 构建缩略图文件
 * @param dataUrl 缩略图 data URL
 * @returns 缩略图文件
 */
function buildThumbnailFile(dataUrl: string): { name: string; data: ArrayBuffer } {
  const [mimeHeader, base64 = ''] = dataUrl.split(',', 2);
  const extension = mimeHeader.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)?.[1].split('/')[1] ?? 'png';
  return { name: `thumbnail.${extension}`, data: decodeBase64(base64) };
}

/**
 * 将 vibe 条目写入总压缩包
 * @param zip 压缩包实例
 * @param file 下载文件
 * @param usedPaths 已占用路径
 */
function appendNovelAIVibeToZip(zip: DownloadZipArchive, file: DownloadedNovelAIVibeFile, usedPaths: Set<string>): void {
  if (!file.thumbnailFile) {
    zip.file(getUniquePath(file.fileName, usedPaths), file.vibeData);
    return;
  }
  const folderPath = getUniquePath(stripFileExtension(file.fileName), usedPaths);
  zip.file(`${folderPath}/${file.fileName}`, file.vibeData);
  zip.file(`${folderPath}/${file.thumbnailFile.name}`, file.thumbnailFile.data);
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
  const extension = getFileExtension(path);
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

/**
 * 解码 base64 为 ArrayBuffer
 * @param base64 原始 base64
 * @returns 二进制字节
 */
function decodeBase64(base64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  return (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * 替换文件扩展名
 * @param fileName 原文件名
 * @param extension 新扩展名
 * @returns 新文件名
 */
function replaceFileExtension(fileName: string, extension: string): string {
  return `${stripFileExtension(fileName)}.${extension}`;
}

/**
 * 去掉文件扩展名
 * @param fileName 原文件名
 * @returns 去扩展名后的文件名
 */
function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.\\/]+$/, '');
}

/**
 * 读取文件扩展名
 * @param fileName 原文件名
 * @returns 扩展名
 */
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop() === fileName ? '' : (fileName.split('.').pop() ?? '');
}
