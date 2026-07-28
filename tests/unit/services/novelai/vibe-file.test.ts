import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64,
  isOfficialNovelAIVibeTransferValue,
  stripDataUrlBase64,
} from '@/services/novelai/vibe-file';

describe('novelai vibe-file utils', () => {
  it('strips data url base64 prefix', () => {
    expect(stripDataUrlBase64('data:image/png;base64,iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
    expect(stripDataUrlBase64('iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
  });

  it('converts ArrayBuffer to base64 string', () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode('hello world').buffer;
    const b64 = arrayBufferToBase64(buf);
    expect(atob(b64)).toBe('hello world');
  });

  it('identifies official NovelAI vibe transfer JSON structure', () => {
    const validSingle = {
      identifier: 'novelai-vibe-transfer',
      version: 1,
      type: 'encoding',
      id: 'vibe-1',
      name: 'vibe 1',
      encodings: {},
      importInfo: {
        model: 'nai-diffusion-4-5-curated',
        strength: 0.6,
        information_extracted: 1.0,
      },
    };
    expect(isOfficialNovelAIVibeTransferValue(validSingle)).toBe(true);

    const validBundle = {
      identifier: 'novelai-vibe-transfer-bundle',
      version: 1,
      vibes: [validSingle],
    };
    expect(isOfficialNovelAIVibeTransferValue(validBundle)).toBe(true);
    expect(isOfficialNovelAIVibeTransferValue({})).toBe(false);
  });
});
