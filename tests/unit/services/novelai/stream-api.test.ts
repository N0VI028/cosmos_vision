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

/** PNG IEND 块结尾标记（IEND 关键字 + CRC） */
const PNG_IEND_TAIL = [0x49, 0x4e, 0x45, 0x44, 0xae, 0x42, 0x60, 0x82];

/**
 * 构建以 IEND 结尾的合成 PNG 字节（停滞抢救按结尾标记校验图像完整性）
 * @param fill 差异填充字节
 * @returns 字节数组
 */
function completePngBytes(fill: number): number[] {
  return [...PNG_MAGIC, fill, fill, fill, ...PNG_IEND_TAIL];
}

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
    vi.useRealTimers();
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

  it('200 + JSON 负载时 reject 提示该源可能不支持流式生成', async () => {
    const args = createArgs();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"error":"File not found"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 1, 1),
    ).rejects.toThrow('该源可能不支持流式生成');
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

  it('msgpack 流收到数据后 30 秒无新分块时 reject 停滞错误', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // 中转站连接中途死亡的真实形态：发过中间帧后既无数据也不关流
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(frameChunk({ event_type: 'intermediate', samp_ix: 0, gen_id: 0, step_ix: 5 })));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('流式连接 30 秒无新数据');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 流收到数据后 30 秒无新分块时 reject 停滞错误', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(sseChunk('intermediate', sseFinalPayload(0))));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('流式连接 30 秒无新数据');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
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

  it('SSE 同 samp_ix 字节相同的多张 final 去重，收不齐时按数量不足报错', async () => {
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

    await expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2),
    ).rejects.toThrow('流式生成仅返回 1/2 张图片');
  });

  it('SSE 同 samp_ix 字节不同的多张 final（不规范中转）全部收集', async () => {
    const args = createArgs();
    const stream = createStream([
      sseChunk('final', JSON.stringify({ samp_ix: 0, image: toBase64(completePngBytes(0x01)) })),
      sseChunk('final', JSON.stringify({ samp_ix: 0, image: toBase64(completePngBytes(0x02)) })),
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

  it('SSE final 事件缺结尾空行且中转不关连接时，停滞抢救出最终图', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // 中转缺陷形态：final 数据完整送达，但事件后无空行分隔、连接挂住不关
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64(completePngBytes(0x11)) })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).resolves.toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE final 数据行有换行仅缺结尾空行时同样可抢救（走未决事件派发路径）', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // data 行以 \n 结束但无空行：事件滞留在未决缓冲，靠 dispatchEvent 抢救
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64(completePngBytes(0x21)) })}\n`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).resolves.toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 抢救仅救出部分图时按数量不足报错，触发上层故障转移', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64(completePngBytes(0x31)) })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2),
    ).rejects.toThrow('流式生成仅返回 1/2 张图片');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 停滞抢救支持完整 JPEG（EOI 结尾）final', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    const jpegBytes = [0xff, 0xd8, 0xff, 0x11, 0x22, 0xff, 0xd9];
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64(jpegBytes) })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).resolves.toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 停滞抢救支持完整 WebP（RIFF 长度闭合）与 GIF（trailer 结尾）final', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // WebP：RIFF 头 + 小端长度(总长-8) + WEBP 标记 + 载荷；GIF：头 + 载荷 + 0x3B trailer；单事件 images 数组双图
    const webpBytes = [0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4];
    const gifBytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6, 7, 0x3b];
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ images: [toBase64(webpBytes), toBase64(gifBytes)] })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2),
    ).resolves.toHaveLength(2);
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 停滞抢救拒绝碰巧以 EOI 结尾的假图（头部魔数校验拦截）', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // 仅 2 字节 FFD9：无 JPEG 头部魔数，不是任何已知图片
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64([0xff, 0xd9]) })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('流式连接 30 秒无新数据');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 完整 error 事件缺结尾空行时抢救出原始错误信息', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"quota exceeded"}'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('quota exceeded');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE 截断的 error 事件（无完整 error 字段）不被抢救，维持停滞报错', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"quot'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('流式连接 30 秒无新数据');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('SSE final 数据不完整（传输中断）时停滞抢救不交付截断图', async () => {
    vi.useFakeTimers();
    const args = createArgs();
    // 无 IEND/EOI 结尾标记：传输中途死掉的半张图，不可当最终图交付
    const stalledStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `event: final\ndata: ${JSON.stringify({ samp_ix: 0, image: toBase64([...PNG_MAGIC, 0x11, 0x22]) })}`;
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stalledStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );

    const assertion = expect(
      requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1),
    ).rejects.toThrow('流式连接 30 秒无新数据');
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('msgpack 多图 final 全部同 samp_ix 但字节不同（不规范中转）时全部收集', async () => {
    const args = createArgs();
    const stream = createStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: completePngBytes(0x01) }),
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: completePngBytes(0x02) }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    const blobs = await requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 2);

    expect(blobs).toHaveLength(2);
  });

  it('msgpack final 帧不带图像时不虚增收齐计数，等待后续实图帧', async () => {
    const args = createArgs();
    // 第一帧 final 无 image：不应计为已收集（旧实现按 samp_ix 集合计数会提前 break 然后报"未返回最终图像"）
    const stream = createStream([
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0 }),
      frameChunk({ event_type: 'final', samp_ix: 0, gen_id: 0, image: completePngBytes(0x03) }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'application/msgpack' } }),
      ),
    );

    const blobs = await requestNovelAIAccountImagesStream(args.settings, args.prompts, args.account, {}, 123, 1);

    expect(blobs).toHaveLength(1);
  });
});
