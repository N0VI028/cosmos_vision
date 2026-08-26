import { shallowMount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { CharacterPromptItem, NovelAISettings } from '@/constants/novelai';
import {
  canPositionOneCharacter,
  isNovelAIV5Model,
  isNovelAIV4OrNewer,
} from '@/constants/novelai';
import {
  buildPayload,
  buildParameters,
  getEffectiveNoiseSchedule,
  toNovelAICoordinate,
  resolveUseCoords,
} from '@/services/novelai/payload';
import {
  buildNegativePrompt,
  buildPositivePrompt,
  getQualityPresetPrompt,
  getSupportedQualityPresets,
  getSupportedUcPresets,
  getUcPresetPrompt,
} from '@/services/novelai/prompt-presets';
import type { NovelAIFinalPrompts } from '@/services/novelai/types';
import NovelAITab from '@/panel/tabs/NovelAITab.vue';
import { useSettingsStore } from '@/store/settings';

/**
 * 查找噪声调度完整字段
 * @param wrapper NovelAI 设置页挂载实例
 * @returns 包含标题与选择器的 label
 */
function findNoiseScheduleField(wrapper: VueWrapper): DOMWrapper<Element> | undefined {
  return wrapper.findAll('label').find(label => label.text().includes('噪声调度'));
}

describe('NovelAI V5 Protocol & Params v4', () => {
  const createBaseSettings = (model: NovelAISettings['model'] = 'nai-diffusion-5-curated'): NovelAISettings => ({
    ...DEFAULT_SETTINGS.novelai,
    model,
    width: 832,
    height: 1216,
    guidance: 6.0,
    steps: 28,
    qualityPreset: 'Standard',
    ucPreset: 'Heavy',
    autoCharacterCoords: false,
  });

  const createPrompts = (overrides: Partial<NovelAIFinalPrompts> = {}): NovelAIFinalPrompts => ({
    positivePrompt: '1girl, solo, masterpiece',
    negativePrompt: 'lowres, bad quality',
    characterPrompts: [],
    ...overrides,
  });

  describe('Model Identification Helpers', () => {
    it('identifies V5 models correctly', () => {
      expect(isNovelAIV5Model('nai-diffusion-5-curated')).toBe(true);
      expect(isNovelAIV5Model('nai-diffusion-5-full')).toBe(true);
      expect(isNovelAIV5Model('nai-diffusion-4-5-curated')).toBe(false);
      expect(isNovelAIV5Model('nai-diffusion-3')).toBe(false);
    });

    it('identifies V4+ models correctly', () => {
      expect(isNovelAIV4OrNewer('nai-diffusion-5-curated')).toBe(true);
      expect(isNovelAIV4OrNewer('nai-diffusion-5-full')).toBe(true);
      expect(isNovelAIV4OrNewer('nai-diffusion-4-5-curated')).toBe(true);
      expect(isNovelAIV4OrNewer('nai-diffusion-4-full')).toBe(true);
      expect(isNovelAIV4OrNewer('nai-diffusion-3')).toBe(false);
    });

    it('identifies single character positioning capability', () => {
      expect(canPositionOneCharacter('nai-diffusion-5-curated')).toBe(true);
      expect(canPositionOneCharacter('nai-diffusion-5-full')).toBe(true);
      expect(canPositionOneCharacter('nai-diffusion-4-5-curated')).toBe(false);
      expect(canPositionOneCharacter('nai-diffusion-4-full')).toBe(false);
      expect(canPositionOneCharacter('nai-diffusion-3')).toBe(false);
    });
  });

  describe('Coordinates Formula & Normalization', () => {
    it('maps 0-4 grid integer indexes strictly to official coords [0.1, 0.3, 0.5, 0.7, 0.9]', () => {
      expect(toNovelAICoordinate(0)).toBe(0.1);
      expect(toNovelAICoordinate(1)).toBe(0.3);
      expect(toNovelAICoordinate(2)).toBe(0.5);
      expect(toNovelAICoordinate(3)).toBe(0.7);
      expect(toNovelAICoordinate(4)).toBe(0.9);
    });

    it('normalizes continuous float coordinates with 3 decimal precision', () => {
      expect(toNovelAICoordinate(0.32)).toBe(0.32);
      expect(toNovelAICoordinate(0.6789)).toBe(0.679);
      expect(toNovelAICoordinate(0)).toBe(0.1); // integer 0 mapped to grid 0.1
      expect(toNovelAICoordinate(0.0)).toBe(0.1); // integer 0 mapped to grid 0.1
      expect(toNovelAICoordinate(0.01)).toBe(0.01); // float
    });

    it('handles legacy > 1 coordinate values safely', () => {
      expect(toNovelAICoordinate(2.5)).toBe(0.625); // 2.5 / 4 = 0.625
    });
  });

  describe('use_coords Activation Rules', () => {
    it('enables use_coords for V5 with a single character when auto coords is false', () => {
      expect(resolveUseCoords(1, false, 'nai-diffusion-5-curated')).toBe(true);
      expect(resolveUseCoords(1, false, 'nai-diffusion-5-full')).toBe(true);
    });

    it('disables use_coords for V4/V4.5 with a single character (canPositionOneCharacter is false)', () => {
      expect(resolveUseCoords(1, false, 'nai-diffusion-4-5-curated')).toBe(false);
      expect(resolveUseCoords(1, false, 'nai-diffusion-4-full')).toBe(false);
    });

    it('enables use_coords for V4/V4.5 with 2 or more characters when auto coords is false', () => {
      expect(resolveUseCoords(2, false, 'nai-diffusion-4-5-curated')).toBe(true);
      expect(resolveUseCoords(3, false, 'nai-diffusion-4-full')).toBe(true);
    });

    it('disables use_coords when auto coords is true (AI choice)', () => {
      expect(resolveUseCoords(1, true, 'nai-diffusion-5-curated')).toBe(false);
      expect(resolveUseCoords(2, true, 'nai-diffusion-5-curated')).toBe(false);
      expect(resolveUseCoords(2, true, 'nai-diffusion-4-5-curated')).toBe(false);
    });

    it('sends use_order: true for V4+ even without characters (official behavior)', () => {
      const settings = createBaseSettings('nai-diffusion-4-5-full');
      const payload = buildPayload(settings, createPrompts(), 12345, 1);
      expect(payload.parameters.v4_prompt).toMatchObject({
        caption: { char_captions: [] },
        use_order: true,
      });
      expect(payload.parameters.v4_negative_prompt).toMatchObject({ use_order: true });
    });
  });

  describe('Noise Schedule Model Compatibility', () => {
    it('hides the complete field for both V5 models and restores it after model switches', async () => {
      setActivePinia(createPinia());
      const settingsStore = useSettingsStore();
      const wrapper = shallowMount(NovelAITab, { props: { subTab: 'config' } });

      settingsStore.settings.novelai.model = 'nai-diffusion-5-curated';
      await nextTick();
      expect(findNoiseScheduleField(wrapper)).toBeUndefined();

      settingsStore.settings.novelai.model = 'nai-diffusion-5-full';
      await nextTick();
      expect(findNoiseScheduleField(wrapper)).toBeUndefined();

      settingsStore.settings.novelai.model = 'nai-diffusion-4-5-curated';
      await nextTick();
      expect(findNoiseScheduleField(wrapper)?.findComponent({ name: 'Select' }).exists()).toBe(true);

      settingsStore.settings.novelai.model = 'nai-diffusion-3';
      await nextTick();
      expect(findNoiseScheduleField(wrapper)?.findComponent({ name: 'Select' }).exists()).toBe(true);
    });

    it('keeps non-native schedules across V5 and restores native only for V3', () => {
      const v5Settings = {
        ...createBaseSettings('nai-diffusion-5-curated'),
        noiseSchedule: 'exponential' as const,
      };
      const v45Settings = {
        ...createBaseSettings('nai-diffusion-4-5-full'),
        noiseSchedule: 'native' as const,
      };
      const v3Settings = { ...createBaseSettings('nai-diffusion-3'), noiseSchedule: 'native' as const };

      expect(getEffectiveNoiseSchedule(v5Settings)).toBe('exponential');
      expect(getEffectiveNoiseSchedule(v45Settings)).toBe('karras');
      expect(getEffectiveNoiseSchedule(v3Settings)).toBe('native');
    });
  });

  describe('Universal params_version: 4 across all models', () => {
    it('sets params_version to 4 for V5 models', () => {
      const settings = createBaseSettings('nai-diffusion-5-curated');
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.params_version).toBe(4);
    });

    it('sets params_version to 4 for V4.5 models', () => {
      const settings = createBaseSettings('nai-diffusion-4-5-full');
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.params_version).toBe(4);
    });

    it('sets params_version to 4 for V4 models', () => {
      const settings = createBaseSettings('nai-diffusion-4-full');
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.params_version).toBe(4);
    });

    it('sets params_version to 4 for V3 models', () => {
      const settings = createBaseSettings('nai-diffusion-3');
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.params_version).toBe(4);
    });
  });

  describe('Alignment with Official / nai-webui Request Specification', () => {
    it('always forces deliberate_euler_ancestral_bug: false across all models even with legacyPromptMode', () => {
      const v4Settings = {
        ...createBaseSettings('nai-diffusion-4-full'),
        legacyPromptMode: true,
      };
      const v4Params = buildParameters(v4Settings, createPrompts(), 12345, 1);
      expect(v4Params.deliberate_euler_ancestral_bug).toBe(false);
      expect(v4Params.legacy).toBe(true);

      const v3Settings = {
        ...createBaseSettings('nai-diffusion-3'),
        legacyPromptMode: true,
      };
      const v3Params = buildParameters(v3Settings, createPrompts(), 12345, 1);
      expect(v3Params.deliberate_euler_ancestral_bug).toBe(false);

      const v5Settings = {
        ...createBaseSettings('nai-diffusion-5-curated'),
        legacyPromptMode: true,
      };
      const v5Params = buildParameters(v5Settings, createPrompts(), 12345, 1);
      expect(v5Params.deliberate_euler_ancestral_bug).toBe(false);
    });

    it('omits skip_cfg_above_sigma when varietyPlus is false', () => {
      const v45Settings = {
        ...createBaseSettings('nai-diffusion-4-5-full'),
        varietyPlus: false,
      };
      const v45Params = buildParameters(v45Settings, createPrompts(), 12345, 1);
      expect(v45Params).not.toHaveProperty('skip_cfg_above_sigma');

      const v3Settings = {
        ...createBaseSettings('nai-diffusion-3'),
        varietyPlus: false,
      };
      const v3Params = buildParameters(v3Settings, createPrompts(), 12345, 1);
      expect(v3Params).not.toHaveProperty('skip_cfg_above_sigma');
    });

    it('includes skip_cfg_above_sigma when varietyPlus is true for V3 and V4.5', () => {
      const v45Settings = {
        ...createBaseSettings('nai-diffusion-4-5-full'),
        varietyPlus: true,
      };
      const v45Params = buildParameters(v45Settings, createPrompts(), 12345, 1);
      expect(v45Params.skip_cfg_above_sigma).toBeGreaterThan(0);

      const v3Settings = {
        ...createBaseSettings('nai-diffusion-3'),
        varietyPlus: true,
      };
      const v3Params = buildParameters(v3Settings, createPrompts(), 12345, 1);
      expect(v3Params.skip_cfg_above_sigma).toBeGreaterThan(0);
    });

    it('filters out empty character captions from v4_prompt and v4_negative_prompt', () => {
      const character: CharacterPromptItem = {
        positivePrompt: '   ',
        negativePrompt: 'bad anatomy',
        position: { x: 0.5, y: 0.5 },
      };
      const settings = createBaseSettings('nai-diffusion-5-curated');
      const prompts = createPrompts({ characterPrompts: [character] });
      const payload = buildPayload(settings, prompts, 12345, 1);

      const v4Prompt = payload.parameters.v4_prompt as any;
      const v4NegativePrompt = payload.parameters.v4_negative_prompt as any;

      expect(v4Prompt.caption.char_captions).toHaveLength(0);
      expect(v4NegativePrompt.caption.char_captions).toHaveLength(1);
      expect(v4NegativePrompt.caption.char_captions[0].char_caption).toBe('bad anatomy');
    });
  });

  describe('V5 Specific Parameters & Dirty Field Cleaning', () => {
    it('includes straight_alpha: true and standard tag hints for V5', () => {
      const settings = createBaseSettings('nai-diffusion-5-full');
      const params = buildParameters(settings, createPrompts(), 12345, 1);

      expect(params.straight_alpha).toBe(true);
      expect(params.qualityPresetId).toBe('standard');
      expect(params.ucPresetId).toBe('heavy');
      expect(params.tag_hint_qt).toBe(1);
      expect(params.tag_hint_uc_preset).toBe(2);
    });

    it('cleans all legacy dirty fields for V5', () => {
      const settings = {
        ...createBaseSettings('nai-diffusion-5-curated'),
        varietyPlus: true,
        legacyPromptMode: true,
        decrisp: true,
        smea: true,
      };
      const prompts = createPrompts({
        vibeParameters: {
          reference_image_multiple: ['abc'],
          reference_strength_multiple: [0.6],
          reference_information_extracted_multiple: [1],
        },
      });
      const params = buildParameters(settings, prompts, 12345, 1);

      expect(params).not.toHaveProperty('ucPreset');
      expect(params).not.toHaveProperty('qualityToggle');
      expect(params.legacy).toBe(false);
      expect(params.dynamic_thresholding).toBe(false);
      expect(params.deliberate_euler_ancestral_bug).toBe(false);
      expect(params).not.toHaveProperty('skip_cfg_above_sigma');
      expect(params).not.toHaveProperty('sm');
      expect(params).not.toHaveProperty('sm_dyn');
      expect(params).not.toHaveProperty('director_reference_descriptions');
      expect(params).not.toHaveProperty('director_reference_information_extracted');
      expect(params).not.toHaveProperty('director_reference_strength_values');
      expect(params).not.toHaveProperty('director_reference_secondary_strength_values');
      expect(params).not.toHaveProperty('reference_image_multiple');
      expect(params).not.toHaveProperty('reference_strength_multiple');
      expect(params).not.toHaveProperty('reference_information_extracted_multiple');
    });

    it('properly structures single character coordinates for V5', () => {
      const character: CharacterPromptItem = {
        positivePrompt: 'blue eyes',
        negativePrompt: 'bad eyes',
        position: { x: 1, y: 2 }, // grid index 1 -> 0.3, index 2 -> 0.5
      };
      const settings = createBaseSettings('nai-diffusion-5-curated');
      const prompts = createPrompts({ characterPrompts: [character] });
      const payload = buildPayload(settings, prompts, 12345, 1);

      expect(payload.parameters.use_coords).toBe(true);
      const v4Prompt = payload.parameters.v4_prompt as any;
      expect(v4Prompt.use_coords).toBe(true);
      expect(v4Prompt.caption.char_captions).toHaveLength(1);
      expect(v4Prompt.caption.char_captions[0].centers).toEqual([{ x: 0.3, y: 0.5 }]);
    });
  });

  describe('Preset Prompts & UC Fixes', () => {
    it('contains white blank page in V4 Full and Curated UC presets', () => {
      const settingsV4Full = createBaseSettings('nai-diffusion-4-full');
      const ucFull = buildNegativePrompt(
        settingsV4Full,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(ucFull).toContain('white blank page, blank page');

      const settingsV4Curated = createBaseSettings('nai-diffusion-4-curated-preview');
      const ucCurated = buildNegativePrompt(
        settingsV4Curated,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(ucCurated).toContain('white blank page, blank page');
    });

    it('corrects V4 Curated quality prompt to rating:general, best quality, very aesthetic, absurdres', () => {
      const settings = createBaseSettings('nai-diffusion-4-curated-preview');
      const positive = buildPositivePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(positive).toContain('rating:general, best quality, very aesthetic, absurdres');
    });

    it('removes location from V4.5 Full quality prompt', () => {
      const settings = createBaseSettings('nai-diffusion-4-5-full');
      const positive = buildPositivePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(positive).not.toContain('location,');
      expect(positive).toContain('very aesthetic, masterpiece, no text');
    });

    it('injects nsfw to negative prompt for V3 models when positive prompt lacks nsfw', () => {
      const settings = createBaseSettings('nai-diffusion-3');
      const negativeWithoutNsfw = buildNegativePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
        '',
        'extract',
        '1girl, solo, masterpiece',
      );
      expect(negativeWithoutNsfw.startsWith('nsfw, ')).toBe(true);

      const negativeWithNsfw = buildNegativePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
        '',
        'extract',
        '1girl, solo, nsfw, masterpiece',
      );
      expect(negativeWithNsfw.startsWith('nsfw, ')).toBe(false);
    });

    it('supports Light quality preset for V5 models with tag_hint_qt: 3', () => {
      const settings = {
        ...createBaseSettings('nai-diffusion-5-curated'),
        qualityPreset: 'Light' as const,
      };
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.qualityPresetId).toBe('light');
      expect(params.tag_hint_qt).toBe(3);

      const positive = buildPositivePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(positive).toContain('very aesthetic, amazing quality, no text');
    });

    it('supports None quality preset disabling quality tags with tag_hint_qt: 0', () => {
      const settings = {
        ...createBaseSettings('nai-diffusion-5-curated'),
        qualityPreset: 'None' as const,
      };
      const params = buildParameters(settings, createPrompts(), 12345, 1);
      expect(params.qualityPresetId).toBe('none');
      expect(params.tag_hint_qt).toBe(0);

      const positive = buildPositivePrompt(
        settings,
        DEFAULT_SETTINGS.imagePromptPresets,
        DEFAULT_SETTINGS.promptLlm,
      );
      expect(positive).not.toContain('masterpiece');
      expect(positive).not.toContain('amazing quality');
    });

    it('returns supported quality presets correctly per model family', () => {
      expect(getSupportedQualityPresets('nai-diffusion-5-curated')).toEqual(['Standard', 'Light', 'None']);
      expect(getSupportedQualityPresets('nai-diffusion-5-full')).toEqual(['Standard', 'Light', 'None']);
      expect(getSupportedQualityPresets('nai-diffusion-4-5-full')).toEqual(['Standard', 'None']);
      expect(getSupportedQualityPresets('nai-diffusion-4-full')).toEqual(['Standard', 'None']);
      expect(getSupportedQualityPresets('nai-diffusion-3')).toEqual(['Standard', 'None']);

      expect(getQualityPresetPrompt('nai-diffusion-5-curated', 'Standard')).toBe('very aesthetic, masterpiece, no text');
      expect(getQualityPresetPrompt('nai-diffusion-5-curated', 'Light')).toBe('very aesthetic, amazing quality, no text');
      expect(getQualityPresetPrompt('nai-diffusion-5-curated', 'None')).toBe('');
    });

    it('returns supported UC presets per model and maps tag_hint_uc_preset correctly', () => {
      expect(getSupportedUcPresets('nai-diffusion-5-full')).toEqual(['Heavy', 'Light', 'Human_Focus', 'Furry_Focus', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-5-curated')).toEqual(['Heavy', 'Light', 'Human_Focus', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-4-5-full')).toEqual(['Heavy', 'Light', 'Human_Focus', 'Furry_Focus', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-4-5-curated')).toEqual(['Heavy', 'Light', 'Human_Focus', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-4-full')).toEqual(['Heavy', 'Light', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-3')).toEqual(['Heavy', 'Light', 'Human_Focus', 'None']);
      expect(getSupportedUcPresets('nai-diffusion-furry-3')).toEqual(['Heavy', 'Light', 'None']);

      // V5 Human Focus
      const humanSettings = {
        ...createBaseSettings('nai-diffusion-5-full'),
        ucPreset: 'Human_Focus' as const,
      };
      const humanParams = buildParameters(humanSettings, createPrompts(), 12345, 1);
      expect(humanParams.ucPresetId).toBe('human_focus');
      expect(humanParams.tag_hint_uc_preset).toBe(4);
      expect(getUcPresetPrompt('nai-diffusion-5-full', 'Human_Focus')).toContain('bad anatomy');

      // V5 Furry Focus
      const furrySettings = {
        ...createBaseSettings('nai-diffusion-5-full'),
        ucPreset: 'Furry_Focus' as const,
      };
      const furryParams = buildParameters(furrySettings, createPrompts(), 12345, 1);
      expect(furryParams.ucPresetId).toBe('furry_focus');
      expect(furryParams.tag_hint_uc_preset).toBe(5);
      expect(getUcPresetPrompt('nai-diffusion-5-full', 'Furry_Focus')).toContain('grandfathered content');
    });
  });

  describe('V5 Rolling Quota & Usage Estimation', () => {
    it('estimates remaining image count with 17.3 images per 1%', async () => {
      const { estimateV5Images } = await import('@/services/novelai/subscription');
      expect(estimateV5Images(100)).toBe(1730);
      expect(estimateV5Images(182)).toBe(3149);
      expect(estimateV5Images(0)).toBe(0);
      expect(estimateV5Images(-10)).toBe(0);
      expect(estimateV5Images(null)).toBe(0);
      expect(estimateV5Images(undefined)).toBe(0);
    });

    it('returns appropriate CSS color classes for V5 quota bar', async () => {
      const { getV5BarClass } = await import('@/services/novelai/subscription');
      expect(getV5BarClass(100)).toBe('bg-(--cv-primary-container)');
      expect(getV5BarClass(30)).toBe('bg-(--cv-primary-container)');
      expect(getV5BarClass(29)).toBe('bg-(--cv-primary-container)');
      expect(getV5BarClass(0)).toBe('bg-[var(--cvp-red-500,#ef4444)]');
      expect(getV5BarClass(10, true)).toBe('bg-[var(--cvp-red-500,#ef4444)]');
    });
  });
});
