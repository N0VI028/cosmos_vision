export interface MockZipEntry {
  name: string;
  dir: boolean;
  type?: string;
  data?: unknown;
  async(type: 'blob' | 'string' | 'uint8array' | 'arraybuffer'): Promise<unknown>;
}

interface SerializedMockEntry {
  name: string;
  dir: boolean;
  type?: string;
  base64: string;
}

/**
 * 创建单条 mock entry
 */
function createMockEntry(name: string, data: unknown, type?: string): MockZipEntry {
  return {
    name,
    dir: false,
    type,
    data,
    async: async (format: 'blob' | 'string' | 'uint8array' | 'arraybuffer'): Promise<unknown> => {
      const buffer = await extractDataBuffer(data);
      // 对齐真实 JSZip：async('blob') 不携带 MIME，由调用方按需补 type
      if (format === 'string') return Buffer.from(buffer).toString('utf-8');
      if (format === 'blob') return new Blob([buffer]);
      if (format === 'uint8array') return new Uint8Array(buffer);
      return buffer;
    },
  };
}

/**
 * 提取输入数据的 ArrayBuffer（精准拷贝，避免 Node Buffer Pool 污染）
 */
async function extractDataBuffer(data: unknown): Promise<ArrayBuffer> {
  if (data instanceof Blob) return await data.arrayBuffer();
  if (typeof data === 'string') {
    const buf = Buffer.from(data, 'utf-8');
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
  }
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return ab;
  }
  const buf = Buffer.from(String(data ?? ''), 'utf-8');
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

export default class JSZip {
  files: Record<string, MockZipEntry> = {};

  file(name: string, data?: unknown): this | MockZipEntry | null {
    if (data !== undefined) {
      const type = data instanceof Blob ? data.type : undefined;
      this.files[name] = createMockEntry(name, data, type);
      return this;
    }
    return this.files[name] ?? null;
  }

  async generateAsync(_options?: { type?: string }): Promise<Blob> {
    const entries: SerializedMockEntry[] = [];
    for (const [name, entry] of Object.entries(this.files)) {
      const buffer = await extractDataBuffer(entry.data);
      entries.push({
        name,
        dir: entry.dir,
        type: entry.type,
        base64: Buffer.from(buffer).toString('base64'),
      });
    }

    const payload = JSON.stringify({ mockZip: true, entries });
    const payloadBuf = Buffer.from(payload, 'utf-8');
    const magicHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const totalBuf = Buffer.concat([magicHeader, payloadBuf]);
    return new Blob([totalBuf], { type: 'application/zip' });
  }

  static async loadAsync(data: unknown): Promise<JSZip> {
    const zip = new JSZip();
    try {
      const buffer = await extractDataBuffer(data);
      const buf = Buffer.from(buffer);
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
        const jsonStr = buf.subarray(4).toString('utf-8');
        const parsed = JSON.parse(jsonStr);
        if (parsed?.mockZip && Array.isArray(parsed.entries)) {
          for (const item of parsed.entries) {
            const rawBuf = Buffer.from(item.base64, 'base64');
            const blob = new Blob([rawBuf], { type: item.type || 'application/octet-stream' });
            zip.files[item.name] = createMockEntry(item.name, blob, item.type);
          }
          return zip;
        }
      }
    } catch {
      // 容错回退
    }
    return zip;
  }

  async loadAsync(data: unknown): Promise<JSZip> {
    return JSZip.loadAsync(data);
  }
}

if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as Record<string, unknown>).JSZip = JSZip;
}

