import type { NovelAIAccount, NovelAISettings } from '@/constants/novelai';
import { buildPayload } from './payload';
import { parseImageFrames, sniffImageMime } from './stream-frame';
import type { NovelAIStreamFrame } from './stream-frame';
import type { NovelAIFinalPrompts, NovelAIRequestOptions } from './types';

// 魔数识别工具迁至 stream-frame（停滞抢救的头尾完整性校验共用），此处保留导出兼容既有引用
export { sniffImageMime };

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
  // final 去重按 samp_ix + 内容摘要判定：官方 msgpack 流会重发同一 final（字节相同跳过）；
  // 字节不同（如中转 samp_ix 恒发 0 的多图）按新图收集。SSE 与 msgpack 统一适用
  const finalHashBySample = new Map<number, string>();
  try {
    await consumeStreamFrames(body, contentType, { blobs, finalHashBySample, options, totalSteps, imageCount });
  } finally {
    // 全路径统一断流：正常结束/提前退出/异常/abort 后都释放旧连接
    await disconnectStreamBody(body);
  }
  if (blobs.length === 0) throw new Error('流式生成未返回最终图像');
  // 多图请求只收到部分 final 时判定失败，触发上层账号故障转移
  if (blobs.length < imageCount) throw new Error(`流式生成仅返回 ${blobs.length}/${imageCount} 张图片`);
  return blobs;
}

/** 帧消费上下文 */
interface StreamConsumeContext {
  /** 已收集的最终图片数组 */
  blobs: Blob[];
  /** 已收集 final 帧的 samp_ix → 内容摘要（用于识别重复推送） */
  finalHashBySample: Map<number, string>;
  /** 请求控制选项 */
  options: NovelAIRequestOptions;
  /** 总去噪步数 */
  totalSteps: number;
  /** 本次请求图片总数 */
  imageCount: number;
}

/**
 * 计算图像字节的 64 位内容摘要（FNV-1a + djb2 双散列）
 * 以摘要代替原始字节参与去重比对，避免多图全尺寸 PNG 的原始数据长期驻留内存
 * @param bytes 图像二进制
 * @returns 十六进制摘要字符串
 */
function imageBytesDigest(bytes: Uint8Array): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < bytes.length; i++) {
    fnv ^= bytes[i]!;
    fnv = Math.imul(fnv, 0x01000193);
    djb = Math.imul(djb, 33) ^ bytes[i]!;
  }
  return `${fnv >>> 0}-${djb >>> 0}`;
}

/**
 * 登记 final 帧并判断是否为已收集图像的重复推送（官方 msgpack 流会重发同一 final）
 * 未见过的 samp_ix 直接登记；同 samp_ix 且内容摘要一致才视为重复跳过；
 * 摘要不同说明该流 samp_ix 不规范（如中转恒发 0），按新图收集
 * @param frame 待检查的 final 帧
 * @param ctx 帧消费上下文
 */
function shouldSkipRepeatedFinal(frame: NovelAIStreamFrame, ctx: StreamConsumeContext): boolean {
  if (!frame.image) return false;
  const digest = imageBytesDigest(frame.image);
  const seen = ctx.finalHashBySample.get(frame.samp_ix);
  if (seen === undefined) {
    ctx.finalHashBySample.set(frame.samp_ix, digest);
    return false;
  }
  return seen === digest;
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
    // 官方重复 final 帧跳过；新 final 帧登记摘要用于后续重复判定
    if (frame.event_type === 'final' && shouldSkipRepeatedFinal(frame, ctx)) continue;
    if (frame.image) collectStreamFrame(frame, frame.image, ctx.blobs, ctx.options, ctx.totalSteps, ctx.imageCount);
    // 按已收集图片数判断收齐；收齐后无需等待服务器关闭连接
    if (ctx.blobs.length >= ctx.imageCount) break;
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
    await ensureStreamNotJsonError(response);
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
 * 拦截流式端点返回的 JSON 负载
 * 未实现流式端点时会返回 200 + JSON 错误（如 {"error":"File not found"}），
 * 若交给 msgpack 解析，JSON 首字节会被误读为帧头报"非法 msgpack 帧长度"
 * @param response 官方流式响应
 */
async function ensureStreamNotJsonError(response: Response): Promise<void> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return;
  const detail = (await response.text().catch(() => '')).trim().slice(0, 160);
  throw new Error(`该源可能不支持流式生成，请在设置中关闭流式生成后重试${detail ? `（服务端返回: ${detail}）` : ''}`);
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
