import { describe, expect, it } from 'vitest';
import { createNovelAISnapshot, toNovelAIRequestInfo } from '@/composables/inlineGenerationSnapshot';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import type { NovelAIRequestInfo, NovelAIRequestSnapshot } from '@/services/novelai/types';

describe('inlineGenerationSnapshot', () => {
  const mockPrompts: NovelAIFinalPrompts = {
    positivePrompt: '1girl, solo',
    negativePrompt: 'lowres',
    characterPrompts: [],
  };

  const mockSnapshot: NovelAIRequestSnapshot = {
    endpoint: 'https://image.novelai.net',
    accountName: '测试账号',
    model: 'nai-diffusion-4-full',
    positivePrompt: '1girl, solo',
    negativePrompt: 'lowres',
    characterPrompts: [],
    width: 832,
    height: 1216,
    sampler: 'k_euler',
    seed: 42,
    steps: 28,
    guidance: 6.0,
    autoSampler: true,
    varietyPlus: false,
    smea: false,
    smeaDyn: false,
    decrisp: false,
    legacyPromptMode: false,
    promptGuidanceRescale: 0,
    noiseSchedule: 'karras',
    ucPreset: 0,
    qualityPreset: 'heavy',
    imageCount: 1,
    vibes: { count: 0, referenceStrengths: [], informationExtracted: [], resolved: true },
  };

  describe('createNovelAISnapshot', () => {
    it('不带 request 时 novelaiRequest 字段缺省', () => {
      const snapshot = createNovelAISnapshot(mockPrompts);
      expect(snapshot.imageSource).toBe('novelai');
      expect(snapshot.positivePrompt).toBe('1girl, solo');
      expect(snapshot.negativePrompt).toBe('lowres');
      expect('novelaiRequest' in snapshot).toBe(false);
    });

    it('带 request 时正确写入 novelaiRequest', () => {
      const requestInfo: NovelAIRequestInfo = toNovelAIRequestInfo(mockSnapshot);
      const snapshot = createNovelAISnapshot(mockPrompts, requestInfo);
      expect(snapshot.imageSource).toBe('novelai');
      expect(snapshot.novelaiRequest).toEqual(requestInfo);
      expect(snapshot.novelaiRequest?.endpoint).toBe('https://image.novelai.net');
      expect(snapshot.novelaiRequest?.model).toBe('nai-diffusion-4-full');
      expect(snapshot.novelaiRequest?.seed).toBe(42);
    });
  });

  describe('toNovelAIRequestInfo', () => {
    it('剔除提示词字段并保留参数字段', () => {
      const info = toNovelAIRequestInfo(mockSnapshot);

      expect('positivePrompt' in info).toBe(false);
      expect('negativePrompt' in info).toBe(false);
      expect('characterPrompts' in info).toBe(false);

      // 验证关键参数保留
      expect(info.endpoint).toBe('https://image.novelai.net');
      expect(info.accountName).toBe('测试账号');
      expect(info.model).toBe('nai-diffusion-4-full');
      expect(info.width).toBe(832);
      expect(info.height).toBe(1216);
      expect(info.sampler).toBe('k_euler');
      expect(info.seed).toBe(42);
      expect(info.steps).toBe(28);
      expect(info.guidance).toBe(6.0);
      expect(info.noiseSchedule).toBe('karras');
      expect(info.qualityPreset).toBe('heavy');
      expect(info.imageCount).toBe(1);
    });
  });
});
