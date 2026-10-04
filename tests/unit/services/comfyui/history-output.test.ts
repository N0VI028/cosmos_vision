import { describe, expect, it } from 'vitest';
import { extractHistoryImages } from '@/services/comfyui/history';

describe('comfyui history output extraction', () => {
  it('returns null for null entry or missing output node', () => {
    expect(extractHistoryImages(null, '9')).toBeNull();
    expect(extractHistoryImages({}, '9')).toBeNull();
    expect(extractHistoryImages({ outputs: {} }, '9')).toBeNull();
  });

  it('extracts images when present', () => {
    const entry = {
      outputs: {
        '9': {
          images: [
            { filename: 'out1.png', subfolder: '', type: 'output' },
            { filename: 'out2.png', subfolder: '', type: 'output' },
          ],
        },
      },
    };
    const images = extractHistoryImages(entry, '9');
    expect(images).toHaveLength(2);
    expect(images![0].filename).toBe('out1.png');
  });

  it('throws error when node output exists but no valid image filenames', () => {
    const entry = {
      outputs: {
        '9': { images: [] },
      },
    };
    expect(() => extractHistoryImages(entry, '9')).toThrow(/未返回任何图片/);
  });
});

describe('fetchComfyUIHistoryResult', () => {
  it('throws error when execution completed but target node has no image output', async () => {
    const { fetchComfyUIHistoryResult } = await import('@/services/comfyui/api');
    const { createMockFetch } = await import('../../../helpers/fetch-mocks');

    const historyPayload = {
      'prompt-123': {
        outputs: {
          '6': { images: [{ filename: 'other.png', subfolder: '', type: 'output' }] },
        },
        status: {
          completed: true,
          status_str: 'success',
          messages: [],
        },
      },
    };

    const mockFetch = createMockFetch(() => ({ json: historyPayload }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      await expect(
        fetchComfyUIHistoryResult('http://127.0.0.1:8188', 'prompt-123', '8'),
      ).rejects.toThrow(/ComfyUI 执行完成但结果节点 8 未产出图片/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
