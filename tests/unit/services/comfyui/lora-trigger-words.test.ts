import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prependLoraTriggerWords } from '@/services/comfyui/lora-presets';
import type { ComfyUILoraPresetSettings, ComfyUILoraSetting, ComfyUISettings } from '@/constants/comfyui';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('comfyui lora trigger words', () => {
  it('prepends trigger words before prompt', () => {
    expect(prependLoraTriggerWords('masterpiece, 1girl', ['triggerA', 'triggerB'])).toBe(
      'triggerA, triggerB, masterpiece, 1girl',
    );
  });

  it('skips trigger words already present in prompt (case-insensitive)', () => {
    expect(prependLoraTriggerWords('TriggerA, 1girl', ['triggerA', 'triggerB'])).toBe('triggerB, TriggerA, 1girl');
  });

  it('returns prompt unchanged when no trigger words or all already present', () => {
    expect(prependLoraTriggerWords('masterpiece', [])).toBe('masterpiece');
    expect(prependLoraTriggerWords('triggerA', ['TriggerA'])).toBe('triggerA');
  });

  it('detects prompt tokens split by comma and newline', () => {
    expect(prependLoraTriggerWords('1girl\ntriggerA, masterpiece', ['triggerA'])).toBe(
      '1girl\ntriggerA, masterpiece',
    );
  });
});

describe('resolveActiveComfyUILoraTriggerWords', () => {
  beforeEach(() => {
    // 模块级缓存会跨用例污染，每个用例重新加载模块拿到空缓存
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('only fetches enabled and named loras', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const words = await resolve(createSettings(['a.safetensors'], { disabled: 'b.safetensors', blank: '' }));

    expect(words).toEqual(['triggerA']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('name=a');
  });

  it('does not hit the network when every lora is cached', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings = createSettings(['a.safetensors']);

    await resolve(settings);
    const second = await resolve(settings);

    expect(second).toEqual(['triggerA']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the batch alive when a single lora fails and retries on next call', async () => {
    const fetchMock = createMockFetch(url => (url.includes('name=b') ? { status: 500 } : { json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings = createSettings(['a.safetensors', 'b.safetensors']);

    expect(await resolve(settings)).toEqual(['triggerA']);
    expect(console.warn).toHaveBeenCalled();
    // 失败条目不永久缓存，下次调用重试失败条目
    await resolve(settings);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches empty trigger words on successful response and does not re-fetch', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings = createSettings(['empty.safetensors']);

    expect(await resolve(settings)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await resolve(settings)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows AbortError and does not cache when aborted', async () => {
    const controller = new AbortController();
    let aborted = true;
    const fetchMock = vi.fn().mockImplementation(() => {
      if (aborted) {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, trigger_words: ['triggerA'] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings = createSettings(['a.safetensors']);

    await expect(resolve(settings, controller.signal)).rejects.toThrow('The operation was aborted');
    // 中断结果不得写入缓存：下次调用应重新发起 fetch 并拿到新结果
    aborted = false;
    expect(await resolve(settings, controller.signal)).toEqual(['triggerA']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('separates cache by ComfyUI URL', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings1 = createSettings(['a.safetensors']);
    const settings2 = { ...createSettings(['a.safetensors']), url: 'http://127.0.0.1:8189' };

    await resolve(settings1);
    await resolve(settings2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves trigger words directly by lora names list', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['testTrigger'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const module = await import('@/services/comfyui/lora-trigger-words');
    const words = await module.resolveComfyUILoraTriggerWords('http://127.0.0.1:8188', ['custom.safetensors']);
    expect(words).toEqual(['testTrigger']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the whole batch throws', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const settings = createSettings(['a.safetensors']);
    settings.url = '';

    await expect(resolve(settings)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges trigger words of multiple loras with dedupe', async () => {
    const fetchMock = createMockFetch(url =>
      url.includes('name=a')
        ? { json: { success: true, trigger_words: ['triggerA', 'shared'] } }
        : { json: { success: true, trigger_words: ['shared', 'triggerB'] } },
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();

    expect(await resolve(createSettings(['a.safetensors', 'b.safetensors']))).toEqual([
      'triggerA',
      'shared',
      'triggerB',
    ]);
  });

  it('returns an empty list without fetching when no lora is enabled', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolve = await importResolve();
    const words = await resolve(createSettings([], { disabled: 'b.safetensors' }));

    expect(words).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * 动态加载待测模块，配合 vi.resetModules() 获取全新的会话缓存
 * @returns 触发词解析函数
 */
async function importResolve() {
  const module = await import('@/services/comfyui/lora-trigger-words');
  return module.resolveActiveComfyUILoraTriggerWords;
}

/**
 * 构建含启用/禁用条目的 ComfyUI 设置
 * @param enabled 启用且有名称的 LoRA 名称列表
 * @param extra 额外条目（禁用或空名）
 * @returns ComfyUI 设置子集
 */
function createSettings(
  enabled: readonly string[],
  extra: Record<string, string> = {},
): Pick<ComfyUISettings, 'url' | 'loraPresets'> {
  const loras: ComfyUILoraSetting[] = [
    ...enabled.map((name, index) => createLoraSetting(`e${index}`, name, true)),
    ...Object.entries(extra).map(([key, name], index) => createLoraSetting(`x${index}`, name, key !== 'disabled')),
  ];
  const loraPresets: ComfyUILoraPresetSettings = {
    activePresetId: 'p1',
    presets: [{ id: 'p1', name: 'Preset 1', loras }],
  };
  return { url: 'http://127.0.0.1:8188', loraPresets };
}

/**
 * 构建单个 LoRA 条目
 * @param id 条目 ID
 * @param name LoRA 名称
 * @param enabled 是否启用
 * @returns LoRA 条目
 */
function createLoraSetting(id: string, name: string, enabled: boolean): ComfyUILoraSetting {
  return { id, name, strength: 1, enabled };
}
