import { describe, expect, it } from 'vitest';
import {
  appendStaticTags,
  createPromptPersonTagsDraft,
  formatWdTagDraft,
} from '@/services/prompt-profiles/static-tags-draft';

describe('static-tags-draft service', () => {
  describe('formatWdTagDraft', () => {
    it('combines generalTags and characterTags with deduplication', () => {
      const result = formatWdTagDraft({
        generalTags: [
          { label: 'solo', score: 0.9 },
          { label: 'blue eyes', score: 0.8 },
        ],
        characterTags: [
          { label: 'frieren', score: 0.95 },
          { label: 'solo', score: 0.88 }, // duplicate
        ],
        rating: 'general',
      } as any);

      expect(result).toBe('solo, blue eyes, frieren');
    });
  });

  describe('createPromptPersonTagsDraft', () => {
    it('creates draft with trimmed positive and negative tags', () => {
      const draft = createPromptPersonTagsDraft('  1girl, blonde hair  ', '  bad hands  ');
      expect(draft).toEqual({
        positiveTags: '1girl, blonde hair',
        negativeTags: 'bad hands',
      });
    });

    it('defaults to empty strings', () => {
      const draft = createPromptPersonTagsDraft();
      expect(draft).toEqual({
        positiveTags: '',
        negativeTags: '',
      });
    });
  });

  describe('appendStaticTags', () => {
    it('appends with comma and space separator', () => {
      expect(appendStaticTags('1girl', 'blue eyes')).toBe('1girl, blue eyes');
    });

    it('handles trailing or leading commas gracefully', () => {
      expect(appendStaticTags('1girl, ', ' blue eyes')).toBe('1girl, blue eyes');
      expect(appendStaticTags('1girl', ', blue eyes')).toBe('1girl, blue eyes');
    });

    it('returns addition if base is empty', () => {
      expect(appendStaticTags('', 'blue eyes')).toBe('blue eyes');
      expect(appendStaticTags('   ', 'blue eyes')).toBe('blue eyes');
    });

    it('returns base if addition is empty', () => {
      expect(appendStaticTags('1girl', '')).toBe('1girl');
      expect(appendStaticTags('1girl', '   ')).toBe('1girl');
    });

    it('works identically for negative tags appending', () => {
      expect(appendStaticTags('red eyes', 'short hair')).toBe('red eyes, short hair');
    });
  });
});
