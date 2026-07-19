import '@sillytavern/lib/jszip.min';

import { triggerBrowserDownload } from '@/services/browser-download';
import { readSillyTavernFileBlob } from '@/services/sillytavern/files';
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
  if (!payload.filePath) throw new Error('当前 Vibe 缺少官方文件路径');
  triggerBrowserDownload(await readSillyTavernFileBlob(payload.filePath), getDownloadFileName(payload.fileName));
}

/**
 * 批量下载官网格式 vibe 文件
 * @param payloads 下载载荷列表
 */
export async function downloadAllNovelAIVibes(payloads: NovelAIVibeDownloadPayload[]): Promise<void> {
  const files = await Promise.all(payloads.map(readDownloadFile));
  const zip = new DownloadJSZip();
  const usedPaths = new Set<string>();
  files.forEach(file => zip.file(getUniquePath(file.fileName, usedPaths), file.blob));
  triggerBrowserDownload(await zip.generateAsync({ type: 'blob' }), 'cosmos-vision-vibes.zip');
}

/** 读取本地官方 Vibe 文件用于下载 */
async function readDownloadFile(payload: NovelAIVibeDownloadPayload): Promise<{ blob: Blob; fileName: string }> {
  if (!payload.filePath) throw new Error(`Vibe 文件路径缺失：${payload.fileName}`);
  return { blob: await readSillyTavernFileBlob(payload.filePath), fileName: getDownloadFileName(payload.fileName) };
}

/** 统一生成官方 Vibe 下载文件名 */
function getDownloadFileName(fileName: string): string {
  return /\.naiv4vibe(?:\.json)?$/i.test(fileName) ? fileName : `${fileName}.naiv4vibe.json`;
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
