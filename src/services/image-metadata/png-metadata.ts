import type { PngTextChunk } from './types';

/** PNG Chunk 最大长度 (10MB) */
export const MAX_CHUNK_LENGTH = 10 * 1024 * 1024;
/** 解压后单 Chunk 最大体积限制 (10MB) */
export const MAX_DECOMPRESSED_SIZE = 10 * 1024 * 1024;
/** 最大允许解压缩率（防压缩炸弹） */
export const MAX_COMPRESSION_RATIO = 100;
/** 最大遍历 Chunk 数量限制 */
export const MAX_CHUNK_ITERATIONS = 1000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * 校验字节流是否为有效的 PNG 文件签名
 * @param bytes 图像字节数据
 */
export function validatePngSignature(bytes: Uint8Array): void {
  if (bytes.length < 8) {
    throw new Error('不是有效的 PNG 图片格式，元数据提取仅支持 PNG 图片');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('不是有效的 PNG 图片格式，元数据提取仅支持 PNG 图片');
    }
  }
}

/**
 * 使用浏览器的 DecompressionStream 解压 deflate (zlib RFC 1950) 数据流
 * @param data 压缩数据字节
 * @returns 解压后的原始字节
 */
export async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) return new Uint8Array(0);

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalLength += value.length;
    if (totalLength > MAX_DECOMPRESSED_SIZE) {
      await reader.cancel();
      throw new Error('元数据解压后体积超过安全限制');
    }
    if (totalLength / data.length > MAX_COMPRESSION_RATIO) {
      await reader.cancel();
      throw new Error('元数据压缩率异常，疑似压缩炸弹');
    }
    chunks.push(value);
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * 解析 tEXt 类型的文本 Chunk
 * @param data Chunk 数据字节
 * @param decoder 文本解码器
 */
function parseTextChunkRaw(data: Uint8Array, decoder: TextDecoder): PngTextChunk | null {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) return null;
  return {
    keyword: decoder.decode(data.slice(0, nullIndex)),
    text: decoder.decode(data.slice(nullIndex + 1)),
  };
}

/**
 * 解析 zTXt 类型的压缩文本 Chunk
 * @param data Chunk 数据字节
 * @param decoder 文本解码器
 */
async function parseZtxtChunkRaw(data: Uint8Array, decoder: TextDecoder): Promise<PngTextChunk | null> {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1 || nullIndex + 2 > data.length) return null;
  const compressionMethod = data[nullIndex + 1];
  if (compressionMethod !== 0) return null;

  const compressedData = data.slice(nullIndex + 2);
  const decompressed = await decompressDeflate(compressedData);
  return {
    keyword: decoder.decode(data.slice(0, nullIndex)),
    text: decoder.decode(decompressed),
  };
}

/**
 * 解析 iTXt 类型的国际化文本 Chunk
 * @param data Chunk 数据字节
 * @param decoder 文本解码器
 */
async function parseItxtChunkRaw(data: Uint8Array, decoder: TextDecoder): Promise<PngTextChunk | null> {
  const nullIndex1 = data.indexOf(0);
  if (nullIndex1 === -1 || nullIndex1 + 3 > data.length) return null;

  const keyword = decoder.decode(data.slice(0, nullIndex1));
  let pos = nullIndex1 + 1;
  const compressionFlag = data[pos++];
  const compressionMethod = data[pos++];

  const nullIndex2 = data.indexOf(0, pos);
  if (nullIndex2 === -1) return null;
  pos = nullIndex2 + 1;

  const nullIndex3 = data.indexOf(0, pos);
  if (nullIndex3 === -1) return null;
  pos = nullIndex3 + 1;

  let textBytes: Uint8Array = new Uint8Array(data.subarray(pos));
  if (compressionFlag === 1) {
    if (compressionMethod !== 0) return null;
    textBytes = await decompressDeflate(textBytes);
  }

  return {
    keyword,
    text: decoder.decode(textBytes),
  };
}

/**
 * 分发解析单条文本 Chunk (tEXt / zTXt / iTXt)
 * @param type Chunk 类型标识
 * @param data Chunk 负载数据
 * @param decoder 文本解码器
 */
async function parseTextChunk(
  type: string,
  data: Uint8Array,
  decoder: TextDecoder,
): Promise<PngTextChunk | null> {
  try {
    if (type === 'tEXt') return parseTextChunkRaw(data, decoder);
    if (type === 'zTXt') return await parseZtxtChunkRaw(data, decoder);
    if (type === 'iTXt') return await parseItxtChunkRaw(data, decoder);
  } catch {
    return null;
  }
  return null;
}

/**
 * 从 PNG 文件中提取所有文本 Chunk（tEXt、zTXt、iTXt）
 * @param file 待解析的 PNG 文件或 Blob
 * @returns 提取的文本 Chunk 列表
 */
export async function readPngTextChunks(file: File | Blob): Promise<PngTextChunk[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  validatePngSignature(bytes);

  let offset = 8;
  let iterations = 0;
  const chunks: PngTextChunk[] = [];
  const decoder = new TextDecoder('utf-8');

  while (offset < buffer.byteLength && iterations < MAX_CHUNK_ITERATIONS) {
    iterations++;
    if (offset + 8 > buffer.byteLength) break;

    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));

    if (length > MAX_CHUNK_LENGTH) {
      throw new Error('PNG Chunk 长度超过安全限制');
    }
    if (offset + 12 + length > buffer.byteLength) {
      throw new Error('PNG 数据流异常终止或文件损坏');
    }

    const chunkData = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const textChunk = await parseTextChunk(type, chunkData, decoder);
      if (textChunk) chunks.push(textChunk);
    }
    if (type === 'IEND') break;

    offset += 12 + length;
  }

  if (iterations >= MAX_CHUNK_ITERATIONS) {
    throw new Error('PNG Chunk 遍历次数超过安全限制');
  }

  return chunks;
}
