import type { WdTag, WdTagResult, WdTaggerThresholds } from './types';

const WD_TAGGER_URL = 'https://smilingwolf-wd-tagger.hf.space';
const WD_TAGGER_MODEL = 'SmilingWolf/wd-swinv2-tagger-v3';
const WD_TAGGER_TIMEOUT_MS = 60_000;

type FetchImpl = typeof fetch;

/**
 * WD Tagger 请求选项
 */
export interface WdTaggerRequestOptions {
  thresholds: WdTaggerThresholds;
  signal?: AbortSignal;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

/**
 * 请求公共 WD Tagger 分析图片
 * @param file 待分析图片
 * @param options 阈值、取消信号与测试依赖
 * @returns 通用与角色标签结果
 */
export async function interrogateWdTagger(file: File, options: WdTaggerRequestOptions): Promise<WdTagResult> {
  const controller = createTimeoutController(options.signal, options.timeoutMs ?? WD_TAGGER_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const path = await uploadImage(file, fetchImpl, controller.signal);
    const eventId = await createPrediction(path, options.thresholds, fetchImpl, controller.signal);
    return await readPrediction(eventId, fetchImpl, controller.signal);
  } catch (error) {
    throw normalizeWdTaggerError(error);
  } finally {
    controller.dispose();
  }
}

/**
 * 上传图片并读取 Gradio 临时路径
 * @param file 图片文件
 * @param fetchImpl 请求方法
 * @param signal 取消信号
 * @returns Gradio 临时文件路径
 */
async function uploadImage(file: File, fetchImpl: FetchImpl, signal: AbortSignal): Promise<string> {
  const formData = new FormData();
  formData.append('files', file);
  const data = await requestJson('/gradio_api/upload', { method: 'POST', body: formData, signal }, fetchImpl);
  const path = Array.isArray(data) ? data[0] : null;
  if (typeof path !== 'string' || !path) throw new Error('上传响应无效');
  return path;
}

/**
 * 创建 Gradio 预测队列事件
 * @param path Gradio 临时文件路径
 * @param thresholds 分类阈值
 * @param fetchImpl 请求方法
 * @param signal 取消信号
 * @returns 预测事件 ID
 */
async function createPrediction(
  path: string,
  thresholds: WdTaggerThresholds,
  fetchImpl: FetchImpl,
  signal: AbortSignal,
): Promise<string> {
  const body = buildPredictionBody(path, thresholds);
  const data = await requestJson(
    '/gradio_api/call/v2/predict',
    { headers: { 'Content-Type': 'application/json' }, method: 'POST', body: JSON.stringify(body), signal },
    fetchImpl,
  );
  const eventId = readEventId(data);
  if (!eventId) throw new Error('预测队列响应无效');
  return eventId;
}

/**
 * 构建 WD Tagger 预测请求参数
 * @param path Gradio 临时文件路径
 * @param thresholds 分类阈值
 * @returns Gradio 命名参数对象
 */
export function buildPredictionBody(path: string, thresholds: WdTaggerThresholds): Record<string, unknown> {
  return {
    image: { path, meta: { _type: 'gradio.FileData' } },
    model_repo: WD_TAGGER_MODEL,
    general_thresh: thresholds.general,
    general_mcut_enabled: false,
    character_thresh: thresholds.character,
    character_mcut_enabled: false,
  };
}

/**
 * 读取 Gradio SSE 并解析完成结果
 * @param eventId 预测事件 ID
 * @param fetchImpl 请求方法
 * @param signal 取消信号
 * @returns 规范化标签结果
 */
async function readPrediction(eventId: string, fetchImpl: FetchImpl, signal: AbortSignal): Promise<WdTagResult> {
  const response = await fetchImpl(`${WD_TAGGER_URL}/gradio_api/call/predict/${eventId}`, { signal });
  if (!response.ok || !response.body) throw new Error('预测结果服务暂不可用');
  return readSseResult(response.body);
}

/**
 * 读取 SSE 流中的完成或错误事件
 * @param body SSE 可读流
 * @returns 规范化标签结果
 */
async function readSseResult(body: ReadableStream<Uint8Array>): Promise<WdTagResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    const result = readSseEvents(events);
    if (result) return result;
  }
  throw new Error('预测结果未返回完成事件');
}

/**
 * 从一批 SSE 事件中寻找完成结果
 * @param events SSE 事件文本列表
 * @returns 完成结果或 null
 */
function readSseEvents(events: string[]): WdTagResult | null {
  for (const event of events) {
    const parsed = parseSseEvent(event);
    if (parsed.type === 'error') throw new Error(parsed.message);
    if (parsed.type === 'complete') return parseWdTaggerResult(parsed.data);
  }
  return null;
}

/**
 * 解析单个 SSE 事件
 * @param source SSE 原始事件文本
 * @returns 事件类型与 JSON 数据
 */
export function parseSseEvent(source: string): { type: string; data: unknown; message: string } {
  const type = source.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const text = source.match(/^data:\s*(.+)$/m)?.[1]?.trim() ?? '';
  if (!text) return { type, data: null, message: '预测结果格式无效' };
  try {
    const data = JSON.parse(text) as unknown;
    return { type, data, message: readErrorMessage(data) };
  } catch {
    return { type, data: null, message: '预测结果格式无效' };
  }
}

/**
 * 将 Gradio 完成数据转为稳定标签结果
 * @param data SSE 完成事件数据
 * @returns 分类标签结果
 */
export function parseWdTaggerResult(data: unknown): WdTagResult {
  if (!Array.isArray(data) || data.length < 4) throw new Error('预测结果格式无效');
  const result = { characterTags: normalizeTags(data[2]), generalTags: normalizeTags(data[3]) };
  if (!result.generalTags.length && !result.characterTags.length) {
    throw new Error('未提取到符合当前阈值的标签，请降低阈值后重试');
  }
  return result;
}

/**
 * 规范化 Gradio confidences 标签列表
 * @param value 原始分类结果
 * @returns 排序、去重后的标签列表
 */
function normalizeTags(value: unknown): WdTag[] {
  const confidences = readTagConfidences(value);
  if (!confidences) return [];
  const tags = confidences.flatMap(toWdTag);
  return Array.from(new Map(tags.map(tag => [tag.label, tag])).values()).sort(
    (left, right) => right.confidence - left.confidence,
  );
}

/**
 * 读取 Gradio 分类结果中的 confidences 数组
 * @param value 原始分类结果
 * @returns 标签置信度数组或 null
 */
function readTagConfidences(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const confidences = (value as Record<string, unknown>).confidences;
  return Array.isArray(confidences) ? confidences : null;
}

/**
 * 将单个置信度记录转换为标签
 * @param value 原始置信度记录
 * @returns 有效标签数组
 */
function toWdTag(value: unknown): WdTag[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (typeof record.label !== 'string' || !record.label.trim() || typeof record.confidence !== 'number') return [];
  if (!Number.isFinite(record.confidence)) return [];
  return [{ label: record.label.replaceAll('_', ' ').trim(), confidence: record.confidence }];
}

/**
 * 请求并校验 JSON 响应
 * @param path API 路径
 * @param init 请求配置
 * @param fetchImpl 请求方法
 * @returns JSON 响应数据
 */
async function requestJson(path: string, init: RequestInit, fetchImpl: FetchImpl): Promise<unknown> {
  const response = await fetchImpl(`${WD_TAGGER_URL}${path}`, init);
  if (!response.ok) throw new Error('公共 WD Tagger 服务暂不可用');
  try {
    return await response.json();
  } catch {
    throw new Error('公共 WD Tagger 服务响应无效');
  }
}

/**
 * 创建带总超时的取消控制器
 * @param signal 外部取消信号
 * @param timeoutMs 总超时时间
 * @returns 控制器与清理方法
 */
function createTimeoutController(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

/**
 * 读取预测事件 ID
 * @param data Gradio 响应对象
 * @returns 事件 ID 或空字符串
 */
function readEventId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const value = (data as Record<string, unknown>).event_id;
  return typeof value === 'string' ? value : '';
}

/**
 * 提取公共服务错误消息
 * @param data SSE 错误数据
 * @returns 可展示的错误消息
 */
function readErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '公共 WD Tagger 服务暂不可用';
  const value = (data as Record<string, unknown>).error;
  return typeof value === 'string' && value ? value : '公共 WD Tagger 服务暂不可用';
}

/**
 * 统一 WD Tagger 异常文案
 * @param error 原始异常
 * @returns 可展示的错误
 */
function normalizeWdTaggerError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return error;
  if (error instanceof Error && error.message.includes('公共 WD Tagger')) return error;
  return new Error('公共 WD Tagger 服务暂不可用，请稍后重试');
}
