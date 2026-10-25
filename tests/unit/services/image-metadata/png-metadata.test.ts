import { describe, expect, it } from 'vitest';
import {
  decompressDeflate,
  readPngTextChunks,
  validatePngSignature,
} from '@/services/image-metadata/png-metadata';

/**
 * 构造包含指定 chunk 的最小有效 PNG Buffer
 */
function createTestPng(chunks: Array<{ type: string; data: Uint8Array }>): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const parts: Uint8Array[] = [new Uint8Array(signature)];

  for (const { type, data } of chunks) {
    const chunkLen = data.length;
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint32(0, chunkLen);
    header[4] = type.charCodeAt(0);
    header[5] = type.charCodeAt(1);
    header[6] = type.charCodeAt(2);
    header[7] = type.charCodeAt(3);

    const crc = new Uint8Array(4); // dummy CRC
    parts.push(header, data, crc);
  }

  // IEND chunk
  const iendHeader = new Uint8Array(8);
  new DataView(iendHeader.buffer).setUint32(0, 0);
  iendHeader.set([0x49, 0x45, 0x4e, 0x44], 4);
  parts.push(iendHeader, new Uint8Array(4));

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

/**
 * 使用 Web 标准 API 压缩文本为 zlib deflate 流
 */
async function compressDeflate(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

/**
 * 创建 tEXt chunk 数据
 */
function createTextChunkData(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const textBytes = enc.encode(text);
  const data = new Uint8Array(kwBytes.length + 1 + textBytes.length);
  data.set(kwBytes, 0);
  data[kwBytes.length] = 0;
  data.set(textBytes, kwBytes.length + 1);
  return data;
}

/**
 * 创建 zTXt chunk 数据 (zlib deflate)
 */
async function createZtxtChunkData(keyword: string, text: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const compressed = await compressDeflate(text);
  const data = new Uint8Array(kwBytes.length + 2 + compressed.length);
  data.set(kwBytes, 0);
  data[kwBytes.length] = 0;
  data[kwBytes.length + 1] = 0; // compression method 0
  data.set(compressed, kwBytes.length + 2);
  return data;
}

/**
 * 创建 iTXt chunk 数据
 */
async function createItxtChunkData(
  keyword: string,
  text: string,
  compressed = false,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const textBytes = compressed ? await compressDeflate(text) : enc.encode(text);
  // keyword + null + flag + method + lang + null + trans + null + text
  const data = new Uint8Array(kwBytes.length + 1 + 2 + 1 + 1 + textBytes.length);
  let pos = 0;
  data.set(kwBytes, pos);
  pos += kwBytes.length;
  data[pos++] = 0; // null
  data[pos++] = compressed ? 1 : 0; // flag
  data[pos++] = 0; // method
  data[pos++] = 0; // null lang
  data[pos++] = 0; // null trans
  data.set(textBytes, pos);
  return data;
}

describe('png-metadata service', () => {
  describe('validatePngSignature', () => {
    it('throws when byte length is less than 8', () => {
      expect(() => validatePngSignature(new Uint8Array(5))).toThrow(
        '不是有效的 PNG 图片格式，元数据提取仅支持 PNG 图片',
      );
    });

    it('throws when signature bytes do not match PNG standard', () => {
      const invalid = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      expect(() => validatePngSignature(invalid)).toThrow(
        '不是有效的 PNG 图片格式，元数据提取仅支持 PNG 图片',
      );
    });

    it('succeeds for valid PNG signature', () => {
      const valid = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(() => validatePngSignature(valid)).not.toThrow();
    });
  });

  describe('decompressDeflate', () => {
    it('decompresses zlib deflate stream accurately', async () => {
      const original = 'Hello Cosmos Vision Metadata!';
      const compressed = await compressDeflate(original);
      const decompressed = await decompressDeflate(compressed);
      expect(new TextDecoder().decode(decompressed)).toBe(original);
    });

    it('returns empty array when input is empty', async () => {
      const res = await decompressDeflate(new Uint8Array(0));
      expect(res.length).toBe(0);
    });
  });

  describe('readPngTextChunks', () => {
    it('parses tEXt chunks from PNG file', async () => {
      const pngBytes = createTestPng([
        { type: 'tEXt', data: createTextChunkData('Comment', 'Test Comment Text') },
      ]);
      const file = new File([pngBytes], 'test.png', { type: 'image/png' });
      const chunks = await readPngTextChunks(file);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ keyword: 'Comment', text: 'Test Comment Text' });
    });

    it('parses zTXt chunks with decompression', async () => {
      const pngBytes = createTestPng([
        {
          type: 'zTXt',
          data: await createZtxtChunkData('Description', '{"prompt": "masterpiece"}'),
        },
      ]);
      const file = new File([pngBytes], 'test.png', { type: 'image/png' });
      const chunks = await readPngTextChunks(file);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ keyword: 'Description', text: '{"prompt": "masterpiece"}' });
    });

    it('parses iTXt chunks (uncompressed and compressed)', async () => {
      const pngBytes = createTestPng([
        { type: 'iTXt', data: await createItxtChunkData('parameters', '1girl, solo', false) },
        { type: 'iTXt', data: await createItxtChunkData('prompt', '{"3": {}}', true) },
      ]);
      const file = new File([pngBytes], 'test.png', { type: 'image/png' });
      const chunks = await readPngTextChunks(file);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ keyword: 'parameters', text: '1girl, solo' });
      expect(chunks[1]).toEqual({ keyword: 'prompt', text: '{"3": {}}' });
    });

    it('throws when PNG signature is invalid', async () => {
      const fakeJpg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'image.jpg', {
        type: 'image/jpeg',
      });
      await expect(readPngTextChunks(fakeJpg)).rejects.toThrow(
        '不是有效的 PNG 图片格式，元数据提取仅支持 PNG 图片',
      );
    });
  });
});
