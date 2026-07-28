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
