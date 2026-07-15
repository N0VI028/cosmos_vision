import { describe, expect, it } from 'vitest';
import { extractHistoryImages } from '@/services/comfyui/history';

describe('comfyui history output extraction', () => {
  it('returns ordered images from the selected node only', () => {
    const images = extractHistoryImages(
      {
        outputs: {
          '14': {
            images: [
              { filename: 'a.png', type: 'output' },
              { filename: 'b.png', type: 'output' },
            ],
          },
          '60': { images: [{ filename: 'other.png', type: 'output' }] },
        },
      },
      '14',
    );
    expect(images?.map(item => item.filename)).toEqual(['a.png', 'b.png']);
  });

  it('returns null while selected node is absent from outputs', () => {
    expect(
      extractHistoryImages(
        {
          outputs: {
            '60': { images: [{ filename: 'other.png' }] },
          },
        },
        '14',
      ),
    ).toBeNull();
  });

  it('throws when selected node exists but has no images', () => {
    expect(() =>
      extractHistoryImages(
        {
          outputs: {
            '14': { images: [] },
            '60': { images: [{ filename: 'other.png' }] },
          },
        },
        '14',
      ),
    ).toThrow(/未返回任何图片/);
  });
});
