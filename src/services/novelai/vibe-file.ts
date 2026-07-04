import type { NovelAIModel } from '@/constants/novelai';
import type { ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

const OFFICIAL_VIBE_FILE_NAME_PATTERN = /\.naiv4vibe$/i;
const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
const BASE64_CHUNK_SIZE = 0x8000;
const OFFICIAL_VIBE_IDENTIFIER = 'novelai-vibe-transfer';
const OFFICIAL_SUPPORTED_MODELS = new Set<NovelAIModel>([
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-4-full',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
]);

interface OfficialVibeEncodingEntry {
  encoding: string;
  params?: { information_extracted?: number };
}

interface OfficialVibeFile {
  identifier: string;
  version: 1;
  type: 'image';
  image: string;
  encodings: Record<string, Record<string, OfficialVibeEncodingEntry>>;
  name: string;
  importInfo: {
    model: NovelAIModel;
    information_extracted: number;
    strength: number;
  };
}

/**
 * 解析用户上传的 NovelAI vibe 文件
 * @param file 上传文件
 * @returns 可写入缓存的文件载荷
 */
export async function parseNovelAIVibeFile(file: File): Promise<ParsedNovelAIVibeFile> {
  if (isOfficialNovelAIVibeFile(file)) return parseOfficialNovelAIVibeFile(file);
  if (isImageFile(file)) return parseImageVibeFile(file);
  throw new Error('仅支持图片文件或 NovelAI 官方 .naiv4vibe 文件');
}

/**
 * 解析用户上传的 vibe 缩略图
 * @param file 缩略图文件
 * @returns 缩略图 data URL
 */
export async function parseNovelAIVibeThumbnailFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('缩略图仅支持图片文件');
  const buffer = await file.arrayBuffer();
  const mime = file.type || 'application/octet-stream';
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
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
  return OFFICIAL_VIBE_FILE_NAME_PATTERN.test(file.name);
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
async function parseOfficialNovelAIVibeFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const officialFile = parseOfficialVibeJson(await file.text());
  const imageBytes = decodeBase64Bytes(officialFile.image);
  const { cacheSecretKey, entry } = extractOfficialEncodingEntry(officialFile);
  return {
    sourceHash: await hashArrayBuffer(toArrayBuffer(imageBytes)),
    sourceType: 'encoded-vibe',
    fileName: resolveOfficialFileName(file, officialFile),
    imageData: `data:${detectImageMime(imageBytes)};base64,${officialFile.image}`,
    encodedData: entry.encoding,
    cacheSecretKey,
    model: officialFile.importInfo.model,
    referenceStrength: officialFile.importInfo.strength,
    informationExtracted: entry.params?.information_extracted ?? officialFile.importInfo.information_extracted,
  };
}

/**
 * 构建图片 vibe 文件载荷
 * @param file 上传文件
 * @returns 图片 vibe 载荷
 */
async function parseImageVibeFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const buffer = await file.arrayBuffer();
  const sourceHash = await hashArrayBuffer(buffer);
  const mime = file.type || 'application/octet-stream';
  return { sourceHash, sourceType: 'image', fileName: file.name, imageData: `data:${mime};base64,${arrayBufferToBase64(buffer)}` };
}

/**
 * 解析官网 vibe JSON 文本
 * @param content 文件文本
 * @returns 官网 vibe 对象
 */
function parseOfficialVibeJson(content: string): OfficialVibeFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('官网 .naiv4vibe 文件不是有效的 JSON');
  }
  if (isOfficialVibeFile(parsed)) return parsed;
  throw new Error('官网 .naiv4vibe 文件结构无效');
}

/**
 * 判断是否为官网 vibe 文件结构
 * @param value 待检查值
 * @returns 是否为官网结构
 */
function isOfficialVibeFile(value: unknown): value is OfficialVibeFile {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<OfficialVibeFile>;
  return (
    payload.identifier === OFFICIAL_VIBE_IDENTIFIER &&
    payload.version === 1 &&
    payload.type === 'image' &&
    typeof payload.image === 'string' &&
    Boolean(payload.encodings) &&
    typeof payload.encodings === 'object' &&
    typeof payload.name === 'string' &&
    isOfficialImportInfo(payload.importInfo)
  );
}

/**
 * 判断官网 importInfo 是否有效
 * @param value 官网 importInfo
 * @returns 是否有效
 */
function isOfficialImportInfo(value: unknown): value is OfficialVibeFile['importInfo'] {
  if (!value || typeof value !== 'object') return false;
  const info = value as Partial<OfficialVibeFile['importInfo']>;
  return (
    typeof info.model === 'string' &&
    OFFICIAL_SUPPORTED_MODELS.has(info.model as NovelAIModel) &&
    Number.isFinite(info.information_extracted) &&
    Number.isFinite(info.strength)
  );
}

/**
 * 提取官网文件中的编码条目
 * @param file 官网 vibe 文件
 * @returns 官网缓存 key 与编码内容
 */
function extractOfficialEncodingEntry(
  file: OfficialVibeFile,
): { cacheSecretKey: string; entry: OfficialVibeEncodingEntry } {
  const modelEncodings = Object.values(file.encodings).find(encodings => Object.keys(encodings).length);
  const [cacheSecretKey, entry] = Object.entries(modelEncodings ?? {})[0] ?? [];
  if (cacheSecretKey && entry?.encoding) return { cacheSecretKey, entry };
  throw new Error('官网 .naiv4vibe 文件缺少可用的编码数据');
}

/**
 * 读取官网文件展示名
 * @param file 原始上传文件
 * @param officialFile 官网 vibe 对象
 * @returns 展示名
 */
function resolveOfficialFileName(file: File, officialFile: OfficialVibeFile): string {
  return officialFile.name.trim() || file.name.replace(OFFICIAL_VIBE_FILE_NAME_PATTERN, '');
}

/**
 * 解码 base64 为二进制字节
 * @param value 原始 base64 文本
 * @returns 二进制字节数组
 */
function decodeBase64Bytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  } catch {
    throw new Error('官网 .naiv4vibe 文件中的图片数据已损坏');
  }
}

/**
 * 识别官网原图的 MIME 类型
 * @param bytes 原图字节
 * @returns MIME 类型
 */
function detectImageMime(bytes: Uint8Array): string {
  if (matchesPng(bytes)) return 'image/png';
  if (matchesJpeg(bytes)) return 'image/jpeg';
  if (matchesWebp(bytes)) return 'image/webp';
  throw new Error('官网 .naiv4vibe 文件中的原图格式不受支持');
}

/**
 * 判断是否为 PNG 图片
 * @param bytes 原图字节
 * @returns 是否为 PNG
 */
function matchesPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/**
 * 判断是否为 JPEG 图片
 * @param bytes 原图字节
 * @returns 是否为 JPEG
 */
function matchesJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * 判断是否为 WEBP 图片
 * @param bytes 原图字节
 * @returns 是否为 WEBP
 */
function matchesWebp(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * 提取字节数组对应的独立 ArrayBuffer
 * @param bytes 原图字节
 * @returns 独立 ArrayBuffer
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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
