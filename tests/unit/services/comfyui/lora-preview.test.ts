import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchComfyUILoraPreviewUrl } from '@/services/comfyui/lora-preview';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('comfyui lora preview', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries LoRA Manager with the extension-less basename and prefixes the base url', async () => {
    const fetchMock = createMockFetch(() => ({
      json: { success: true, preview_url: '/api/lm/previews?path=%2Fmodels%2Fa.png' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const url = await fetchComfyUILoraPreviewUrl('http://127.0.0.1:8188/', 'chars/My Lora.safetensors');

    expect(url).toBe('http://127.0.0.1:8188/api/lm/previews?path=%2Fmodels%2Fa.png');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8188/api/lm/loras/preview-url?name=My%20Lora',
    );
  });

  it('returns null when the lora has no preview recorded', async () => {
    vi.stubGlobal('fetch', createMockFetch(() => ({ json: { success: true, preview_url: '' } })));

    await expect(fetchComfyUILoraPreviewUrl('http://127.0.0.1:8188', 'a.safetensors')).resolves.toBeNull();
  });

  it('reports both plausible causes on 404 (no preview / manager missing)', async () => {
    vi.stubGlobal('fetch', createMockFetch(() => ({ status: 404 })));

    await expect(fetchComfyUILoraPreviewUrl('http://127.0.0.1:8188', 'a.safetensors')).rejects.toThrow(
      /没有预览图/,
    );
  });

  it('surfaces the server error message when success is false', async () => {
    vi.stubGlobal('fetch', createMockFetch(() => ({ json: { success: false, error: 'lora not found' } })));

    await expect(fetchComfyUILoraPreviewUrl('http://127.0.0.1:8188', 'a.safetensors')).rejects.toThrow(
      'lora not found',
    );
  });

  it('returns null for a nameless lora without hitting the network', async () => {
    const fetchMock = createMockFetch(() => ({ json: { success: true, preview_url: '/x.png' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchComfyUILoraPreviewUrl('http://127.0.0.1:8188', '   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the ComfyUI url is empty', async () => {
    await expect(fetchComfyUILoraPreviewUrl('', 'a.safetensors')).rejects.toThrow('请先填写 ComfyUI URL');
  });
});
