import { getRequestHeaders } from '@sillytavern/script';

interface UploadedFileResponse {
  path: string;
}

/**
 * 上传 Base64 文件到 SillyTavern 用户文件目录
 * @param name 安全文件名
 * @param data 不含 data URL 头的 Base64 内容
 * @returns 服务端文件路径
 */
export async function uploadSillyTavernFile(name: string, data: string): Promise<string> {
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name, data }),
  });
  if (!response.ok) throw new Error(await readResponseError(response, '文件上传失败'));
  const payload = (await response.json()) as UploadedFileResponse;
  if (!payload.path) throw new Error('文件上传响应缺少路径');
  return payload.path;
}

/**
 * 删除 SillyTavern 用户文件
 * @param path 服务端文件路径
 * @returns 文件已删除或本来就不存在时成功
 */
export async function deleteSillyTavernFile(path: string): Promise<void> {
  const response = await fetch('/api/files/delete', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ path }),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(await readResponseError(response, '文件删除失败'));
}

/**
 * 读取服务端文件 Blob
 * @param path 服务端文件路径
 * @returns 文件 Blob
 */
export async function readSillyTavernFileBlob(path: string): Promise<Blob> {
  const blob = await readSillyTavernFileBlobOrNull(path);
  if (!blob) throw new Error('文件读取失败（HTTP 404）');
  return blob;
}

/**
 * 尝试读取服务端文件 Blob
 * @param path 服务端文件路径
 * @returns 文件 Blob；文件不存在时返回 null
 */
export async function readSillyTavernFileBlobOrNull(path: string): Promise<Blob | null> {
  const response = await fetch(path, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readResponseError(response, '文件读取失败'));
  return response.blob();
}

/**
 * 读取服务端 JSON 文件
 * @param path 服务端文件路径
 * @returns JSON 数据；文件不存在时返回 null
 */
export async function readSillyTavernJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readResponseError(response, '清单读取失败'));
  return response.json() as Promise<T>;
}

/**
 * 上传 JSON 清单并原子覆盖同名文件
 * @param name 清单文件名
 * @param value 可序列化数据
 * @returns 服务端文件路径
 */
export async function uploadSillyTavernJson(name: string, value: unknown): Promise<string> {
  const json = JSON.stringify(value, null, 2);
  return uploadSillyTavernFile(name, textToBase64(json));
}

/**
 * 将 Blob 转换为纯 Base64
 * @param blob 文件 Blob
 * @returns 不含 data URL 头的 Base64
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * 将 Blob 转换为 data URL
 * @param blob 文件 Blob
 * @returns data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 data URL 或 Base64 转换为纯 Base64
 * @param data 文件数据
 * @returns 不含 data URL 头的 Base64
 */
export function stripDataUrlPrefix(data: string): string {
  const separator = data.indexOf(',');
  return data.startsWith('data:') && separator >= 0 ? data.slice(separator + 1) : data;
}

/**
 * 将 UTF-8 文本转换为 Base64
 * @param text UTF-8 文本
 * @returns Base64
 */
function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

/**
 * 读取接口错误文本
 * @param response HTTP 响应
 * @param fallback 默认错误信息
 * @returns 错误文本
 */
async function readResponseError(response: Response, fallback: string): Promise<string> {
  const message = await response.text();
  return message || `${fallback}（HTTP ${response.status}）`;
}
