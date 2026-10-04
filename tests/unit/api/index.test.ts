import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/generate-image', () => ({ generateImage: vi.fn() }));
vi.mock('@/api/request-prompt', () => ({ requestPrompt: vi.fn() }));

import manifest from '../../../manifest.json';
import { COSMOS_VISION_API_READY_EVENT, createCosmosVisionApi, installCosmosVisionApi } from '@/api';
import { generateImage } from '@/api/generate-image';
import { requestPrompt } from '@/api/request-prompt';

describe('api/index', () => {
  beforeEach(() => {
    delete window.CosmosVision;
  });

  it('组装接口实现与插件版本号', () => {
    const api = createCosmosVisionApi();

    expect(api.version).toBe(manifest.version);
    expect(api.requestPrompt).toBe(requestPrompt);
    expect(api.generateImage).toBe(generateImage);
  });

  it('挂载到 window 并派发就绪事件', () => {
    const listener = vi.fn();
    window.addEventListener(COSMOS_VISION_API_READY_EVENT, listener);

    const api = installCosmosVisionApi();

    expect(window.CosmosVision).toBe(api);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(COSMOS_VISION_API_READY_EVENT, listener);
  });

  it('重复安装保持幂等，不重复派发事件', () => {
    const first = installCosmosVisionApi();
    const listener = vi.fn();
    window.addEventListener(COSMOS_VISION_API_READY_EVENT, listener);

    const second = installCosmosVisionApi();

    expect(second).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(COSMOS_VISION_API_READY_EVENT, listener);
  });
});
