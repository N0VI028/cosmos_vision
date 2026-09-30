import { generateImage } from '@/api/generate-image';
import { requestPrompt } from '@/api/request-prompt';
import type { CosmosVisionApi } from '@/api/types';
import manifest from '../../manifest.json';

/** 对外 API 挂载完成后派发的事件名 */
export const COSMOS_VISION_API_READY_EVENT = 'cosmos-vision:api-ready';

/**
 * 组装对外 API 对象
 * @returns window.CosmosVision 接口实现
 */
export function createCosmosVisionApi(): CosmosVisionApi {
  return {
    version: manifest.version,
    requestPrompt,
    generateImage,
  };
}

/**
 * 挂载对外 API 并派发就绪事件（幂等，重复调用返回已挂载对象）
 * @returns 已挂载的对外 API
 */
export function installCosmosVisionApi(): CosmosVisionApi {
  const installed = window.CosmosVision;
  if (installed) return installed;
  const api = createCosmosVisionApi();
  window.CosmosVision = api;
  window.dispatchEvent(new CustomEvent(COSMOS_VISION_API_READY_EVENT));
  return api;
}
