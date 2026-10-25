import { describe, expect, it } from 'vitest';
import {
  extractPromptTagsFromChunks,
  mergeTagsPreservingOrder,
  parseComfyUiPrompt,
  parseNaiMetadata,
  parseSdParameters,
} from '@/services/image-metadata/extract-tags';

describe('extract-tags service', () => {
  describe('mergeTagsPreservingOrder', () => {
    it('merges multiple tag groups, splitting by comma and deduplicating while preserving order', () => {
      const result = mergeTagsPreservingOrder([
        '1girl, solo, blue hair',
        'solo, hat, Blue Hair', // duplicate solo and blue hair (case-insensitive)
        'masterpiece, best quality, 1girl',
      ]);
      expect(result).toBe('1girl, solo, blue hair, hat, masterpiece, best quality');
    });

    it('handles empty, null, or undefined entries gracefully', () => {
      const result = mergeTagsPreservingOrder(['tag1, tag2', null, '', undefined, 'tag3']);
      expect(result).toBe('tag1, tag2, tag3');
    });
  });

  describe('parseNaiMetadata', () => {
    it('merges char_captions and base_caption for NovelAI V4+ metadata', () => {
      const naiV4Json = JSON.stringify({
        v4_prompt: {
          caption: {
            base_caption: 'masterpiece, outdoors, blue sky',
            char_captions: [
              { char_caption: '1girl, blonde hair, blue eyes', centers: [{ x: 0.5, y: 0.5 }] },
              { char_caption: '1boy, black hair, outdoors', centers: [{ x: 0.2, y: 0.5 }] },
            ],
          },
        },
        v4_negative_prompt: {
          caption: {
            base_caption: 'worst quality, bad anatomy',
          },
        },
      });

      const draft = parseNaiMetadata(naiV4Json);
      expect(draft).not.toBeNull();
      // char_captions (1girl, blonde hair, blue eyes, 1boy, black hair) then base_caption (masterpiece, outdoors, blue sky)
      // "outdoors" in char_caption should not be duplicated when base_caption has it
      expect(draft?.positiveTags).toBe(
        '1girl, blonde hair, blue eyes, 1boy, black hair, outdoors, masterpiece, blue sky',
      );
      expect(draft?.negativeTags).toBe('worst quality, bad anatomy');
    });

    it('falls back to base_caption when char_captions is absent or empty in V4+', () => {
      const naiV4Json = JSON.stringify({
        v4_prompt: {
          caption: {
            base_caption: '1girl, solo, cherry blossoms, (masterpiece:1.2)',
          },
        },
        v4_negative_prompt: {
          caption: {
            base_caption: 'lowres, bad hands',
          },
        },
      });

      const draft = parseNaiMetadata(naiV4Json);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('1girl, solo, cherry blossoms, (masterpiece:1.2)');
      expect(draft?.negativeTags).toBe('lowres, bad hands');
    });

    it('parses legacy NovelAI V3 prompt and uc strings', () => {
      const naiV3Json = JSON.stringify({
        prompt: '1girl, solo, fantasy castle',
        uc: 'nsfw, lowres, text, signature',
      });

      const draft = parseNaiMetadata(naiV3Json);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('1girl, solo, fantasy castle');
      expect(draft?.negativeTags).toBe('nsfw, lowres, text, signature');
    });

    it('throws error when JSON is malformed', () => {
      expect(() => parseNaiMetadata('{ "prompt": invalid_json }')).toThrow('元数据 JSON 解析失败');
    });

    it('returns null if text does not look like JSON object', () => {
      expect(parseNaiMetadata('plain text not json')).toBeNull();
    });
  });

  describe('parseSdParameters', () => {
    it('extracts positive and negative prompts while discarding settings line', () => {
      const raw = `1girl, solo, <lora:detail:0.8>, (masterpiece:1.2), beautiful eyes
Negative prompt: (worst quality, low quality:1.4), bad hands, deformed
Steps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1234567, Size: 832x1216`;

      const draft = parseSdParameters(raw);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe(
        '1girl, solo, <lora:detail:0.8>, (masterpiece:1.2), beautiful eyes',
      );
      expect(draft?.negativeTags).toBe('(worst quality, low quality:1.4), bad hands, deformed');
    });

    it('handles parameters with no negative prompt', () => {
      const raw = `1girl, solo, outdoors
Steps: 20, Sampler: Euler a, CFG scale: 7`;

      const draft = parseSdParameters(raw);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('1girl, solo, outdoors');
      expect(draft?.negativeTags).toBe('');
    });

    it('handles parameters with no settings line', () => {
      const raw = `1girl, solo
Negative prompt: blurry`;

      const draft = parseSdParameters(raw);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('1girl, solo');
      expect(draft?.negativeTags).toBe('blurry');
    });
  });

  describe('parseComfyUiPrompt', () => {
    it('identifies positive and negative CLIPTextEncode nodes via KSampler wiring', () => {
      const comfyPrompt = JSON.stringify({
        '3': {
          class_type: 'KSampler',
          inputs: {
            positive: ['6', 0],
            negative: ['7', 0],
            model: ['4', 0],
          },
        },
        '6': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'masterpiece, 1girl, solo, starry sky',
          },
        },
        '7': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'bad hands, low quality, watermark',
          },
        },
      });

      const draft = parseComfyUiPrompt(comfyPrompt);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('masterpiece, 1girl, solo, starry sky');
      expect(draft?.negativeTags).toBe('bad hands, low quality, watermark');
    });

    it('classifies unidentifiable CLIPTextEncode nodes as positive', () => {
      const comfyPrompt = JSON.stringify({
        '10': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'extra character detail',
          },
        },
      });

      const draft = parseComfyUiPrompt(comfyPrompt);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('extra character detail');
      expect(draft?.negativeTags).toBe('');
    });

    it('traces through intermediate nodes (like Reroute)', () => {
      const comfyPrompt = JSON.stringify({
        '3': {
          class_type: 'KSampler',
          inputs: {
            positive: ['8', 0],
            negative: ['7', 0],
          },
        },
        '8': {
          class_type: 'Reroute',
          inputs: {
            conditioning: ['6', 0],
          },
        },
        '6': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'positive text via reroute',
          },
        },
        '7': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'negative text',
          },
        },
      });

      const draft = parseComfyUiPrompt(comfyPrompt);
      expect(draft).not.toBeNull();
      expect(draft?.positiveTags).toBe('positive text via reroute');
      expect(draft?.negativeTags).toBe('negative text');
    });

    it('returns null if there are no CLIPTextEncode nodes', () => {
      const comfyPrompt = JSON.stringify({
        '1': { class_type: 'VAELoader' },
      });
      expect(parseComfyUiPrompt(comfyPrompt)).toBeNull();
    });
  });

  describe('extractPromptTagsFromChunks', () => {
    it('prefers NAI chunk when Description is present', () => {
      const chunks = [
        {
          keyword: 'Description',
          text: JSON.stringify({ prompt: 'nai prompt', uc: 'nai negative' }),
        },
      ];
      const draft = extractPromptTagsFromChunks(chunks);
      expect(draft.positiveTags).toBe('nai prompt');
      expect(draft.negativeTags).toBe('nai negative');
    });

    it('extracts from SD parameters chunk', () => {
      const chunks = [
        {
          keyword: 'parameters',
          text: 'sd prompt\nNegative prompt: sd negative\nSteps: 20',
        },
      ];
      const draft = extractPromptTagsFromChunks(chunks);
      expect(draft.positiveTags).toBe('sd prompt');
      expect(draft.negativeTags).toBe('sd negative');
    });

    it('extracts from ComfyUI prompt chunk', () => {
      const chunks = [
        {
          keyword: 'prompt',
          text: JSON.stringify({
            '1': {
              class_type: 'CLIPTextEncode',
              inputs: { text: 'comfy positive' },
            },
          }),
        },
      ];
      const draft = extractPromptTagsFromChunks(chunks);
      expect(draft.positiveTags).toBe('comfy positive');
      expect(draft.negativeTags).toBe('');
    });

    it('throws error when no supported metadata is found in chunks', () => {
      const chunks = [{ keyword: 'Author', text: 'SomeArtist' }];
      expect(() => extractPromptTagsFromChunks(chunks)).toThrow(
        '未在图片中找到支持的生图元数据（NAI/SD/ComfyUI）',
      );
    });

    it('throws error when metadata chunk has empty prompts', () => {
      const chunks = [
        {
          keyword: 'Description',
          text: JSON.stringify({ prompt: '', uc: '' }),
        },
      ];
      expect(() => extractPromptTagsFromChunks(chunks)).toThrow(
        '元数据中未找到有效的提示词内容',
      );
    });
  });
});
