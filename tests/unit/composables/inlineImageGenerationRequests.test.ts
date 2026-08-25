import { describe, expect, it, vi } from 'vitest';
import {
  persistFloorTailImages,
  resolveFloorTailRenderContext,
} from '@/composables/inlineImageGenerationRequests';

describe('inlineImageGenerationRequests floor-tail helpers', () => {
  it('恢复 iframe 标识且不会被 body 文本影响', () => {
    document.body.innerHTML = '<div id="chat"><div class="mes" mesid="8"></div></div>';
    const context = { targetIframeId: 'frame-b', targetIframeIndex: 1 };

    expect(resolveFloorTailRenderContext(document.createElement('body'), 8, context)).toEqual({
      hostIframe: null,
      targetIframeId: 'frame-b',
      targetIframeIndex: 1,
    });
  });

  it('只返回成功持久化的楼层尾图片引用', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce('image-1')
      .mockResolvedValueOnce(null);
    const result = {
      imageBlobs: [new Blob(['one']), new Blob(['two'])],
      promptSnapshot: { positivePrompt: 'prompt', negativePrompt: '' },
    };

    await expect(persistFloorTailImages(render, 8, 0, 'slot', result)).resolves.toEqual(['image-1']);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
