import type {
  InlineImageDownloadFormat,
  InlineImageDownloadOptions,
} from '@/services/inline-image/download-options';
import { triggerBrowserDownload } from '@/services/browser-download';
import { encodeImageBlobWithCanvas } from '@/services/inline-image/image-canvas-codec';
import { cleanPngDownloadBlob } from '@/services/inline-image/png-metadata-cleaner';

export { triggerBrowserDownload } from '@/services/browser-download';

export interface InlineImageDownloadPayload {
  blob: Blob;
  extension: InlineImageDownloadFormat;
  mimeType: string;
}

/**
 * 按下载配置把图片转换为可下载载荷
 * @param source 原始图片 Blob
 * @param options 下载配置
 * @returns 目标文件 Blob 与扩展名
 */
export async function transformInlineImageForDownload(
  source: Blob,
  options: InlineImageDownloadOptions,
): Promise<InlineImageDownloadPayload> {
  return options.format === 'jpg'
    ? createJpgDownloadPayload(source, options.jpgQuality)
    : createPngDownloadPayload(source, options.cleanMetadata);
}

/**
 * 按下载配置直接触发单图下载
 * @param source 原始图片 Blob
 * @param fileNameBase 不含扩展名的文件名
 * @param options 下载配置
 */
export async function downloadInlineImageBlob(
  source: Blob,
  fileNameBase: string,
  options: InlineImageDownloadOptions,
): Promise<void> {
  const payload = await transformInlineImageForDownload(source, options);
  triggerBrowserDownload(payload.blob, `${fileNameBase}.${payload.extension}`);
}

/**
 * 构建 PNG 下载载荷
 * @param source 原始图片 Blob
 * @param cleanMetadata 是否清理 PNG 元数据
 * @returns PNG 下载载荷
 */
async function createPngDownloadPayload(
  source: Blob,
  cleanMetadata: boolean,
): Promise<InlineImageDownloadPayload> {
  const blob = cleanMetadata ? await convertBlobToCleanPng(source) : await convertBlobToPng(source);
  return { blob, extension: 'png', mimeType: 'image/png' };
}

/**
 * 构建 JPG 下载载荷
 * @param source 原始图片 Blob
 * @param quality JPG 质量
 * @returns JPG 下载载荷
 */
async function createJpgDownloadPayload(source: Blob, quality: number): Promise<InlineImageDownloadPayload> {
  const blob = await encodeImageBlobWithCanvas(source, {
    mimeType: 'image/jpeg',
    quality: clampJpgQuality(quality),
  });
  return { blob, extension: 'jpg', mimeType: 'image/jpeg' };
}

/**
 * 转为 PNG,保留浏览器默认像素数据
 * @param source 原始图片 Blob
 * @returns PNG Blob
 */
async function convertBlobToPng(source: Blob): Promise<Blob> {
  if (source.type === 'image/png') return source;
  return encodeImageBlobWithCanvas(source, { mimeType: 'image/png' });
}

/**
 * 转为已清理元数据的 PNG
 * @param source 原始图片 Blob
 * @returns PNG Blob
 */
async function convertBlobToCleanPng(source: Blob): Promise<Blob> {
  const cleaned = await cleanPngDownloadBlob(source);
  if (cleaned !== source) return cleaned;
  return source.type === 'image/png' ? source : encodeImageBlobWithCanvas(source, { mimeType: 'image/png' });
}

/**
 * 约束 JPG 质量范围
 * @param quality 原始质量值
 * @returns 合法 JPG 质量
 */
function clampJpgQuality(quality: number): number {
  return Math.min(1, Math.max(0.1, quality));
}
