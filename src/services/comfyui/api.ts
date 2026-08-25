import { uuidv4 } from '@sillytavern/scripts/utils';

import type { ComfyUISettings } from '@/constants/comfyui';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  buildComfyUIResolvedRequest,
  buildComfyUIResolvedRequestFromPrompts,
} from '@/services/comfyui/request';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';
import { extractHistoryImages, type ComfyUIHistoryEntry } from '@/services/comfyui/history';
import { createRequestTimeoutController, throwIfRequestTimedOut } from '@/services/request-timeout';
import { readAvatarFile } from '@/services/tavern-helper/avatar';
import type {
  ComfyUIHistoryImage,
  ComfyUIImageBindingTarget,
  ComfyUIResolvedRequest,
  ComfyUIUploadImageOptions,
  ComfyUIUploadImageResponse,
  ComfyUIWorkflow,
} from '@/services/comfyui/types';
import type { ImagePromptPair } from '@/services/image-prompt/presets';

interface ComfyUIPromptResponse {
  prompt_id?: string;
}

interface ComfyUICheckpointLoaderInfo {
  input?: {
    required?: {
      ckpt_name?: unknown;
    };
  };
}

interface ComfyUIModelFolderEntry {
  name?: unknown;
  filename?: unknown;
  path?: unknown;
}

const COMFYUI_POLL_INTERVAL_MS = 1000;

/** ComfyUI 请求控制选项 */
export interface ComfyUIRequestOptions {
  signal?: AbortSignal;
}

/**
 * 使用共享生图预设与正负提示词请求 ComfyUI 图片列表
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param prompts 正负提示词覆写
 * @param options 请求控制选项
 * @returns 指定输出节点的全部图片 Blob，按返回顺序
 */
export async function generateComfyUIImages(
  settings: ComfyUISettings,
  presetSettings: ImagePromptPresetSettings,
  prompts: ImagePromptPair,
  options: ComfyUIRequestOptions = {},
): Promise<Blob[]> {
  return generateComfyUIImagesFromResolvedRequest(
    settings,
    buildComfyUIResolvedRequest(settings, presetSettings, prompts),
    options,
  );
}

/**
 * 使用最终正负提示词请求 ComfyUI 图片列表
 * @param settings ComfyUI 设置
 * @param prompts 已完成拼接的正负提示词
 * @param options 请求控制选项
 * @returns 指定输出节点的全部图片 Blob
 */
export async function generateComfyUIImagesFromPrompts(
  settings: ComfyUISettings,
  prompts: ImagePromptPair,
  options: ComfyUIRequestOptions = {},
): Promise<Blob[]> {
  return generateComfyUIImagesFromResolvedRequest(
    settings,
    buildComfyUIResolvedRequestFromPrompts(settings, prompts),
    options,
  );
}

/**
 * 发送已解析的 ComfyUI 请求并下载全部输出图片
 * @param settings ComfyUI 设置
 * @param request 已解析请求
 * @param options 请求控制选项
 * @returns 指定输出节点的全部图片 Blob
 */
export async function generateComfyUIImagesFromResolvedRequest(
  settings: ComfyUISettings,
  request: ComfyUIResolvedRequest,
  options: ComfyUIRequestOptions = {},
): Promise<Blob[]> {
  const timeout = createRequestTimeoutController(options.signal, settings.timeout);
  const baseUrl = normalizeComfyUIUrl(settings.url);
  let cleanupAbort: () => void = () => undefined;
  try {
    if (request.snapshot.imageBindings?.length) {
      await applyImageBindings(baseUrl, request.workflow, request.snapshot.imageBindings, timeout.signal);
    }
    const promptId = await queueComfyUIPrompt(baseUrl, request.workflow, timeout.signal);
    cleanupAbort = bindComfyUIAbort(baseUrl, timeout.signal);
    const historyResult = await pollComfyUIHistory(
      baseUrl,
      promptId,
      request.imageOutputNodeId,
      timeout.signal,
    );
    return await Promise.all(
      historyResult.images.map(image => fetchComfyUIImage(baseUrl, image, timeout.signal)),
    );
  } catch (error) {
    throwIfRequestTimedOut(timeout, 'ComfyUI 生图', settings.timeout);
    throwIfComfyUIAborted(timeout.signal);
    throw error;
  } finally {
    cleanupAbort();
    timeout.dispose();
  }
}

/**
 * 使用共享生图预设与正负提示词请求单张 ComfyUI 图片
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param prompts 正负提示词
 * @param options 请求控制选项
 * @returns 第一张图片 Blob
 */
export async function generateComfyUIImage(
  settings: ComfyUISettings,
  presetSettings: ImagePromptPresetSettings,
  prompts: ImagePromptPair,
  options: ComfyUIRequestOptions = {},
): Promise<Blob> {
  const blobs = await generateComfyUIImages(settings, presetSettings, prompts, options);
  return requireFirstBlob(blobs);
}

/**
 * 使用最终提示词请求单张 ComfyUI 图片
 * @param settings ComfyUI 设置
 * @param prompts 最终提示词
 * @param options 请求控制选项
 * @returns 第一张图片 Blob
 */
export async function generateComfyUIImageFromPrompts(
  settings: ComfyUISettings,
  prompts: ImagePromptPair,
  options: ComfyUIRequestOptions = {},
): Promise<Blob> {
  const blobs = await generateComfyUIImagesFromPrompts(settings, prompts, options);
  return requireFirstBlob(blobs);
}

/**
 * 发送已解析请求并返回单张图片
 * @param settings ComfyUI 设置
 * @param request 已解析请求
 * @param options 请求控制选项
 * @returns 第一张图片 Blob
 */
export async function generateComfyUIImageFromResolvedRequest(
  settings: ComfyUISettings,
  request: ComfyUIResolvedRequest,
  options: ComfyUIRequestOptions = {},
): Promise<Blob> {
  const blobs = await generateComfyUIImagesFromResolvedRequest(settings, request, options);
  return requireFirstBlob(blobs);
}

/**
 * 从 ComfyUI 获取可用 checkpoint 列表
 * @param settings ComfyUI 设置
 * @returns checkpoint 文件名列表
 */
export async function fetchComfyUICheckpointNames(settings: ComfyUISettings): Promise<string[]> {
  const baseUrl = normalizeComfyUIUrl(settings.url);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`);
  } catch (error) {
    throw new Error(`[ComfyUI /object_info] ${(error as Error).message}`);
  }

  const payload = await readJsonResponse<unknown>(response, 'ComfyUI CheckpointLoaderSimple');
  return extractCheckpointNames(payload);
}

/**
 * 从 ComfyUI 获取可用 LoRA 列表
 * @param settings ComfyUI 设置
 * @returns LoRA 文件名列表
 */
export async function fetchComfyUILoraNames(settings: ComfyUISettings): Promise<string[]> {
  const baseUrl = normalizeComfyUIUrl(settings.url);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models/loras`);
  } catch (error) {
    throw new Error(`[ComfyUI /models/loras] ${(error as Error).message}`);
  }

  const payload = await readJsonResponse<unknown>(response, 'ComfyUI /models/loras');
  return extractModelFolderNames(payload, 'LoRA');
}

/**
 * 上传图片至 ComfyUI 服务端
 * @param baseUrlOrSettings ComfyUI 基础地址或设置
 * @param fileOrBlob 图片文件或 Blob
 * @param options 上传控制选项
 * @returns 服务端返回的文件名信息
 */
export async function uploadComfyUIImage(
  baseUrlOrSettings: string | Pick<ComfyUISettings, 'url'>,
  fileOrBlob: File | Blob,
  options: ComfyUIUploadImageOptions = {},
): Promise<ComfyUIUploadImageResponse> {
  const url = typeof baseUrlOrSettings === 'string' ? baseUrlOrSettings : baseUrlOrSettings.url;
  const baseUrl = normalizeComfyUIUrl(url);

  const formData = new FormData();
  const filename = options.filename ?? (fileOrBlob instanceof File ? fileOrBlob.name : 'upload.png');
  formData.append('image', fileOrBlob, filename);
  if (options.overwrite !== undefined) {
    formData.append('overwrite', String(options.overwrite));
  }
  if (options.subfolder !== undefined) {
    formData.append('subfolder', options.subfolder);
  }
  if (options.type !== undefined) {
    formData.append('type', options.type);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
      signal: options.signal,
    });
  } catch (error) {
    throw new Error(`[ComfyUI /upload/image] ${(error as Error).message}`);
  }

  const data = await readJsonResponse<ComfyUIUploadImageResponse>(response, 'ComfyUI /upload/image');
  if (!data.name) {
    throw new Error('ComfyUI /upload/image 未返回图片文件名');
  }
  return data;
}

/**
 * 动态处理工作流中的图片绑定（读取当前角色/用户头像并上传至 ComfyUI）
 * @param baseUrl ComfyUI 基础地址
 * @param workflow 工作流对象
 * @param bindings 图片绑定目标
 * @param signal 取消信号
 */
export async function applyImageBindings(
  baseUrl: string,
  workflow: ComfyUIWorkflow,
  bindings: ComfyUIImageBindingTarget[],
  signal?: AbortSignal,
): Promise<void> {
  for (const target of bindings) {
    if (signal?.aborted) throw createComfyUIAbortError();
    const node = workflow[target.nodeId];
    if (!node) continue;

    const avatarFile = await readAvatarFile(target.source);
    const uploaded = await uploadComfyUIImage(baseUrl, avatarFile, {
      overwrite: true,
      filename: `cosmos-${target.source}.png`,
      signal,
    });
    node.inputs[target.inputName] = uploaded.subfolder
      ? `${uploaded.subfolder}/${uploaded.name}`
      : uploaded.name;
  }
}

/**
 * 向 ComfyUI 投递 prompt
 * @param baseUrl ComfyUI 基础地址
 * @param workflow API 工作流
 * @param signal 取消信号
 * @returns prompt_id
 */
async function queueComfyUIPrompt(baseUrl: string, workflow: ComfyUIWorkflow, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: createClientId(), prompt: workflow }),
      signal,
    });
  } catch (error) {
    throw new Error(`[ComfyUI /prompt] ${(error as Error).message}`);
  }

  const data = await readJsonResponse<ComfyUIPromptResponse>(response, 'ComfyUI /prompt');
  if (!data.prompt_id) throw new Error('ComfyUI /prompt 未返回 prompt_id');
  return data.prompt_id;
}

/**
 * 轮询 ComfyUI history 结果
 * @param baseUrl ComfyUI 基础地址
 * @param promptId prompt_id
 * @param imageOutputNodeId 图片输出节点 ID
 * @param signal 取消信号
 * @returns 输出图片元数据列表
 */
async function pollComfyUIHistory(
  baseUrl: string,
  promptId: string,
  imageOutputNodeId: string,
  signal?: AbortSignal,
): Promise<{ images: ComfyUIHistoryImage[] }> {
  while (true) {
    throwIfComfyUIAborted(signal);
    const result = await fetchComfyUIHistoryResult(baseUrl, promptId, imageOutputNodeId, signal);
    if (result) return result;
    await sleep(COMFYUI_POLL_INTERVAL_MS, signal);
  }
}

/**
 * 读取当前 prompt 的历史轮询结果
 * @param baseUrl ComfyUI 基础地址
 * @param promptId prompt_id
 * @param imageOutputNodeId 图片输出节点 ID
 * @param signal 取消信号
 * @returns 图片列表或未完成时的 null
 */
async function fetchComfyUIHistoryResult(
  baseUrl: string,
  promptId: string,
  imageOutputNodeId: string,
  signal?: AbortSignal,
): Promise<{ images: ComfyUIHistoryImage[] } | null> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal });
  } catch (error) {
    throw new Error(`[ComfyUI /history] ${(error as Error).message}`);
  }

  const history = await readJsonResponse<unknown>(response, 'ComfyUI /history');
  const entry = readHistoryEntry(history, promptId);
  if (!entry) return null;

  if (entry.status && isHistoryStatusError(entry.status.status_str)) {
    const detail = extractHistoryStatusMessage(entry.status.messages);
    throw new Error(`ComfyUI 执行失败: ${detail ?? '未知节点错误'}`);
  }

  const images = extractHistoryImages(entry, imageOutputNodeId);
  if (!images) return null;

  return { images };
}

/**
 * 解析 history/{prompt_id} 返回结构
 * @param history 历史响应
 * @param promptId prompt_id
 * @returns 当前 prompt 的历史条目
 */
function readHistoryEntry(history: unknown, promptId: string): ComfyUIHistoryEntry | null {
  if (!isRecord(history)) return null;
  if (isRecord(history.outputs)) return history as ComfyUIHistoryEntry;
  const entry = history[promptId];
  return isRecord(entry) ? (entry as ComfyUIHistoryEntry) : null;
}

/**
 * 提取历史状态中的首条错误细节
 * @param messages ComfyUI 状态消息列表
 * @returns 错误细节或 null
 */
function extractHistoryStatusMessage(messages: unknown[] | undefined): string | null {
  if (!Array.isArray(messages)) return null;
  for (const message of messages) {
    const detail = readHistoryStatusMessage(message);
    if (detail) return detail;
  }
  return null;
}

/**
 * 读取单条历史状态消息
 * @param message 原始状态消息
 * @returns 可读错误文本或 null
 */
function readHistoryStatusMessage(message: unknown): string | null {
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (!Array.isArray(message) || message.length < 2) return null;

  const payload = message[1];
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (!isRecord(payload)) return null;

  const exceptionMessage = readTrimmedString(payload.exception_message);
  if (!exceptionMessage) return readTrimmedString(payload.message);

  const nodeId = readTrimmedString(payload.node_id);
  const nodeType = readTrimmedString(payload.node_type);
  if (!nodeId && !nodeType) return exceptionMessage;
  return `节点 ${nodeId ?? '未知'}${nodeType ? ` (${nodeType})` : ''}: ${exceptionMessage}`;
}

/**
 * 从 object_info 中提取 checkpoint 列表
 * @param payload ComfyUI object_info 响应
 * @returns checkpoint 文件名列表
 */
function extractCheckpointNames(payload: unknown): string[] {
  const node = readCheckpointLoaderInfo(payload);
  const ckptName = node.input?.required?.ckpt_name;
  if (!Array.isArray(ckptName) || !Array.isArray(ckptName[0])) {
    throw new Error('ComfyUI 未返回 CheckpointLoaderSimple.ckpt_name 下拉选项');
  }

  const names = ckptName[0].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (!names.length) throw new Error('ComfyUI 当前没有可用 checkpoint');
  return names;
}

/**
 * 从 models/* 响应中提取模型文件名列表
 * @param payload ComfyUI 模型列表响应
 * @param label 模型类型名
 * @returns 模型文件名列表
 */
function extractModelFolderNames(payload: unknown, label: string): string[] {
  if (!Array.isArray(payload)) {
    throw new Error(`ComfyUI 未返回可用的 ${label} 列表`);
  }

  const names = payload
    .map(readModelFolderName)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return Array.from(new Set(names));
}

/**
 * 读取单个模型条目文件名
 * @param entry 模型条目
 * @returns 文件名或 null
 */
function readModelFolderName(entry: unknown): string | null {
  if (typeof entry === 'string' && entry.trim()) return entry.trim();
  if (!isRecord(entry)) return null;
  const item = entry as ComfyUIModelFolderEntry;
  return readTrimmedString(item.name) ?? readTrimmedString(item.filename) ?? readTrimmedString(item.path);
}

/**
 * 读取 CheckpointLoaderSimple 定义
 * @param payload object_info 响应
 * @returns CheckpointLoaderSimple 定义
 */
function readCheckpointLoaderInfo(payload: unknown): ComfyUICheckpointLoaderInfo {
  if (!isRecord(payload)) throw new Error('ComfyUI object_info 响应无效');
  if (isRecord(payload.CheckpointLoaderSimple)) {
    return payload.CheckpointLoaderSimple as ComfyUICheckpointLoaderInfo;
  }
  return payload as ComfyUICheckpointLoaderInfo;
}

/**
 * 下载单张 ComfyUI 图片
 * @param baseUrl ComfyUI 基础地址
 * @param image 图片元数据
 * @param signal 取消信号
 * @returns 图片 Blob
 */
async function fetchComfyUIImage(
  baseUrl: string,
  image: ComfyUIHistoryImage,
  signal?: AbortSignal,
): Promise<Blob> {
  const params = new URLSearchParams({ filename: image.filename });
  if (image.subfolder) params.set('subfolder', image.subfolder);
  if (image.type) params.set('type', image.type);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/view?${params.toString()}`, { signal });
  } catch (error) {
    throw new Error(`[ComfyUI /view] ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`ComfyUI /view 下载图片失败: ${response.status}`);
  }
  return await response.blob();
}

/**
 * 绑定外部 AbortSignal 到 ComfyUI /interrupt
 * @param baseUrl ComfyUI 基础地址
 * @param signal 取消信号
 * @returns 解绑函数
 */
function bindComfyUIAbort(baseUrl: string, signal?: AbortSignal): () => void {
  if (!signal) return () => undefined;
  const onAbort = () => {
    void interruptComfyUI(baseUrl);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return () => {
    signal.removeEventListener('abort', onAbort);
  };
}

/**
 * 触发 ComfyUI 中断
 * @param baseUrl ComfyUI 基础地址
 */
async function interruptComfyUI(baseUrl: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/interrupt`, { method: 'POST' });
  } catch {
    // 忽略中断通知失败
  }
}

/**
 * 判断 history 状态字符串是否表示执行失败
 * @param statusStr ComfyUI 原始状态字符串
 * @returns 是否为错误状态
 */
function isHistoryStatusError(statusStr: string | undefined): boolean {
  if (!statusStr) return false;
  const normalized = statusStr.trim().toLowerCase();
  return normalized === 'error' || normalized === 'failed' || normalized.includes('error');
}

/** ComfyUI 生图取消统一的 AbortError 消息 */
const COMFYUI_ABORT_MESSAGE = 'ComfyUI 生图已被取消';

/** 构造统一 AbortError */
function createComfyUIAbortError(): Error {
  const error = new Error(COMFYUI_ABORT_MESSAGE);
  error.name = 'AbortError';
  return error;
}

/**
 * 检查信号是否已中止并抛出统一 AbortError
 * @param signal 取消信号
 */
function throwIfComfyUIAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createComfyUIAbortError();
}

/**
 * 读取非空字符串
 * @param value 原始值
 * @returns 字符串或 null
 */
function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 校验首张 Blob
 * @param blobs 图片 Blob 列表
 * @returns 第一张 Blob
 */
function requireFirstBlob(blobs: Blob[]): Blob {
  const first = blobs[0];
  if (!first) throw new Error('ComfyUI 未返回有效图片');
  return first;
}

/**
 * 生成 client_id
 * @returns client_id
 */
function createClientId(): string {
  return `cosmos-vision-${uuidv4()}`;
}

/**
 * 读取 JSON 响应
 * @param response Fetch 响应
 * @param label 接口标签
 * @returns JSON 数据
 */
async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch {
      // 忽略读取失败
    }
    const message = errorText ? `: ${errorText.slice(0, 200)}` : '';
    throw new Error(`${label} 请求失败 (${response.status})${message}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label} 响应不是有效的 JSON`);
  }
}

/**
 * 异步等待
 * @param ms 毫秒
 * @param signal 取消信号
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createComfyUIAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createComfyUIAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 判断是否为普通对象
 * @param value 原始值
 * @returns 是否为对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
