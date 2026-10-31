import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { createNovelAIAccount } from '@/constants/novelai';
import { generateNovelAIImagesFromResolvedRequest } from '@/services/novelai/api';
import type { NovelAIResolvedRequest } from '@/services/novelai/types';

const PNG_BASE64 = 'iVBORw0KGgo=';

/**
 * 构造两个候选账号的已解析请求
 * @param timeout 单渠道超时秒数
 * @returns 已解析请求
 */
function createRequest(timeout: number): NovelAIResolvedRequest {
  const settings = { ...DEFAULT_SETTINGS.novelai, timeout, streamImage: false };
  return {
    settings,
    prompts: { positivePrompt: 'solo', negativePrompt: '' },
    accounts: [
      createNovelAIAccount('a', 'https://slow.example', 'key-a', '慢源'),
      createNovelAIAccount('b', 'https://fast.example', 'key-b', '快源'),
    ],
    seed: 1,
    snapshot: {} as NovelAIResolvedRequest['snapshot'],
  };
}

/**
 * 构造挂起直到 abort 的 fetch 响应
 * @param signal 请求取消信号
 * @returns 永不完成的响应
 */
function hangUntilAbort(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('novelai account failover', () => {
  it('渠道超时只算该账号失败，继续尝试下一个账号', async () => {
    vi.useFakeTimers();
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      requested.push(url);
      if (url.includes('slow.example')) return hangUntilAbort(init?.signal ?? undefined);
      return Promise.resolve(new Response(JSON.stringify({ images: [{ image: PNG_BASE64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }));

    const pending = generateNovelAIImagesFromResolvedRequest(createRequest(30), 1);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    expect(requested).toEqual([
      'https://slow.example/ai/generate-image',
      'https://fast.example/ai/generate-image',
    ]);
    expect(result.snapshot.accountName).toBe('快源');
    expect(result.imageBlobs).toHaveLength(1);
  });

  it('用户取消不触发后续账号', async () => {
    const requested: string[] = [];
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      requested.push(url);
      controller.abort();
      return hangUntilAbort(init?.signal ?? undefined);
    }));

    await expect(generateNovelAIImagesFromResolvedRequest(createRequest(30), 1, { signal: controller.signal }))
      .rejects.toThrow('已取消生成');
    expect(requested).toEqual(['https://slow.example/ai/generate-image']);
  });
});
