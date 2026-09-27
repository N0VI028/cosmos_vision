import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { NovelAIAccount } from '@/constants/novelai';
import {
  requestNovelAIAccountImagesStream,
  sniffImageMime,
} from '@/services/novelai/stream-api';
import type { NovelAIFinalPrompts, NovelAIRequestOptions } from '@/services/novelai/types';

/** PNG 文件魔数前 8 字节 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * 编码 msgpack fixstr
 * @param value 字符串
 * @returns 字节数组
 */
function mpstr(value: string): number[] {
  const data = [...new TextEncoder().encode(value)];
  return [0xa0 | data.length, ...data];
}

/**
 * 编码 msgpack 正整数（fixint 或 uint8）
 * @param value 数字
 * @returns 字节数组
 */
function mpint(value: number): number[] {
  return value < 128 ? [value] : [0xcc, value];
}

/**
 * 编码 msgpack bin8
 * @param value 字节数组
 * @returns msgpack 字节
 */
function mpbin(value: number[]): number[] {
  return [0xc4, value.length, ...value];
}

/**
 * 将帧字段编码为 msgpack 对象
 * @param fields 帧字段（string/number/bin）
 * @returns msgpack 字节
 */
function encodeFrame(fields: Record<string, string | number | number[]>): number[] {
  const entries = Object.entries(fields);
  const out: number[] = [0x80 | entries.length];
  for (const [key, value] of entries) {
    out.push(...mpstr(key));
    if (typeof value === 'string') out.push(...mpstr(value));
    else if (typeof value === 'number') out.push(...mpint(value));
    else out.push(...mpbin(value));
  }
  return out;
}

/**
 * 将帧编码为 [4 字节大端长度] + [msgpack] 的流块
 * @param fields 帧字段
 * @returns 流块字节
 */
function frameChunk(fields: Record<string, string | number | number[]>): number[] {
  const frame = encodeFrame(fields);
  const length = frame.length;
  return [(length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...frame];
}

/**
 * 构建按顺序推入块后关闭的 ReadableStream
 * @param chunks 流块字节数组列表
 * @returns 二进制可读流
 */
function createStream(chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

/**
 * 构建带 cancel 侦测的流：不自动关闭，剩余块留在缓冲区，断言是否被主动断开
 * @param chunks 流块字节数组列表
 * @returns 流与 cancel 调用侦测
 */
function createSpyStream(chunks: number[][]): { stream: ReadableStream<Uint8Array>; isCancelled: () => boolean } {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, isCancelled: () => cancelled };
}

/** 构建测试用 NovelAI 账号 */
function createTestAccount(): NovelAIAccount {
  return { id: 'a1', name: 'test', url: 'https://image.novelai.net/', apiKey: 'key', enabled: true };
}

/** 构建测试用提示词 */
function createTestPrompts(): NovelAIFinalPrompts {
  return { positivePrompt: 'test', negativePrompt: '' };
}

/**
 * 将字节数组编码为 base64
 * @param bytes 字节数组
 * @returns base64 字符串
 */
function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * 构建单条 SSE 事件流块（event + data + 空行）
 * @param event 事件名
 * @param data JSON 负载字符串
 * @returns 流块字节数组
 */
function sseChunk(event: string, data: string): number[] {
  return [...new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`)];
}

/** 单张 SSE final 事件的 JSON 负载（samp_ix + base64 图像） */
function sseFinalPayload(sampIx: number): string {
  return JSON.stringify({ samp_ix: sampIx, image: toBase64(PNG_MAGIC) });
}

describe('sniffImageMime', () => {
  it('识别 JPEG/PNG/WEBP/GIF 魔数', () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(new Uint8Array(PNG_MAGIC))).toBe('image/png');
    expect(sniffImageMime(new Uint8Array([...[0x52, 0x49, 0x46, 0x46], 1, 2, 3, 4, ...[0x57, 0x45, 0x42, 0x50]]))).toBe(
      'image/webp',
    );
    expect(sniffImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBe('image/gif');
    expect(sniffImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
  });

  it('未知字节与短字节数组返回 null', () => {
    expect(sniffImageMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff]))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe('requestNovelAIAccountImagesStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 构建基于默认设置的测试参数 */
  function createArgs() {
    return {
      settings: { ...DEFAULT_SETTINGS.novelai },
      prompts: createTestPrompts(),
      account: createTestAccount(),
    };
  }

  it('成功路径：收集 final 图并推送中间帧与最终帧预览', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'intermediate', samp_ix: 0, gen_id: 0, step_ix: 2, image: PNG_MAGIC }),
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: unknown[] = [];
    const options: NovelAIRequestOptions = { onStreamPreview: event => events.push(event) };

    const blobs = await requestNovelAIAccountImagesStream(
      args.settings,
      args.prompts,
      args.account,
      options,
      123,
      1,
    );

    expect(blobs).toHaveLength(1);
    expect(events.length).toBeGreaterThanOrEqual(2);
    const first = events[0] as {
      step: number;
      imageIndex: number;
      completedCount: number;
      totalSteps: number;
      isFinal: boolean;
    };
    expect(first.step).toBe(3);
    expect(first.imageIndex).toBe(0);
    expect(first.completedCount).toBe(0);
    expect(first.totalSteps).toBe(args.settings.steps);
    expect(first.isFinal).toBe(false);
    const last = events.at(-1) as { completedCount: number; step: number; isFinal: boolean };
    expect(last.completedCount).toBe(1);
    expect(last.isFinal).toBe(true);
    // final 帧报满步，不闪回 step_ix+1
    expect(last.step).toBe(args.settings.steps);
  });

  it('error 帧导致 reject 且携带错误信息', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'error', samp_ix: 0, gen_id: 0, error: 'boom' }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 1, 1),
    ).rejects.toThrow('boom');
  });

  it('无 final 帧时 reject 流式生成未返回最终图像', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'intermediate', samp_ix: 0, gen_id: 0, step_ix: 1 }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 1, 1),
    ).rejects.toThrow('流式生成未返回最终图像');
  });

  it('signal 已取消时 reject 已取消生成', async () => {
    const args = createArgs();
    const controller = new AbortController();
    controller.abort();
    const stream = createStream([
      frameChunk({ event_type: 'intermediate', samp_ix: 0, gen_id: 0, step_ix: 1 }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, { signal: controller.signal }, 1, 1),
    ).rejects.toThrow('已取消生成');
  });

  it('HTTP 401 时 reject 包含状态码', async () => {
    const args = createArgs();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('denied', { status: 401 })),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 1, 1),
    ).rejects.toThrow('NovelAI 请求失败: 401');
  });

  it('请求体携带 stream=msgpack 且命中流式端点', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/ai/generate-image-stream')).toBe(true);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { parameters: Record<string, unknown> };
    expect(body.parameters.stream).toBe('msgpack');
  });

  it('同一 samp_ix 重复 final 帧只收集一张且不重复触发预览', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
      frameChunk({ event_type: 'final', samp_ix: 1, gen_id: 0, image: PNG_MAGIC }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );
    const events: { isFinal: boolean; imageIndex: number }[] = [];
    const options: NovelAIRequestOptions = {
      onStreamPreview: event => events.push({ isFinal: event.isFinal, imageIndex: event.imageIndex }),
    };

    const blobs = await requestNovelAIAccountImagesStream(
      args.settings,
      args.prompts,
      args.account,
      options,
      123,
      2,
    );

    expect(blobs).toHaveLength(2);
    const finalEvents = events.filter(event => event.isFinal);
    expect(finalEvents.map(event => event.imageIndex)).toEqual([0, 1]);
  });

  it('收齐 imageCount 个 final 后立即断开响应体，不再消费剩余帧', async () => {
    const args = createArgs();
    // 第二张图的 final 为"服务器尚未结束"时仍在推送的剩余帧，不应被消费
    const { stream, isCancelled } = createSpyStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
      frameChunk({ event_type: 'final', samp_ix: 1, gen_id: 0, image: PNG_MAGIC }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/msgpack' }),
        body: stream,
      })),
    );

    const blobs = await requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1);

    expect(blobs).toHaveLength(1);
    expect(isCancelled()).toBe(true);
  });

  it('msgpack 流仅收到部分 final 时 reject 提示数量不足', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: PNG_MAGIC }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2),
    ).rejects.toThrow('流式生成仅返回 1/2 张图片');
  });

  it('error 帧异常路径下响应体也被 cancel 断流', async () => {
    const args = createArgs();
    const { stream, isCancelled } = createSpyStream([
      frameChunk({ event_type: 'error', samp_ix: 0, gen_id: 0, error: 'boom' }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/msgpack' }),
        body: stream,
      })),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('boom');
    expect(isCancelled()).toBe(true);
  });

  it('SSE 流同 samp_ix 的多张 final 不去重，全部收集', async () => {
    const args = createArgs();
    const stream = createStream([
      sseChunk('final', sseFinalPayload(0)),
      sseChunk('final', sseFinalPayload(0)),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const blobs = await requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2);

    expect(blobs).toHaveLength(2);
  });
});
