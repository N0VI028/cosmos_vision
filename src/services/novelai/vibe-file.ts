import type { NovelAIModel } from '@/constants/novelai';
import {
  hashArrayBuffer,
  OFFICIAL_NOVELAI_VIBE_FILE_NAME_PATTERN,
  sha256Text,
} from '@/services/novelai/vibe-shared';
import type { ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
const BASE64_CHUNK_SIZE = 0x8000;
const OFFICIAL_VIBE_IDENTIFIER = 'novelai-vibe-transfer';
const OFFICIAL_VIBE_BUNDLE_IDENTIFIER = 'novelai-vibe-transfer-bundle';
const PNG_NAIDATA_KEYWORD = 'naidata';
const PNG_ITXT_CHUNK_TYPE = 'iTXt';
const OFFICIAL_SUPPORTED_MODELS = new Set<NovelAIModel>([
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-4-full',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
]);
const OFFICIAL_MODEL_KEY_MAP: Record<NovelAIModel, string> = {
  'nai-diffusion-4-5-curated': 'v4-5curated',
  'nai-diffusion-4-5-full': 'v4-5full',
  'nai-diffusion-4-curated-preview': 'v4curated',
  'nai-diffusion-4-full': 'v4full',
  'nai-diffusion-3': '',
  'nai-diffusion-furry-3': '',
};

interface OfficialVibeEncodingEntry {
  encoding: string;
  params?: { information_extracted?: number };
}

interface OfficialVibeTransferEntry {
  identifier: string;
  version: 1;
  type: 'image' | 'encoding';
  id?: string;
  image?: string;
  encodings: Record<string, Record<string, OfficialVibeEncodingEntry>>;
  name: string;
  thumbnail?: string;
  importInfo: {
    model: NovelAIModel;
    information_extracted: number;
    strength: number;
  };
}

interface OfficialVibeTransferBundle {
  identifier: string;
  version: 1;
  vibes: OfficialVibeTransferEntry[];
}

interface FileNameCarrier {
  name: string;
}

/**
 * 解析用户上传的 NovelAI vibe 文件
 * @param file 上传文件
 * @returns 可写入缓存的文件载荷
 */
export async function parseNovelAIVibeFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const payloads = await parseNovelAIVibeFiles(file);
  const [payload] = payloads;
  if (payload) return payload;
  throw new Error('文件中没有可用的 NovelAI vibe');
}

/**
 * 解析用户上传的一个文件为多条 NovelAI vibe
 * @param file 上传文件
 * @returns 可写入缓存的文件载荷列表
 */
export async function parseNovelAIVibeFiles(file: File): Promise<ParsedNovelAIVibeFile[]> {
  if (isImageFile(file)) return parseImageOrEmbeddedVibeFile(file);

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (isOfficialNovelAIVibeFile(file)) throw new Error('官网 vibe 文件内容损坏或结构无效');
    throw new Error('仅支持图片文件或 NovelAI 官方 vibe 文件');
  }

  // 结构完整，或官方扩展名：走深层解析以给出更具体错误
  if (isOfficialNovelAIVibeTransferValue(parsed) || isOfficialNovelAIVibeFile(file)) {
    return parseOfficialVibeTransferText(text, file);
  }
  throw new Error('仅支持图片文件或 NovelAI 官方 vibe 文件');
}

/**
 * 解析官网 vibe JSON 文本
 * @param content 官网 JSON 文本
 * @param fileName 原始文件名
 * @returns 已解析 vibe 载荷列表
 */
export async function parseOfficialNovelAIVibeTransferContent(
  content: string,
  fileName: string,
): Promise<ParsedNovelAIVibeFile[]> {
  return parseOfficialVibeTransferText(content, { name: fileName });
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
export function isOfficialNovelAIVibeFile(file: File): boolean {
  return OFFICIAL_NOVELAI_VIBE_FILE_NAME_PATTERN.test(file.name);
}

/**
 * 判断外部值是否为官网 vibe 结构
 * @param value 外部值
 * @returns 是否为官网 vibe 条目或 bundle
 */
export function isOfficialNovelAIVibeTransferValue(value: unknown): boolean {
  return isOfficialVibeTransferBundle(value) || isOfficialVibeTransferEntry(value);
}

/**
 * 统计官网 vibe 条目数量
 * @param value 外部值
 * @returns 条目数量
 */
export function countOfficialNovelAIVibeTransferEntries(value: unknown): number {
  if (isOfficialVibeTransferBundle(value)) return value.vibes.length;
  return isOfficialVibeTransferEntry(value) ? 1 : 0;
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
 * 解析图片或内嵌官网 bundle 的图片
 * @param file 上传文件
 * @returns 已解析 vibe 载荷列表
 */
async function parseImageOrEmbeddedVibeFile(file: File): Promise<ParsedNovelAIVibeFile[]> {
  const buffer = await file.arrayBuffer();
  const embedded = extractEmbeddedOfficialVibeText(buffer);
  if (embedded) return parseOfficialVibeTransferText(embedded, file);
  return [await parseImageVibeBuffer(file, buffer)];
}

/**
 * 解析官网 vibe 传输文本
 * @param content 官网 JSON 文本
 * @param file 原始上传文件
 * @returns 已解析 vibe 载荷列表
 */
async function parseOfficialVibeTransferText(content: string, file: FileNameCarrier): Promise<ParsedNovelAIVibeFile[]> {
  const entries = parseOfficialVibeJson(content);
  return Promise.all(entries.map((entry, index) => createOfficialVibePayload(file, entry, index)));
}

/**
 * 构建官网 vibe 文件载荷
 * @param file 原始上传文件
 * @param officialEntry 官网 vibe 条目
 * @param index 条目序号
 * @returns 已解析 vibe 载荷
 */
async function createOfficialVibePayload(
  file: FileNameCarrier,
  officialEntry: OfficialVibeTransferEntry,
  index: number,
): Promise<ParsedNovelAIVibeFile> {
  const { cacheSecretKey, entry } = extractOfficialEncodingEntry(officialEntry);
  return {
    sourceHash: await resolveOfficialSourceHash(officialEntry, entry),
    sourceType: 'encoded-vibe',
    fileName: resolveOfficialFileName(file, officialEntry, index),
    imageData: createOfficialImageData(officialEntry),
    encodedData: entry.encoding,
    cacheSecretKey,
    model: officialEntry.importInfo.model,
    referenceStrength: officialEntry.importInfo.strength,
    informationExtracted: entry.params?.information_extracted ?? officialEntry.importInfo.information_extracted,
    thumbnailData: normalizeOfficialThumbnail(officialEntry.thumbnail),
  };
}

/**
 * 构建图片 vibe 文件载荷
 * @param file 上传文件
 * @param buffer 文件二进制
 * @returns 图片 vibe 载荷
 */
async function parseImageVibeBuffer(file: File, buffer: ArrayBuffer): Promise<ParsedNovelAIVibeFile> {
  const sourceHash = await hashArrayBuffer(buffer);
  const mime = file.type || 'application/octet-stream';
  return { sourceHash, sourceType: 'image', fileName: file.name, imageData: `data:${mime};base64,${arrayBufferToBase64(buffer)}` };
}

/**
 * 解析官网 vibe JSON 文本
 * @param content 文件文本
 * @returns 官网 vibe 条目列表
 */
function parseOfficialVibeJson(content: string): OfficialVibeTransferEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('官网 vibe 文件不是有效的 JSON');
  }
  if (isOfficialVibeTransferBundle(parsed)) return parsed.vibes;
  if (isOfficialVibeTransferEntry(parsed)) return [parsed];
  throw new Error('官网 vibe 文件结构无效');
}

/**
 * 判断是否为官网 vibe bundle 结构
 * @param value 待检查值
 * @returns 是否为官网结构
 */
function isOfficialVibeTransferBundle(value: unknown): value is OfficialVibeTransferBundle {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<OfficialVibeTransferBundle>;
  return (
    payload.identifier === OFFICIAL_VIBE_BUNDLE_IDENTIFIER &&
    payload.version === 1 &&
    Array.isArray(payload.vibes) &&
    payload.vibes.every(isOfficialVibeTransferEntry)
  );
}

/**
 * 判断是否为官网 vibe 条目结构
 * @param value 待检查值
 * @returns 是否为官网结构
 */
function isOfficialVibeTransferEntry(value: unknown): value is OfficialVibeTransferEntry {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<OfficialVibeTransferEntry>;
  return (
    payload.identifier === OFFICIAL_VIBE_IDENTIFIER &&
    payload.version === 1 &&
    isOfficialVibeType(payload.type) &&
    hasRequiredOfficialSource(payload) &&
    Boolean(payload.encodings) &&
    typeof payload.encodings === 'object' &&
    typeof payload.name === 'string' &&
    isOfficialImportInfo(payload.importInfo)
  );
}

/**
 * 判断官网 vibe 条目类型是否有效
 * @param value 条目类型
 * @returns 是否有效
 */
function isOfficialVibeType(value: unknown): value is OfficialVibeTransferEntry['type'] {
  return value === 'image' || value === 'encoding';
}

/**
 * 判断官网条目是否带有所需来源字段
 * @param payload 官网条目
 * @returns 是否可解析来源
 */
function hasRequiredOfficialSource(payload: Partial<OfficialVibeTransferEntry>): boolean {
  if (payload.type === 'image') return typeof payload.image === 'string';
  return payload.type === 'encoding' && typeof payload.id === 'string';
}

/**
 * 判断官网 importInfo 是否有效
 * @param value 官网 importInfo
 * @returns 是否有效
 */
function isOfficialImportInfo(value: unknown): value is OfficialVibeTransferEntry['importInfo'] {
  if (!value || typeof value !== 'object') return false;
  const info = value as Partial<OfficialVibeTransferEntry['importInfo']>;
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
function extractOfficialEncodingEntry(file: OfficialVibeTransferEntry): { cacheSecretKey: string; entry: OfficialVibeEncodingEntry } {
  const entries = getOfficialEncodingEntries(file);
  const [cacheSecretKey, entry] = entries[0] ?? [];
  if (cacheSecretKey && entry?.encoding) return { cacheSecretKey, entry };
  throw new Error('官网 .naiv4vibe 文件缺少可用的编码数据');
}

/**
 * 读取官网编码候选
 * @param file 官网 vibe 条目
 * @returns 编码候选列表
 */
function getOfficialEncodingEntries(file: OfficialVibeTransferEntry): Array<[string, OfficialVibeEncodingEntry]> {
  const modelKey = OFFICIAL_MODEL_KEY_MAP[file.importInfo.model];
  const preferred = modelKey ? Object.entries(file.encodings[modelKey] ?? {}) : [];
  return preferred.length ? preferred : Object.values(file.encodings).flatMap(encodings => Object.entries(encodings));
}

/**
 * 读取官网文件展示名
 * @param file 原始上传文件
 * @param officialEntry 官网 vibe 条目
 * @param index 条目序号
 * @returns 展示名
 */
function resolveOfficialFileName(file: FileNameCarrier, officialEntry: OfficialVibeTransferEntry, index: number): string {
  return officialEntry.name.trim() || buildIndexedFileName(file, index);
}

/**
 * 构建多条 bundle 的兜底文件名
 * @param file 原始上传文件
 * @param index 条目序号
 * @returns 兜底文件名
 */
function buildIndexedFileName(file: FileNameCarrier, index: number): string {
  const baseName = file.name.replace(OFFICIAL_NOVELAI_VIBE_FILE_NAME_PATTERN, '');
  return index > 0 ? `${baseName}-${index + 1}` : baseName;
}

/**
 * 解析官网条目来源 hash
 * @param officialEntry 官网 vibe 条目
 * @param encodingEntry 官网编码条目
 * @returns 内部来源 hash
 */
async function resolveOfficialSourceHash(
  officialEntry: OfficialVibeTransferEntry,
  encodingEntry: OfficialVibeEncodingEntry,
): Promise<string> {
  if (officialEntry.id) return officialEntry.id;
  if (officialEntry.image) return sha256Text(officialEntry.image);
  return sha256Text(encodingEntry.encoding);
}

/**
 * 构建官网原图 data URL
 * @param officialEntry 官网 vibe 条目
 * @returns 原图 data URL
 */
function createOfficialImageData(officialEntry: OfficialVibeTransferEntry): string | undefined {
  if (!officialEntry.image) return undefined;
  const imageBytes = decodeBase64Bytes(officialEntry.image, '官网 .naiv4vibe 文件中的图片数据已损坏');
  return `data:${detectImageMime(imageBytes)};base64,${officialEntry.image}`;
}

/**
 * 读取官网缩略图
 * @param value 官网缩略图字段
 * @returns 缩略图 data URL
 */
function normalizeOfficialThumbnail(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/**
 * 从 PNG 中提取官网内嵌 bundle 文本
 * @param buffer PNG 二进制
 * @returns JSON 文本或 null
 */
function extractEmbeddedOfficialVibeText(buffer: ArrayBuffer): string | null {
  const chunk = findPngTextChunk(new Uint8Array(buffer), PNG_NAIDATA_KEYWORD);
  if (!chunk) return null;
  return decodeEmbeddedOfficialText(parsePngITxtText(chunk));
}

/**
 * 查找 PNG iTXt 文本块
 * @param bytes PNG 字节
 * @param keyword 目标关键字
 * @returns 文本块内容或 null
 */
function findPngTextChunk(bytes: Uint8Array, keyword: string): Uint8Array | null {
  if (!matchesPng(bytes)) return null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunk = readPngChunk(bytes, offset);
    if (!chunk) return null;
    if (chunk.type === PNG_ITXT_CHUNK_TYPE && isPngTextKeyword(chunk.data, keyword)) return chunk.data;
    offset += chunk.length + 12;
  }
  return null;
}

/**
 * 读取 PNG chunk
 * @param bytes PNG 字节
 * @param offset chunk 起始位置
 * @returns chunk 信息
 */
function readPngChunk(bytes: Uint8Array, offset: number): { length: number; type: string; data: Uint8Array } | null {
  const length = readUint32(bytes, offset);
  if (offset + 12 + length > bytes.length) return null;
  return {
    length,
    type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)),
    data: bytes.subarray(offset + 8, offset + 8 + length),
  };
}

/**
 * 读取 PNG chunk 长度
 * @param bytes PNG 字节
 * @param offset chunk 起始位置
 * @returns 大端序长度
 */
function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

/**
 * 判断 iTXt 关键字是否匹配
 * @param data iTXt 数据
 * @param keyword 目标关键字
 * @returns 是否匹配
 */
function isPngTextKeyword(data: Uint8Array, keyword: string): boolean {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd <= 0) return false;
  return new TextDecoder().decode(data.subarray(0, keywordEnd)) === keyword;
}

/**
 * 解析 PNG iTXt 文本
 * @param data iTXt 数据
 * @returns 文本内容
 */
function parsePngITxtText(data: Uint8Array): string {
  const keywordEnd = findNullByte(data, 0);
  const compressionFlag = data[keywordEnd + 1] ?? 0;
  if (compressionFlag !== 0) throw new Error('官网内嵌 Vibe PNG 使用了暂不支持的压缩 iTXt');
  return new TextDecoder().decode(data.subarray(findPngITxtTextStart(data, keywordEnd + 3)));
}

/**
 * 读取 iTXt 正文起始位置
 * @param data iTXt 数据
 * @param offset 语言标签起始位置
 * @returns 正文起始位置
 */
function findPngITxtTextStart(data: Uint8Array, offset: number): number {
  const languageEnd = findNullByte(data, offset);
  const translatedEnd = findNullByte(data, languageEnd + 1);
  return translatedEnd + 1;
}

/**
 * 查找空字节
 * @param data 字节数组
 * @param offset 起始位置
 * @returns 空字节位置
 */
function findNullByte(data: Uint8Array, offset: number): number {
  const index = data.indexOf(0, offset);
  if (index >= 0) return index;
  throw new Error('官网内嵌 Vibe PNG 的 iTXt 结构无效');
}

/**
 * 解码 PNG 内嵌的官网 bundle 文本
 * @param value base64 文本
 * @returns JSON 文本
 */
function decodeEmbeddedOfficialText(value: string): string {
  const bytes = decodeBase64Bytes(value.trim(), '官网内嵌 Vibe PNG 的 naidata 已损坏');
  return new TextDecoder().decode(bytes);
}

/**
 * 解码 base64 为二进制字节
 * @param value 原始 base64 文本
 * @param fallback 解码失败文案
 * @returns 二进制字节数组
 */
function decodeBase64Bytes(value: string, fallback: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  } catch {
    throw new Error(fallback);
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
