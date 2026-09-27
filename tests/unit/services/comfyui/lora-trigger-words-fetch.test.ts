import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchComfyUILoraTriggerWords,
  fetchComfyUILoraTriggerWordsBatch,
  parseLoraManagerTriggerWords,
} from '@/services/comfyui/lora-trigger-words';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('comfyui lora trigger words fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('parseLoraManagerTriggerWords', () => {
    it('reads string arrays and drops blanks', () => {
      expect(parseLoraManagerTriggerWords([' triggerA ', '', 'triggerB'])).toEqual(['triggerA', 'triggerB']);
    });

    it('splits comma-joined items (civitai trainedWords / LoRA Manager ",, " 连接)', () => {
      expect(parseLoraManagerTriggerWords('triggerA,, triggerB, triggerC')).toEqual([
        'triggerA',
        'triggerB',
        'triggerC',
      ]);
      expect(parseLoraManagerTriggerWords(['charname, blue hair'])).toEqual(['charname', 'blue hair']);
    });

    it('dedupes case-insensitively and ignores non-strings', () => {
      expect(parseLoraManagerTriggerWords(['triggerA', 'TRIGGERA', 42, null])).toEqual(['triggerA']);
    });

    it('returns empty list for missing payloads', () => {
      expect(parseLoraManagerTriggerWords(undefined)).toEqual([]);
      expect(parseLoraManagerTriggerWords(null)).toEqual([]);
      expect(parseLoraManagerTriggerWords({})).toEqual([]);
    });
  });

  describe('fetchComfyUILoraTriggerWords', () => {
    it('queries LoRA Manager with the extension-less basename', async () => {
      const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
      vi.stubGlobal('fetch', fetchMock);

      const words = await fetchComfyUILoraTriggerWords('http://127.0.0.1:8188/', 'chars/My Lora.safetensors');

      expect(words).toEqual(['triggerA']);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8188/api/lm/loras/get-trigger-words?name=My%20Lora',
      );
    });

    it('reports a clear cause when LoRA Manager is absent (404)', async () => {
      vi.stubGlobal('fetch', createMockFetch(() => ({ status: 404 })));

      await expect(fetchComfyUILoraTriggerWords('http://127.0.0.1:8188', 'a.safetensors')).rejects.toThrow(
        /ComfyUI-Lora-Manager/,
      );
    });

    it('surfaces the server error message when success is false', async () => {
      vi.stubGlobal('fetch', createMockFetch(() => ({ json: { success: false, error: 'lora not found' } })));

      await expect(fetchComfyUILoraTriggerWords('http://127.0.0.1:8188', 'a.safetensors')).rejects.toThrow(
        'lora not found',
      );
    });

    it('returns an empty list for a nameless lora without hitting the network', async () => {
      const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['x'] } }));
      vi.stubGlobal('fetch', fetchMock);

      expect(await fetchComfyUILoraTriggerWords('http://127.0.0.1:8188', '   ')).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when the ComfyUI url is empty', async () => {
      await expect(fetchComfyUILoraTriggerWords('', 'a.safetensors')).rejects.toThrow('请先填写 ComfyUI URL');
    });
  });

  describe('fetchComfyUILoraTriggerWordsBatch', () => {
    it('collects per-lora results and failures without aborting the batch', async () => {
      const fetchMock = createMockFetch(url => {
        if (url.includes('name=b')) return { status: 500 };
        if (url.includes('name=c')) return { json: { success: true, trigger_words: [] } };
        return { json: { success: true, trigger_words: ['triggerA'] } };
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchComfyUILoraTriggerWordsBatch('http://127.0.0.1:8188', [
        'a.safetensors',
        'b.safetensors',
        'c.safetensors',
      ]);

      expect(result.triggerWords.get('a.safetensors')).toEqual(['triggerA']);
      expect(result.triggerWords.get('c.safetensors')).toEqual([]);
      expect(result.triggerWords.has('b.safetensors')).toBe(false);
      expect(result.failures).toEqual([{ name: 'b.safetensors', message: expect.stringContaining('500') }]);
    });

    it('dedupes names and skips blanks', async () => {
      const fetchMock = createMockFetch(() => ({ json: { success: true, trigger_words: ['triggerA'] } }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchComfyUILoraTriggerWordsBatch('http://127.0.0.1:8188', [
        'a.safetensors',
        ' a.safetensors ',
        '',
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect([...result.triggerWords.keys()]).toEqual(['a.safetensors']);
    });

    it('rejects up front when the ComfyUI url is empty', async () => {
      await expect(fetchComfyUILoraTriggerWordsBatch('', ['a.safetensors'])).rejects.toThrow(
        '请先填写 ComfyUI URL',
      );
    });
  });
});
