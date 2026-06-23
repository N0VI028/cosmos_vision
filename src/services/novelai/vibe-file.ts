import type { ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

const VIBE_FILE_NAME_PATTERN = /\.vibe\d*$/i;
const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
const BASE64_CHUNK_SIZE = 0x8000;

/**
 * 解析用户上传的 NovelAI vibe 文件
 * @param file 上传文件
 * @returns 可写入缓存的文件载荷
 */
export async function parseNovelAIVibeFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const buffer = await file.arrayBuffer();
  const sourceHash = await hashArrayBuffer(buffer);
  if (isOfficialNovelAIVibeFile(file)) {
    return buildEncodedVibePayload(file, sourceHash, buffer);
  }
  if (isImageFile(file)) {
    return buildImageVibePayload(file, sourceHash, buffer);
  }
  throw new Error('仅支持图片文件或 NovelAI 官方 .vibe* 二进制文件');
}

/**
 * 提取 data URL 中的 base64 主体
 * @param value 图片 data URL 或纯 base64
 * @returns base64 主体
 */
export function stripDataUrlBase64(value: string): string {
  const marker = ';base64,';
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

/**
 * 转换 ArrayBuffer 为 base64
 * @param buffer 二进制数据
 * @returns base64 文本
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

/**
 * 判断文件是否为官方 vibe 二进制
 * @param file 上传文件
 * @returns 是否为官方 vibe 文件
 */
function isOfficialNovelAIVibeFile(file: File): boolean {
  return VIBE_FILE_NAME_PATTERN.test(file.name);
}

/**
 * 判断文件是否为普通图片
 * @param file 上传文件
 * @returns 是否为图片
 */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_FILE_NAME_PATTERN.test(file.name);
}

/**
 * 构建已解析 vibe 文件载荷
 * @param file 上传文件
 * @param sourceHash 文件 hash
 * @param buffer 文件二进制
 * @returns 已解析 vibe 载荷
 */
function buildEncodedVibePayload(file: File, sourceHash: string, buffer: ArrayBuffer): ParsedNovelAIVibeFile {
  return { sourceHash, sourceType: 'encoded-vibe', fileName: file.name, encodedData: arrayBufferToBase64(buffer) };
}

/**
 * 构建图片 vibe 文件载荷
 * @param file 上传文件
 * @param sourceHash 文件 hash
 * @param buffer 文件二进制
 * @returns 图片 vibe 载荷
 */
function buildImageVibePayload(file: File, sourceHash: string, buffer: ArrayBuffer): ParsedNovelAIVibeFile {
  const mime = file.type || 'application/octet-stream';
  return { sourceHash, sourceType: 'image', fileName: file.name, imageData: `data:${mime};base64,${arrayBufferToBase64(buffer)}` };
}

/**
 * 计算二进制 SHA-256 hash
 * @param buffer 二进制数据
 * @returns 十六进制 hash
 */
async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
