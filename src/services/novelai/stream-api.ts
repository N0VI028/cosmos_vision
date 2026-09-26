import type { NovelAIAccount, NovelAISettings } from '@/constants/novelai';
import { buildPayload } from './payload';
import { isSseContentType, parseImageFrames } from './stream-frame';
import type { NovelAIStreamFrame } from './stream-frame';
import type { NovelAIFinalPrompts, NovelAIRequestOptions } from './types';

/** NovelAI 流式中间帧预览事件（供 UI 实时展示去噪进度） */
export interface NovelAIStreamPreviewEvent {
  /** 中间帧预览图 Blob */
  previewBlob: Blob;
  /** 第几张图（对应帧的 samp_ix） */
  imageIndex: number;
  /** 当前去噪步（1 基，step_ix + 1） */
  step: number;
  /** 总去噪步数 */
  totalSteps: number;
  /** 已完成的最终图数量 */
  completedCount: number;
  /** 本次请求图片总数 */
  imageCount: number;
  /** 是否为该图的最终帧 */
  isFinal: boolean;
}

/** 常见图片魔数签名表 */
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
] as const;

/** WEBP 魔数（RIFF 头 + 第 8-11 字节 WEBP 标记） */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

/**
 * 按魔数识别图片 MIME 类型
 * @param bytes 图片二进制数据
 * @returns 识别出的 MIME 类型，无法识别时返回 null
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const match = IMAGE_SIGNATURES.find(signature => hasPrefix(bytes, signature.bytes));
  if (match) return match.mime;
  return isWebpSignature(bytes) ? 'image/webp' : null;
}

/**
 * 判断字节数组是否以指定前缀开头
 * @param bytes 待检查的字节数组
 * @param prefix 期望的前缀字节
 * @returns 全部前缀字节匹配时返回 true
 */
function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

/**
 * 判断字节数组是否为 WEBP 魔数（RIFF + WEBP）
 * @param bytes 待检查的字节数组
 * @returns 命中 WEBP 魔数时返回 true
 */
function isWebpSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && hasPrefix(bytes, RIFF_SIGNATURE) && hasPrefix(bytes.subarray(8), WEBP_SIGNATURE);
}

/**
 * 使用流式接口向单个 NovelAI 账号请求图片，期间通过回调推送中间帧预览
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @param options 请求控制选项（含 onStreamPreview 预览回调）
 * @param seed 本次请求使用的 seed
 * @param imageCount 请求图片数
 * @returns 按响应顺序排列的最终图片
 */
export async function requestNovelAIAccountImagesStream(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
  seed: number,
  imageCount: number,
): Promise<Blob[]> {
  const response = await postStreamRequest(settings, prompts, account, options, seed, imageCount);
  const body = response.body;
  // 响应体不可流式读取时直接失败
  if (!body) throw new Error('响应不支持流式读取');
  const blobs: Blob[] = [];
  const totalSteps = settings.steps;
  const contentType = response.headers.get('content-type') ?? '';
  // msgpack 官方流会重复推同一 samp_ix 的 final 需去重；SSE 第三方端点 samp_ix 可能不规范，不做去重
  const dedupeFinals = !isSseContentType(contentType);
  const finalSamples = new Set<number>();
  try {
    await consumeStreamFrames(body, contentType, { blobs, finalSamples, dedupeFinals, options, totalSteps, imageCount });
  } finally {
    // 全路径统一断流：正常结束/提前退出/异常/abort 后都释放旧连接
    await disconnectStreamBody(body);
  }
  if (blobs.length === 0) throw new Error('流式生成未返回最终图像');
  const collectedCount = dedupeFinals ? finalSamples.size : blobs.length;
  // 多图请求只收到部分 final 时判定失败，触发上层账号故障转移
  if (collectedCount < imageCount) throw new Error(`流式生成仅返回 ${collectedCount}/${imageCount} 张图片`);
  return blobs;
}

/** 帧消费上下文 */
interface StreamConsumeContext {
  /** 已收集的最终图片数组 */
  blobs: Blob[];
  /** 已收到的 final 帧 samp_ix 集合（仅去重模式下维护） */
  finalSamples: Set<number>;
  /** 是否对 final 帧按 samp_ix 去重 */
  dedupeFinals: boolean;
  /** 请求控制选项 */
  options: NovelAIRequestOptions;
  /** 总去噪步数 */
  totalSteps: number;
  /** 本次请求图片总数 */
  imageCount: number;
}

/**
 * 逐帧消费流式响应：final 帧收集为结果图，收齐后提前退出
 * @param body 响应体流
 * @param contentType 响应 Content-Type
 * @param ctx 帧消费上下文
 */
async function consumeStreamFrames(
  body: ReadableStream<Uint8Array>,
  contentType: string,
  ctx: StreamConsumeContext,
): Promise<void> {
  for await (const frame of parseImageFrames(body, contentType)) {
    throwIfStreamAborted(ctx.options.signal);
    if (frame.event_type === 'error') throw new Error(frame.error ?? frame.message ?? '流式生成失败');
    if (frame.event_type === 'final') {
      // 同一 samp_ix 的 final 帧可能到达两次（仅 msgpack 流去重）
      if (ctx.dedupeFinals && ctx.finalSamples.has(frame.samp_ix)) continue;
      ctx.finalSamples.add(frame.samp_ix);
    }
    if (frame.image) collectStreamFrame(frame, frame.image, ctx.blobs, ctx.options, ctx.totalSteps, ctx.imageCount);
    // SSE 流无去重，直接按已收集图片数判断收齐；收齐后无需等待服务器关闭连接
    const collectedCount = ctx.dedupeFinals ? ctx.finalSamples.size : ctx.blobs.length;
    if (collectedCount >= ctx.imageCount) break;
  }
}

/**
 * 主动断开响应体（提前收齐、异常、中止后都不再等待服务器关闭）
 * 调用前生成器已 return 并释放 reader 锁；流已关闭时 cancel 会 reject，需兜底
 * @param body 响应体流
 */
async function disconnectStreamBody(body: ReadableStream<Uint8Array>): Promise<void> {
  await body.cancel().catch(() => {});
}

/**
 * 发送流式生图请求并校验响应
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @param options 请求控制选项
 * @param seed 本次请求使用的 seed
 * @param imageCount 请求图片数
 * @returns 官方流式响应
 */
async function postStreamRequest(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
  seed: number,
  imageCount: number,
): Promise<Response> {
  const payload = buildPayload(settings, prompts, seed, imageCount);
  payload.parameters.stream = 'msgpack';
  try {
    const response = await fetch(`${account.url.replace(/\/+$/, '')}/ai/generate-image-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.apiKey.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/msgpack, text/event-stream;q=0.9, */*;q=0.8',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    await ensureStreamSuccess(response);
    return response;
  } catch (error) {
    throw new Error(`[fetch] ${(error as Error).message}`);
  }
}

/**
 * 校验流式响应状态码
 * @param response 官方响应
 */
async function ensureStreamSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  throw new Error(`NovelAI 请求失败: ${response.status}${detail ? ' ' + detail.slice(0, 160) : ''}`);
}

/**
 * 消费单一流式帧：final 帧收集为结果图，其余帧推送预览
 * @param frame 流式帧
 * @param image 帧携带的图片二进制
 * @param blobs 已收集的最终图片数组
 * @param options 请求控制选项
 * @param totalSteps 总去噪步数
 * @param imageCount 本次请求图片总数
 */
function collectStreamFrame(
  frame: NovelAIStreamFrame,
  image: Uint8Array,
  blobs: Blob[],
  options: NovelAIRequestOptions,
  totalSteps: number,
  imageCount: number,
): void {
  const isFinal = frame.event_type === 'final';
  if (isFinal) {
    // new Uint8Array 拷贝同时把视图收窄为 Uint8Array<ArrayBuffer>，否则不能直接作为 BlobPart
    blobs.push(new Blob([new Uint8Array(image)], { type: sniffImageMime(image) ?? 'image/png' }));
  }
  // 无预览回调时跳过中间帧的 Blob 构造
  if (!isFinal && !options.onStreamPreview) return;
  options.onStreamPreview?.({
    previewBlob: new Blob([new Uint8Array(image)], { type: sniffImageMime(image) ?? 'image/jpeg' }),
    imageIndex: frame.samp_ix,
    // final 帧通常不带 step_ix，直接报满步避免进度闪回
    step: isFinal ? totalSteps : (frame.step_ix ?? 0) + 1,
    totalSteps,
    completedCount: blobs.length,
    imageCount,
    isFinal,
  });
}

/**
 * 校验流式消费过程是否已被取消
 * @param signal 取消信号
 */
function throwIfStreamAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new Error('已取消生成');
}
