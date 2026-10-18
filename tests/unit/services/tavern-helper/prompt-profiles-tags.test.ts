import { describe, expect, it, vi } from 'vitest';
import {
  buildPromptPersonTagContext,
  parsePromptPersonStaticTagsFromText,
} from '@/services/tavern-helper/prompt-profiles-tags';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import * as availability from '@/services/tavern-helper/availability';
import * as runtimeRequest from '@/services/prompt-llm/runtime-request';

describe('prompt-profiles-tags service', () => {
  describe('buildPromptPersonTagContext', () => {
    it('returns empty string if sourceText is blank', () => {
      expect(buildPromptPersonTagContext('Alice', '   ')).toBe('');
    });

    it('builds context with rules, exemptions, and constraints', () => {
      const context = buildPromptPersonTagContext('Elysia', 'Pink hair, elf ears, maid outfit');
      expect(context).toContain('人物：Elysia');
      expect(context).toContain('Pink hair, elf ears, maid outfit');
      // 豁免说明
      expect(context).toContain('krea2');
      expect(context).toContain('本次人物资料解析均必须尝试提取并输出该人物专属的负面生图 tag');
      // 保守约束
      expect(context).toContain('保守约束');
      expect(context).toContain('推断出的外貌特征或排斥特征');
      expect(context).toContain('留空或省略');
      // 质量词禁止
      expect(context).toContain('严禁输出任何通用画质与质量词');
      expect(context).toContain('bad anatomy');
    });
  });

  describe('parsePromptPersonStaticTagsFromText extraction', () => {
    const mockSettings = DEFAULT_SETTINGS.promptLlm;
    const mockPresetSettings = DEFAULT_SETTINGS.promptLlmMessagePresets;

    it('throws error if source text is empty', async () => {
      await expect(
        parsePromptPersonStaticTagsFromText('Alice', '  ', mockSettings, mockPresetSettings),
      ).rejects.toThrow('没有可解析的人物资料');
    });

    it('prefers characterPrompts positive and negative prompts', async () => {
      vi.spyOn(availability, 'getTavernHelper').mockReturnValue({} as any);
      vi.spyOn(runtimeRequest, 'requestPromptLlmWithAccounts').mockResolvedValue({
        rawText: JSON.stringify({
          positivePrompt: 'global pos',
          negativePrompt: 'global neg',
          characterPrompts: [
            {
              positivePrompt: 'char pos 1',
              negativePrompt: 'char neg 1',
              position: { x: 0.5, y: 0.5 },
            },
          ],
        }),
      } as any);

      const result = await parsePromptPersonStaticTagsFromText(
        'Alice',
        'Profile info',
        { ...mockSettings, preferJsonSchemaExtraction: true },
        mockPresetSettings,
      );

      expect(result).toEqual({
        positiveTags: 'char pos 1',
        negativeTags: 'char neg 1',
      });
    });

    it('falls back to global positive and negative when characterPrompts are absent', async () => {
      vi.spyOn(availability, 'getTavernHelper').mockReturnValue({} as any);
      vi.spyOn(runtimeRequest, 'requestPromptLlmWithAccounts').mockResolvedValue({
        rawText: JSON.stringify({
          positivePrompt: 'global pos only',
          negativePrompt: 'global neg only',
        }),
      } as any);

      const result = await parsePromptPersonStaticTagsFromText(
        'Alice',
        'Profile info',
        mockSettings,
        mockPresetSettings,
      );

      expect(result).toEqual({
        positiveTags: 'global pos only',
        negativeTags: 'global neg only',
      });
    });

    it('returns empty negativeTags when negative is missing in both character and global', async () => {
      vi.spyOn(availability, 'getTavernHelper').mockReturnValue({} as any);
      vi.spyOn(runtimeRequest, 'requestPromptLlmWithAccounts').mockResolvedValue({
        rawText: JSON.stringify({
          positivePrompt: 'global pos only',
          negativePrompt: '',
        }),
      } as any);

      const result = await parsePromptPersonStaticTagsFromText(
        'Alice',
        'Profile info',
        mockSettings,
        mockPresetSettings,
      );

      expect(result).toEqual({
        positiveTags: 'global pos only',
        negativeTags: '',
      });
    });

    it('throws error when both positive and negative tags are empty', async () => {
      vi.spyOn(availability, 'getTavernHelper').mockReturnValue({} as any);
      vi.spyOn(runtimeRequest, 'requestPromptLlmWithAccounts').mockResolvedValue({
        rawText: JSON.stringify({
          positivePrompt: '',
          negativePrompt: '',
        }),
      } as any);

      await expect(
        parsePromptPersonStaticTagsFromText('Alice', 'Profile info', mockSettings, mockPresetSettings),
      ).rejects.toThrow('LLM 返回值无法提取人物 tag');
    });
  });
});
