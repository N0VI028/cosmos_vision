/**
 * ComfyUI-Lora-Manager 客户端公共部分
 * 预览图 / 触发词 / 配方三个接口同源同端口，请求样板一致，差异仅为路径、错误文案与 !ok 分支。
 */

/** LoRA Manager 接口的差异项 */
export interface LoraManagerRequestOptions {
  /** 接口路径（用于拼接地址与网络错误前缀） */
  path: string;
  /** 接口名，用于拼接响应错误文案（如「预览图接口」） */
  featureLabel: string;
  /** HTTP 404 时的提示文案 */
  notFoundMessage: string;
  /** success === false 且响应正文无 error 时的兜底文案 */
  unavailableMessage: string;
  /** 查询串（含前导 ?），默认不带 */
  query?: string;
  /** !ok 分支的自定义处理（默认抛「请求失败 (状态码)」），实现须抛出 */
  handleHttpError?: (response: Response) => Promise<never>;
}

/**
 * 请求 LoRA Manager 接口，校验状态码与响应正文的 success 标记
 * @param baseUrl 已规范化的 ComfyUI 地址
 * @param options 接口差异项
 * @returns 已确认是对象且 success 不为 false 的响应正文
 */
export async function requestLoraManagerPayload(
  baseUrl: string,
  options: LoraManagerRequestOptions,
): Promise<Record<string, unknown>> {
  const { path, featureLabel, notFoundMessage, unavailableMessage, query = '', handleHttpError } = options;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}${query}`);
  } catch (error) {
    throw new Error(`[ComfyUI ${path}] ${(error as Error).message}`);
  }

  if (response.status === 404) throw new Error(notFoundMessage);
  if (!response.ok) {
    if (handleHttpError) await handleHttpError(response);
    throw new Error(`LoRA Manager ${featureLabel}请求失败 (${response.status})`);
  }

  return readLoraManagerResponseBody(response, featureLabel, unavailableMessage);
}

/**
 * 读取失败响应正文中的 error 字段
 * @param response 响应对象
 * @returns 服务端错误文案；正文不可用时为 null
 */
export async function readLoraManagerErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) ? readTrimmedString(payload.error) : null;
  } catch {
    return null;
  }
}

/**
 * 解析响应正文并校验 success 标记
 * @param response 响应对象
 * @param featureLabel 接口名，用于拼接错误文案
 * @param unavailableMessage success 为 false 且正文无 error 时的兜底文案
 * @returns 响应正文对象
 */
async function readLoraManagerResponseBody(
  response: Response,
  featureLabel: string,
  unavailableMessage: string,
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`LoRA Manager ${featureLabel}响应不是有效的 JSON`);
  }
  if (!isRecord(payload)) throw new Error(`LoRA Manager ${featureLabel}响应结构无效`);
  if (payload.success === false) {
    throw new Error(readTrimmedString(payload.error) ?? unavailableMessage);
  }
  return payload;
}

/**
 * 读取非空字符串
 * @param value 原始值
 * @returns 字符串或 null
 */
export function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 判断值是否为普通对象
 * @param value 待判断的值
 * @returns 是否为对象
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
