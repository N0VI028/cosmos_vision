import { describe, expect, it } from 'vitest';
import {
  decodeBase64Image,
  decodeMsgpack,
  isSseContentType,
  parseImageFrames,
  parseMsgpackFrames,
  parseSseFrames,
} from '@/services/novelai/stream-frame';
import type { NovelAIStreamFrame } from '@/services/novelai/stream-frame';

/** 将异步生成器结果收集为数组 */
async function collect(gen: AsyncGenerator<NovelAIStreamFrame, void, unknown>): Promise<NovelAIStreamFrame[]> {
  const out: NovelAIStreamFrame[] = [];
  for await (const frame of gen) out.push(frame);
  return out;
}

/** 创建一次性二进制流 */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** msgpack fixstr 编码 */
function encodeFixStr(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [0xa0 | bytes.length, ...bytes];
}

/** msgpack fixint 编码（0x00-0x7f 正数，0xe0-0xff 负数） */
function encodeFixInt(value: number): number[] {
  return value >= 0 ? [value] : [0x100 + value];
}

/** 手工编码 fixmap：键值对按传入顺序编码 */
function encodeFixMap(entries: Array<[string, number | string]>): Uint8Array {
  const body: number[] = [0x80 | entries.length];
  for (const [key, value] of entries) {
    body.push(...encodeFixStr(key));
    if (typeof value === 'string') body.push(...encodeFixStr(value));
    else body.push(...encodeFixInt(value));
  }
  return new Uint8Array(body);
}

/** 帧格式包装：前拼 4 字节大端长度 */
function frameBytes(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, false);
  out.set(payload, 4);
  return out;
}

/** 构造标准 SSE 事件文本流 */
function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const text = events.join('');
  return streamOf([new TextEncoder().encode(text)]);
}

describe('decodeMsgpack', () => {
  it('decodes fixint positive numbers', () => {
    expect(decodeMsgpack(new Uint8Array([0x05]))).toBe(5);
    expect(decodeMsgpack(new Uint8Array([0x7f]))).toBe(127);
  });

  it('decodes negative numbers from 0xe0 segment and int8', () => {
    expect(decodeMsgpack(new Uint8Array([0xff]))).toBe(-1);
    expect(decodeMsgpack(new Uint8Array([0xe0]))).toBe(-32);
    expect(decodeMsgpack(new Uint8Array([0xd0, 0xfe]))).toBe(-2);
  });

  it('decodes fixstr', () => {
    expect(decodeMsgpack(new Uint8Array([0xa3, 0x61, 0x62, 0x63]))).toBe('abc');
  });

  it('decodes bin 0xc4 as Uint8Array', () => {
    const result = decodeMsgpack(new Uint8Array([0xc4, 0x03, 0x01, 0x02, 0x03]));
    expect(result).toBeInstanceOf(Uint8Array);
    expect([...(result as Uint8Array)]).toEqual([1, 2, 3]);
  });

  it('decodes float32', () => {
    const bytes = new Uint8Array([0xca, 0x3f, 0xc0, 0x00, 0x00]);
    expect(decodeMsgpack(bytes)).toBe(1.5);
  });

  it('decodes nested maps', () => {
    const bytes = new Uint8Array([
      0x81, 0xa1, 0x61, 0x81, 0xa1, 0x62, 0x01,
    ]);
    expect(decodeMsgpack(bytes)).toEqual({ a: { b: 1 } });
  });
});

describe('parseMsgpackFrames', () => {
  it('parses a single frame object', async () => {
    const payload = encodeFixMap([
      ['event_type', 'intermediate'],
      ['samp_ix', 0],
      ['gen_id', 0],
      ['step_ix', 3],
    ]);
    const frames = await collect(parseMsgpackFrames(streamOf([frameBytes(payload)])));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ event_type: 'intermediate', samp_ix: 0, gen_id: 0, step_ix: 3 });
  });

  it('buffers frames across chunk boundaries', async () => {
    const payload = encodeFixMap([
      ['event_type', 'final'],
      ['samp_ix', 1],
      ['gen_id', 2],
    ]);
    const bytes = frameBytes(payload);
    const mid = 3; // 切在长度前缀与载荷之间，验证跨块拼接
    const frames = await collect(
      parseMsgpackFrames(streamOf([bytes.slice(0, mid), bytes.slice(mid)])),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event_type).toBe('final');
    expect(frames[0]?.samp_ix).toBe(1);
    expect(frames[0]?.gen_id).toBe(2);
  });

  it('parses multiple consecutive frames', async () => {
    const p1 = encodeFixMap([['event_type', 'intermediate'], ['samp_ix', 0], ['gen_id', 0]]);
    const p2 = encodeFixMap([['event_type', 'final'], ['samp_ix', 0], ['gen_id', 0]]);
    const frames = await collect(
      parseMsgpackFrames(streamOf([frameBytes(p1), frameBytes(p2)])),
    );
    expect(frames.map((f) => f.event_type)).toEqual(['intermediate', 'final']);
  });

  it('rejects when stream ends at non-frame boundary', async () => {
    const payload = encodeFixMap([['event_type', 'intermediate'], ['samp_ix', 0], ['gen_id', 0]]);
    // 长度声明了完整载荷，但只提供一半字节即关闭流
    const bytes = frameBytes(payload);
    const truncated = bytes.slice(0, 4 + Math.floor(payload.length / 2));
    await expect(collect(parseMsgpackFrames(streamOf([truncated])))).rejects.toThrow(
      'msgpack 流在非帧边界结束',
    );
  });
});

describe('parseImageFrames', () => {
  it('routes event-stream content type to SSE parser', async () => {
    const frames = await collect(
      parseImageFrames(
        sseStream(['event: intermediate\ndata: {"image":"AQID","samp_ix":0}\n\n']),
        'text/event-stream',
      ),
    );
    expect(frames[0]?.event_type).toBe('intermediate');
    expect([...(frames[0]?.image ?? [])]).toEqual([1, 2, 3]);
  });

  it('routes msgpack content type to msgpack parser', async () => {
    const payload = encodeFixMap([['event_type', 'final'], ['samp_ix', 0], ['gen_id', 0]]);
    const frames = await collect(
      parseImageFrames(streamOf([frameBytes(payload)]), 'application/msgpack'),
    );
    expect(frames[0]?.event_type).toBe('final');
  });
});

describe('parseSseFrames', () => {
  it('yields intermediate and final frames with image bytes', async () => {
    const frames = await collect(
      parseSseFrames(
        sseStream([
          'event: intermediate\ndata: {"image":"AQID","samp_ix":0,"step_ix":2}\n\n',
          'event: final\ndata: {"image":"AAECAwQ=","samp_ix":0}\n\n',
        ]),
      ),
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.event_type).toBe('intermediate');
    expect(frames[0]?.samp_ix).toBe(0);
    expect(frames[0]?.step_ix).toBe(2);
    expect([...(frames[0]?.image ?? [])]).toEqual([1, 2, 3]);
    expect(frames[1]?.event_type).toBe('final');
    expect([...(frames[1]?.image ?? [])]).toEqual([0, 1, 2, 3, 4]);
  });

  it('yields error frame on error event', async () => {
    const frames = await collect(
      parseSseFrames(sseStream(['event: error\ndata: {"error":"boom"}\n\n'])),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event_type).toBe('error');
    expect(frames[0]?.error).toBe('boom');
    expect(frames[0]?.message).toBe('boom');
  });

  it('yields fallback error frame when stream ends without final or error', async () => {
    const frames = await collect(
      parseSseFrames(sseStream(['event: intermediate\ndata: {"image":"AQID","samp_ix":0}\n\n'])),
    );
    const last = frames.at(-1);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(last?.event_type).toBe('error');
    expect(last?.message).toBe('流式生成未返回最终图像');
  });
});

describe('decodeBase64Image', () => {
  it('decodes standard base64', () => {
    expect([...(decodeBase64Image('AQID') ?? [])]).toEqual([1, 2, 3]);
  });

  it('decodes data URL prefix', () => {
    expect([...(decodeBase64Image('data:image/png;base64,AQID') ?? [])]).toEqual([1, 2, 3]);
  });

  it('decodes URL-safe base64 characters', () => {
    // 标准编码 ++// 对应 URL-safe --__（4 字符解码为 3 字节）
    expect([...(decodeBase64Image('++//') ?? [])]).toEqual([251, 239, 255]);
    expect([...(decodeBase64Image('--__') ?? [])]).toEqual([251, 239, 255]);
  });

  it('returns undefined for invalid input', () => {
    expect(decodeBase64Image(undefined)).toBeUndefined();
    expect(decodeBase64Image(null)).toBeUndefined();
    expect(decodeBase64Image('')).toBeUndefined();
    expect(decodeBase64Image('!!!!')).toBeUndefined();
    expect(decodeBase64Image('data:image/png;base64')).toBeUndefined();
  });
});

describe('isSseContentType', () => {
  it('detects event-stream content type', () => {
    expect(isSseContentType('text/event-stream')).toBe(true);
  });

  it('rejects non-SSE content type', () => {
    expect(isSseContentType('application/msgpack')).toBe(false);
  });
});
