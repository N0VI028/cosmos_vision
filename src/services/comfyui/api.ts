import { uuidv4 } from '@sillytavern/scripts/utils';

import type { ComfyUISettings } from '@/constants/comfyui';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  buildComfyUIResolvedRequest,
  buildComfyUIResolvedRequestFromPrompts,
  normalizeComfyUIUrl,
  type ComfyUIResolvedRequest,
  type ComfyUIWorkflow,
} from '@/services/comfyui/workflow';
import type { ImagePromptPair } from '@/services/image-prompt/presets';

interface ComfyUIPromptResponse {
  prompt_id?: string;
}

interface ComfyUIHistoryImage {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUIHistoryEntry {
  outputs?: Record<string, { images?: ComfyUIHistoryImage[] }>;
  status?: {
    status_str?: string;
    messages?: unknown[];
  };
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
const COMFYUI_MAX_POLL_COUNT = 60;

/**
 * 使用共享生图预设与正负提示词请求 ComfyUI 图片
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param overrides 正负提示词覆写
 * @returns 首张输出图片 Blob
 */
export async function generateComfyUIImage(
  settings: ComfyUISettings,
  presetSettings: ImagePromptPresetSettings,
  prompts: ImagePromptPair,
): Promise<Blob> {
  return generateComfyUIImageFromResolvedRequest(
    settings,
    buildComfyUIResolvedRequest(settings, presetSettings, prompts),
  );
}

/**
 * 使用最终正负提示词请求 ComfyUI 图片
 * @param settings ComfyUI 设置
 * @param prompts 已完成拼接的正负提示词
 * @returns 首张输出图片 Blob
 */
export async function generateComfyUIImageFromPrompts(
  settings: ComfyUISettings,
  prompts: ImagePromptPair,
): Promise<Blob> {
  return generateComfyUIImageFromResolvedRequest(settings, buildComfyUIResolvedRequestFromPrompts(settings, prompts));
}

/**
 * 读取 ComfyUI 当前可用 checkpoint 列表
 * @param settings ComfyUI 设置
 * @returns checkpoint 文件名列表
 */
export async function fetchComfyUICheckpointNames(settings: ComfyUISettings): Promise<string[]> {
  const baseUrl = normalizeComfyUIUrl(settings.url);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`);
  } catch (error) {
    throw new Error(`[ComfyUI /object_info/CheckpointLoaderSimple] ${(error as Error).message}`);
  }

  return extractCheckpointNames(
    await readJsonResponse<unknown>(response, 'ComfyUI /object_info/CheckpointLoaderSimple'),
  );
}

/**
 * 读取 ComfyUI 当前可用 LoRA 列表
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

  return extractModelFolderNames(await readJsonResponse<unknown>(response, 'ComfyUI /models/loras'), 'LoRA');
}

/**
 * 发送已解析的 ComfyUI 请求
 * @param settings ComfyUI 设置
 * @param request 已解析请求
 * @returns 首张输出图片 Blob
 */
export async function generateComfyUIImageFromResolvedRequest(
  settings: ComfyUISettings,
  request: ComfyUIResolvedRequest,
): Promise<Blob> {
  const baseUrl = normalizeComfyUIUrl(settings.url);
  const promptId = await queueComfyUIPrompt(baseUrl, request.workflow);
  const image = await waitForComfyUIHistoryImage(baseUrl, promptId);
  return fetchComfyUIImage(baseUrl, image);
}

/**
 * 向 ComfyUI 提交工作流
 * @param baseUrl ComfyUI 基础地址
 * @param workflow 已解析工作流
 * @returns prompt_id
 */
async function queueComfyUIPrompt(baseUrl: string, workflow: ComfyUIWorkflow): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: createClientId(), prompt: workflow }),
    });
  } catch (error) {
    throw new Error(`[ComfyUI /prompt] ${(error as Error).message}`);
  }

  const data = await readJsonResponse<ComfyUIPromptResponse>(response, 'ComfyUI /prompt');
  if (!data.prompt_id) throw new Error('ComfyUI /prompt 未返回 prompt_id');
  return data.prompt_id;
}

/**
 * 轮询历史记录直到拿到首张图片
 * @param baseUrl ComfyUI 基础地址
 * @param promptId prompt_id
 * @returns 第一张图片元数据
 */
async function waitForComfyUIHistoryImage(baseUrl: string, promptId: string): Promise<ComfyUIHistoryImage> {
  for (let index = 0; index < COMFYUI_MAX_POLL_COUNT; index += 1) {
    const result = await fetchComfyUIHistoryResult(baseUrl, promptId);
    if (result.executionError) throw new Error(result.executionError);
    if (result.image) return result.image;
    await sleep(COMFYUI_POLL_INTERVAL_MS);
  }
  throw new Error('ComfyUI 生成超时，请检查队列状态或工作流执行结果');
}

interface ComfyUIHistoryPollResult {
  image: ComfyUIHistoryImage | null;
  executionError: string | null;
}

/**
 * 读取当前 prompt 的历史轮询结果
 * @param baseUrl ComfyUI 基础地址
 * @param promptId prompt_id
 * @returns 当前轮询结果
 */
async function fetchComfyUIHistoryResult(baseUrl: string, promptId: string): Promise<ComfyUIHistoryPollResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
  } catch (error) {
    throw new Error(`[ComfyUI /history] ${(error as Error).message}`);
  }

  const history = await readJsonResponse<unknown>(response, 'ComfyUI /history');
  const entry = readHistoryEntry(history, promptId);
  return {
    image: extractHistoryImage(entry),
    executionError: extractHistoryExecutionError(entry),
  };
}

/**
 * 从历史记录里提取首张图片
 * @param entry 当前 prompt 的历史条目
 * @returns 图片元数据或 null
 */
function extractHistoryImage(entry: ComfyUIHistoryEntry | null): ComfyUIHistoryImage | null {
  if (!entry?.outputs) return null;

  return (
    Object.values(entry.outputs)
      .flatMap(output => output.images ?? [])
      .find(image => Boolean(image.filename)) ?? null
  );
}

/**
 * 从历史记录里提取执行失败信息
 * @param entry 当前 prompt 的历史条目
 * @returns 执行失败文案或 null
 */
function extractHistoryExecutionError(entry: ComfyUIHistoryEntry | null): string | null {
  const status = entry?.status;
  const statusText = status?.status_str?.trim();
  if (!status || !statusText) return null;

  const normalized = statusText.toLowerCase();
  if (!normalized.includes('error') && !normalized.includes('fail')) return null;

  const detail = extractHistoryStatusMessage(status.messages);
  return detail ? `ComfyUI 工作流执行失败: ${detail}` : `ComfyUI 工作流执行失败: ${statusText}`;
}

/**
 * 解析 history/{prompt_id} 返回结构
 * @param history 原始响应
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
 * 读取 CheckpointLoaderSimple 节点元数据
 * @param payload ComfyUI object_info 响应
 * @returns CheckpointLoaderSimple 节点信息
 */
function readCheckpointLoaderInfo(payload: unknown): ComfyUICheckpointLoaderInfo {
  if (!isRecord(payload) || !isRecord(payload.CheckpointLoaderSimple)) {
    throw new Error('ComfyUI 未返回 CheckpointLoaderSimple 元数据');
  }
  return payload.CheckpointLoaderSimple as ComfyUICheckpointLoaderInfo;
}

/**
 * 从 /models/{folder} 响应中提取模型文件名
 * @param payload ComfyUI models 接口响应
 * @param itemLabel 模型类型文案
 * @returns 文件名列表
 */
function extractModelFolderNames(payload: unknown, itemLabel: string): string[] {
  if (!Array.isArray(payload)) throw new Error(`ComfyUI ${itemLabel} 列表返回格式异常`);
  const names = [...new Set(payload.map(readModelFolderName).filter((name): name is string => Boolean(name)))];
  if (!names.length) throw new Error(`ComfyUI 当前没有可用 ${itemLabel}`);
  return names;
}

/**
 * 读取单个 models 列表条目的显示名称
 * @param value 单个 models 条目
 * @returns 文件名或 null
 */
function readModelFolderName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!isRecord(value)) return null;

  const entry = value as ComfyUIModelFolderEntry;
  return readTrimmedString(entry.name) ?? readTrimmedString(entry.filename) ?? readTrimmedString(entry.path);
}

/**
 * 下载首张图片
 * @param baseUrl ComfyUI 基础地址
 * @param image 图片元数据
 * @returns 图片 Blob
 */
async function fetchComfyUIImage(baseUrl: string, image: ComfyUIHistoryImage): Promise<Blob> {
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output',
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/view?${query.toString()}`);
  } catch (error) {
    throw new Error(`[ComfyUI /view] ${(error as Error).message}`);
  }

  if (!response.ok) throw new Error(`ComfyUI /view 请求失败: ${response.status}`);
  return response.blob();
}

/**
 * 读取 JSON 响应并在失败时抛出用户可理解错误
 * @param response fetch 响应
 * @param label 接口标签
 * @returns JSON 结果
 */
async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${label} 请求失败: ${response.status}${formatErrorDetail(detail)}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`${label} 返回的不是有效 JSON: ${(error as Error).message}`);
  }
}

/**
 * 判断值是否为普通对象
 * @param value 待判断值
 * @returns 是否为对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 构建错误详情尾巴
 * @param detail 原始错误文本
 * @returns 拼接后的详情
 */
function formatErrorDetail(detail: string): string {
  return detail.trim() ? ` ${detail.slice(0, 160)}` : '';
}

/**
 * 读取并裁剪字符串字段
 * @param value 原始字段值
 * @returns 去空白后的字符串或 null
 */
function readTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 生成 client_id
 * @returns 客户端请求 ID
 */
function createClientId(): string {
  return `cosmos-vision-${uuidv4()}`;
}

/**
 * 简单休眠
 * @param ms 等待毫秒数
 * @returns Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
