const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt']);

type CleanStatus = 'cleaned' | 'skipped' | 'too-large' | 'corrupted' | 'error';

interface CleanResult {
  blob: Blob;
  status: CleanStatus;
}

interface PngChunk {
  type: string;
  endOffset: number;
  raw: Uint8Array;
}

interface ParsedPngChunks {
  hasMetadata: boolean;
  keptChunks: Uint8Array[];
}

/**
 * 清理 PNG 图像元数据
 * @param source 原始图片 Blob
 * @returns 清理后的 PNG Blob
 */
export async function cleanPngDownloadBlob(source: Blob): Promise<Blob> {
  return (await cleanImageMetadata(source)).blob;
}

/**
 * 按 nai-webui 逻辑清理 PNG 文本块和 Alpha LSB 隐写
 * @param file 原始图片 Blob
 * @returns 清理结果
 */
async function cleanImageMetadata(file: Blob): Promise<CleanResult> {
  try {
    if (file.size === 0) return { blob: file, status: 'skipped' };
    if (file.size > MAX_FILE_SIZE) return { blob: file, status: 'too-large' };
    return await cleanPngBytes(file, new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { blob: file, status: 'error' };
  }
}

/**
 * 清理 PNG 字节内容
 * @param file 原始图片 Blob
 * @param bytes PNG 字节
 * @returns 清理结果
 */
async function cleanPngBytes(file: Blob, bytes: Uint8Array): Promise<CleanResult> {
  if (!isPngSignature(bytes)) return { blob: file, status: file.type === 'image/png' ? 'corrupted' : 'skipped' };
  const parsed = parseChunks(bytes);
  if (!parsed) return { blob: file, status: 'corrupted' };
  const hasAlpha = hasAlphaChannel(bytes);
  if (!parsed.hasMetadata && !hasAlpha) return { blob: file, status: 'skipped' };
  return cleanParsedPng(file, parsed, hasAlpha);
}

/**
 * 清理已解析的 PNG 内容
 * @param file 原始图片 Blob
 * @param parsed PNG chunk 解析结果
 * @param hasAlpha 是否包含 Alpha 通道
 * @returns 清理结果
 */
async function cleanParsedPng(file: Blob, parsed: ParsedPngChunks, hasAlpha: boolean): Promise<CleanResult> {
  if (hasAlpha) {
    try {
      return { blob: await cleanAlphaLsb(file), status: 'cleaned' };
    } catch {
      // Canvas 不可用时按 nai-webui 降级为仅移除文本块
    }
  }
  if (!parsed.hasMetadata) return { blob: file, status: 'skipped' };
  return { blob: buildPng(parsed.keptChunks), status: 'cleaned' };
}

/**
 * 验证 PNG 文件签名
 * @param bytes 图片字节
 * @returns 是否为 PNG
 */
function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * 读取 PNG chunk
 * @param view PNG DataView
 * @param bytes PNG 字节
 * @param offset 当前偏移
 * @returns chunk 信息
 */
function readChunk(view: DataView, bytes: Uint8Array, offset: number): PngChunk | null {
  if (offset + 12 > bytes.byteLength) return null;
  const length = view.getUint32(offset);
  if (offset + 12 + length > bytes.byteLength) return null;
  const typeOffset = offset + 4;
  const type = String.fromCharCode(
    bytes[typeOffset] ?? 0,
    bytes[typeOffset + 1] ?? 0,
    bytes[typeOffset + 2] ?? 0,
    bytes[typeOffset + 3] ?? 0,
  );
  const endOffset = offset + 12 + length;
  return { type, endOffset, raw: bytes.subarray(offset, endOffset) };
}

/**
 * 检查 IHDR 颜色类型是否含 Alpha 通道
 * @param bytes PNG 字节
 * @returns 是否包含 Alpha
 */
function hasAlphaChannel(bytes: Uint8Array): boolean {
  if (bytes.length < 26) return false;
  const colorType = bytes[25];
  return colorType === 4 || colorType === 6;
}

/**
 * 解析 PNG chunks 并分离元数据块
 * @param bytes PNG 字节
 * @returns 解析结果
 */
function parseChunks(bytes: Uint8Array): ParsedPngChunks | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const state = { keptChunks: [] as Uint8Array[], offset: PNG_SIGNATURE.length, hasMetadata: false, hasIHDR: false, hasIEND: false };
  while (state.offset < bytes.byteLength) {
    const chunk = readChunk(view, bytes, state.offset);
    if (!chunk) return null;
    consumeChunk(state, chunk);
    if (chunk.type === 'IEND') break;
  }
  return state.hasIHDR && state.hasIEND ? { hasMetadata: state.hasMetadata, keptChunks: state.keptChunks } : null;
}

/**
 * 消费单个 PNG chunk
 * @param state 解析状态
 * @param chunk 当前 chunk
 */
function consumeChunk(
  state: { keptChunks: Uint8Array[]; offset: number; hasMetadata: boolean; hasIHDR: boolean; hasIEND: boolean },
  chunk: PngChunk,
): void {
  if (chunk.type === 'IHDR' && state.keptChunks.length === 0) state.hasIHDR = true;
  if (METADATA_CHUNKS.has(chunk.type)) state.hasMetadata = true;
  else state.keptChunks.push(chunk.raw);
  state.offset = chunk.endOffset;
  if (chunk.type === 'IEND') state.hasIEND = true;
}

/**
 * 从保留 chunks 重建 PNG
 * @param keptChunks 保留的 PNG chunks
 * @returns PNG Blob
 */
function buildPng(keptChunks: Uint8Array[]): Blob {
  const totalLength = keptChunks.reduce((sum, chunk) => sum + chunk.length, PNG_SIGNATURE.length);
  const output = new Uint8Array(totalLength);
  output.set(PNG_SIGNATURE, 0);
  copyChunksToOutput(output, keptChunks);
  return new Blob([output], { type: 'image/png' });
}

/**
 * 复制 PNG chunks 到输出字节
 * @param output 输出字节
 * @param chunks PNG chunks
 */
function copyChunksToOutput(output: Uint8Array, chunks: Uint8Array[]): void {
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
}

/**
 * 使用 Canvas 清除 Alpha 通道 LSB 隐写数据
 * @param blob 原始 PNG Blob
 * @returns 清理后的 PNG Blob
 */
async function cleanAlphaLsb(blob: Blob): Promise<Blob> {
  const image = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('创建离屏画布失败');
  context.drawImage(image, 0, 0);
  cleanAlphaBytes(context, image.width, image.height);
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * 清理画布 Alpha 字节最低有效位
 * @param context 画布上下文
 * @param width 图片宽度
 * @param height 图片高度
 */
function cleanAlphaBytes(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const imageData = context.getImageData(0, 0, width, height);
  for (let i = 3; i < imageData.data.length; i += 4) {
    imageData.data[i] = (imageData.data[i] ?? 0) & 0xfe;
  }
  context.putImageData(imageData, 0, 0);
}
