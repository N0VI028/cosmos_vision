import '@sillytavern/lib/jszip.min';

import { triggerBrowserDownload } from '@/services/browser-download';
import { generateOfficialNovelAIVibeFile } from '@/services/novelai/vibe-official-file';
import type { NovelAIVibeDownloadPayload } from '@/services/novelai/vibe-types';

interface DownloadZipArchive {
  file(name: string, data: BlobPart): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface DownloadZipConstructor {
  new (): DownloadZipArchive;
}

const DownloadJSZip = JSZip as unknown as DownloadZipConstructor;

/**
 * 下载单个官网格式 vibe 文件
 * @param payload 下载载荷
 */
export async function downloadNovelAIVibe(payload: NovelAIVibeDownloadPayload): Promise<void> {
  const file = await generateOfficialNovelAIVibeFile(payload);
  triggerBrowserDownload(file.blob, file.fileName);
}

/**
 * 批量下载官网格式 vibe 文件
 * @param payloads 下载载荷列表
 */
export async function downloadAllNovelAIVibes(payloads: NovelAIVibeDownloadPayload[]): Promise<void> {
  const files = await Promise.all(payloads.map(generateOfficialNovelAIVibeFile));
  const zip = new DownloadJSZip();
  const usedPaths = new Set<string>();
  files.forEach(file => zip.file(getUniquePath(file.fileName, usedPaths), file.blob));
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), 'cosmos-vision-vibes.zip');
}

/**
 * 读取 zip 内唯一文件名
 * @param path 候选文件名
 * @param usedPaths 已占用文件名
 * @returns 唯一文件名
 */
function getUniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }
  const { baseName, extension } = splitFileName(path);
  let suffix = 2;
  let nextPath = `${baseName}-${suffix}${extension}`;
  while (usedPaths.has(nextPath)) {
    suffix += 1;
    nextPath = `${baseName}-${suffix}${extension}`;
  }
  usedPaths.add(nextPath);
  return nextPath;
}

/**
 * 拆分文件名主体与扩展名
 * @param path 原始文件名
 * @returns 主体与扩展名
 */
function splitFileName(path: string): { baseName: string; extension: string } {
  const match = path.match(/^(.*?)(\.[^.\\/]+)?$/);
  return { baseName: match?.[1] || path, extension: match?.[2] || '' };
}
