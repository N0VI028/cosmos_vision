import { describe, expect, it } from 'vitest';
import { interrogateWdTagger } from '@/services/wd-tagger/client';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('wd-tagger client', () => {
  it('handles Gradio upload, prediction, and result polling', async () => {
    const fetchImpl = createMockFetch(async (url) => {
      if (url.endsWith('/gradio_api/upload')) {
        return { json: ['tmp/image.png'] };
      }
      if (url.endsWith('/gradio_api/call/v2/predict')) {
        return { json: { event_id: 'evt-123' } };
      }
      if (url.endsWith('/gradio_api/call/predict/evt-123')) {
        const payloadData = [
          null,
          null,
          { confidences: [{ label: 'miku', confidence: 0.9 }] },
          { confidences: [{ label: '1girl', confidence: 0.99 }, { label: 'solo', confidence: 0.95 }] },
        ];
        const text = `event: complete\ndata: ${JSON.stringify(payloadData)}\n\n`;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
          },
        });
        return { ok: true, status: 200, body: stream } as any;
      }
      return { status: 404, ok: false };
    });

    const mockFile = new File(['dummy-image'], 'test.png', { type: 'image/png' });
    const result = await interrogateWdTagger(mockFile, {
      thresholds: { general: 0.35, character: 0.85 },
      fetchImpl,
      timeoutMs: 5000,
    });

    expect(result.generalTags).toHaveLength(2);
    expect(result.generalTags[0].label).toBe('1girl');
    expect(result.characterTags).toHaveLength(1);
    expect(result.characterTags[0].label).toBe('miku');
  });

  it('normalizes upload error properly', async () => {
    const fetchImpl = createMockFetch(() => ({ status: 500, ok: false }));
    const mockFile = new File(['dummy-image'], 'test.png', { type: 'image/png' });

    await expect(
      interrogateWdTagger(mockFile, {
        thresholds: { general: 0.35, character: 0.85 },
        fetchImpl,
      }),
    ).rejects.toThrow();
  });
});
