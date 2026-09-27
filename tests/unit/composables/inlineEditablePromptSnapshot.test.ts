import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { createImagePromptPreset, type ImagePromptPresetSettings } from '@/constants/image-prompt';
import type { CosmosVisionSettings } from '@/constants/novelai';
import {
  buildEditableDisplayText,
  resolveStrippedPromptPart,
} from '@/composables/inlineEditablePromptSnapshot';
import { requestEditedPromptSnapshot } from '@/composables/inlineGenerationInput';
import type {
  InlinePromptPairInputOptions,
  InlinePromptPairInputValue,
} from '@/composables/inlineGenerationInput';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { stripImagePromptPresetText } from '@/services/image-prompt/presets';
import { getQualityPresetPrompt, getUcPresetPrompt } from '@/services/novelai/prompt-presets';

/**
 * 创建链路测试设置（P1/P2 两个正面模板预设 + N1 负面模板预设）
 * @returns 扩展设置
 */
function createChainSettings(): CosmosVisionSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const presetSettings: ImagePromptPresetSettings = {
    positive: [
      createImagePromptPreset('P1', 'P1', 'template one, '),
      createImagePromptPreset('P2', 'P2', 'template two, '),
    ],
    negative: [{ id: 'N1', name: 'N1', text: ', no bad stuff', placeholderOffset: 0 }],
  };
  settings.imagePromptPresets = presetSettings;
  settings.novelai.positivePromptPresetId = 'P1';
  settings.novelai.negativePromptPresetId = 'N1';
  return settings;
}

/**
 * 模拟编辑弹窗：回显整体文本默认值并接收 pristine core
 * 若模拟用户仅切换预设下拉未动输入框，则按弹窗行为以 positiveCore 重建整体文本
 * @param settings 扩展设置
 * @param edits 弹窗内的用户修改
 * @param onReceive 捕获弹窗接收到的参数
 * @returns 弹窗请求回调
 */
function createDialogMock(
  settings: CosmosVisionSettings,
  edits: Partial<InlinePromptPairInputValue> = {},
  onReceive?: (options: InlinePromptPairInputOptions) => void,
) {
  return async (options: InlinePromptPairInputOptions): Promise<InlinePromptPairInputValue> => {
    onReceive?.(options);
    const positivePresetId = edits.positivePresetId ?? options.positivePresetId ?? '';
    const negativePresetId = edits.negativePresetId ?? options.negativePresetId ?? '';
    const positive = edits.positive !== undefined
      ? edits.positive
      : (edits.positivePresetId !== undefined && edits.positivePresetId !== options.positivePresetId
          ? buildEditableDisplayText(settings.imagePromptPresets.positive, positivePresetId, options.positiveCore ?? '')
          : (options.positiveDefaultValue ?? ''));
    const negative = edits.negative !== undefined
      ? edits.negative
      : (edits.negativePresetId !== undefined && edits.negativePresetId !== options.negativePresetId
          ? buildEditableDisplayText(settings.imagePromptPresets.negative, negativePresetId, options.negativeCore ?? '')
          : (options.negativeDefaultValue ?? ''));
    return {
      positive,
      negative,
      characters: edits.characters ?? options.charactersDefaultValue ?? [],
      positivePresetId,
      negativePresetId,
    };
  };
}

describe('stripImagePromptPresetText 精确剥离函数', () => {
  it('前后缀均匹配时成功剥离核心提示词', () => {
    const preset = { id: 'P', name: 'P', text: 'master, , best', placeholderOffset: 8 };
    expect(stripImagePromptPresetText('master, 1girl, best', preset)).toBe('1girl');
  });

  it('仅有前缀时成功剥离后缀部分', () => {
    const preset = createImagePromptPreset('P', 'P', 'template one, ');
    expect(stripImagePromptPresetText('template one, girl', preset)).toBe('girl');
    expect(stripImagePromptPresetText('  template one, girl  ', preset)).toBe('girl');
  });

  it('仅有后缀时成功剥离前缀部分', () => {
    const preset = { id: 'N', name: 'N', text: ', no bad', placeholderOffset: 0 };
    expect(stripImagePromptPresetText('bad hand, no bad', preset)).toBe('bad hand');
  });

  it('模板词被用户篡改或破坏时返回 null', () => {
    const preset = createImagePromptPreset('P', 'P', 'template one, ');
    expect(stripImagePromptPresetText('template destroyed, girl', preset)).toBeNull();
  });
});

describe('buildEditableDisplayText 整体文本构建', () => {
  it('presetId 为空时直接返回 core', () => {
    const settings = createChainSettings();
    expect(buildEditableDisplayText(settings.imagePromptPresets.positive, '', 'raw core')).toBe('raw core');
  });

  it('presetId 非空时返回模板包裹结果', () => {
    const settings = createChainSettings();
    expect(buildEditableDisplayText(settings.imagePromptPresets.positive, 'P1', 'my core')).toBe('template one, my core');
  });
});

describe('resolveStrippedPromptPart 剥离助手', () => {
  it('剥离成功时保留 presetId 并提取 core', () => {
    const settings = createChainSettings();
    const result = resolveStrippedPromptPart(settings.imagePromptPresets.positive, 'P1', 'template one, my core');
    expect(result).toEqual({ core: 'my core', presetId: 'P1' });
  });

  it('剥离失败时回退为原样语义', () => {
    const settings = createChainSettings();
    const result = resolveStrippedPromptPart(settings.imagePromptPresets.positive, 'P1', 'corrupted text');
    expect(result).toEqual({ core: 'corrupted text', presetId: '' });
  });
});

describe('编辑提示词新交互模型：整体文本与精确剥离', () => {
  it('弹窗回显：positiveDefaultValue 收到的是「模板+core」整体文本；positiveCore 收到裸 core', async () => {
    const settings = createChainSettings();
    const snapshot: InlinePromptSnapshot = {
      positivePrompt: 'template one, llm core a, quality',
      negativePrompt: 'uc, neg a, no bad stuff',
      imageSource: 'novelai',
      novelai: { positivePrompt: 'template one, llm core a', negativePrompt: 'neg a, no bad stuff' },
      promptParts: {
        positive: { core: 'llm core a', presetId: 'P1' },
        negative: { core: 'neg a', presetId: 'N1' },
      },
    };
    let receivedOptions: InlinePromptPairInputOptions | undefined;
    await requestEditedPromptSnapshot(
      settings,
      snapshot,
      createDialogMock(settings, {}, opts => {
        receivedOptions = opts;
      }),
    );
    expect(receivedOptions).toBeDefined();
    expect(receivedOptions!.positiveDefaultValue).toBe('template one, llm core a');
    expect(receivedOptions!.positiveCore).toBe('llm core a');
    expect(receivedOptions!.negativeDefaultValue).toBe('neg a, no bad stuff');
    expect(receivedOptions!.negativeCore).toBe('neg a');
  });

  it('用户不动文本只切预设提交 → 快照 parts.core = pristine core、presetId = 新预设、最终串 = 新模板 + pristine + 质量词', async () => {
    const settings = createChainSettings();
    const quality = getQualityPresetPrompt(settings.novelai.model, settings.novelai.qualityPreset);
    const snapshot: InlinePromptSnapshot = {
      positivePrompt: `template one, pristine core, ${quality}`,
      negativePrompt: 'pristine neg, no bad stuff',
      imageSource: 'novelai',
      novelai: { positivePrompt: 'template one, pristine core', negativePrompt: 'pristine neg, no bad stuff' },
      promptParts: {
        positive: { core: 'pristine core', presetId: 'P1' },
        negative: { core: 'pristine neg', presetId: 'N1' },
      },
    };
    const edited = (await requestEditedPromptSnapshot(
      settings,
      snapshot,
      createDialogMock(settings, { positivePresetId: 'P2' }),
    ))!;
    expect(edited.promptParts?.positive).toEqual({ core: 'pristine core', presetId: 'P2' });
    expect(edited.positivePrompt).toBe(`template two, pristine core, ${quality}`);
  });

  it('用户编辑 core 部分（模板前缀/后缀词未动）提交 → 剥离成功，parts.core = 编辑后内容', async () => {
    const settings = createChainSettings();
    const quality = getQualityPresetPrompt(settings.novelai.model, settings.novelai.qualityPreset);
    const snapshot: InlinePromptSnapshot = {
      positivePrompt: `template one, pristine core, ${quality}`,
      negativePrompt: 'pristine neg, no bad stuff',
      imageSource: 'novelai',
      novelai: { positivePrompt: 'template one, pristine core', negativePrompt: 'pristine neg, no bad stuff' },
      promptParts: {
        positive: { core: 'pristine core', presetId: 'P1' },
        negative: { core: 'pristine neg', presetId: 'N1' },
      },
    };
    const edited = (await requestEditedPromptSnapshot(
      settings,
      snapshot,
      createDialogMock(settings, { positive: 'template one, custom modified content' }),
    ))!;
    expect(edited.promptParts?.positive).toEqual({ core: 'custom modified content', presetId: 'P1' });
    expect(edited.positivePrompt).toBe(`template one, custom modified content, ${quality}`);
  });

  it('用户破坏模板前缀提交 → 回退原样（presetId=\'\'、core=用户整串），最终串 = 用户整串 + 质量词', async () => {
    const settings = createChainSettings();
    const quality = getQualityPresetPrompt(settings.novelai.model, settings.novelai.qualityPreset);
    const snapshot: InlinePromptSnapshot = {
      positivePrompt: `template one, pristine core, ${quality}`,
      negativePrompt: 'pristine neg, no bad stuff',
      imageSource: 'novelai',
      novelai: { positivePrompt: 'template one, pristine core', negativePrompt: 'pristine neg, no bad stuff' },
      promptParts: {
        positive: { core: 'pristine core', presetId: 'P1' },
        negative: { core: 'pristine neg', presetId: 'N1' },
      },
    };
    const edited = (await requestEditedPromptSnapshot(
      settings,
      snapshot,
      createDialogMock(settings, { positive: 'completely custom prompt without template' }),
    ))!;
    expect(edited.promptParts?.positive).toEqual({
      core: 'completely custom prompt without template',
      presetId: '',
    });
    expect(edited.positivePrompt).toBe(`completely custom prompt without template, ${quality}`);
  });

  it('旧快照（无 parts，presetId=\'\'）原样显示整串；从原样切到具体预设 → 最终串 = 模板 + 旧整串 + 质量词', async () => {
    const settings = createChainSettings();
    const quality = getQualityPresetPrompt(settings.novelai.model, settings.novelai.qualityPreset);
    const legacySnapshot: InlinePromptSnapshot = {
      positivePrompt: `legacy full prompt, ${quality}`,
      negativePrompt: 'legacy neg prompt',
      imageSource: 'novelai',
      novelai: { positivePrompt: `legacy full prompt, ${quality}`, negativePrompt: 'legacy neg prompt' },
    };
    let receivedOptions: InlinePromptPairInputOptions | undefined;
    const edited = (await requestEditedPromptSnapshot(
      settings,
      legacySnapshot,
      createDialogMock(
        settings,
        { positivePresetId: 'P1' },
        opts => {
          receivedOptions = opts;
        },
      ),
    ))!;
    expect(receivedOptions?.positivePresetId).toBe('');
    expect(receivedOptions?.positiveDefaultValue).toBe('legacy full prompt');
    expect(receivedOptions?.positiveCore).toBe('legacy full prompt');
    expect(edited.promptParts?.positive).toEqual({ core: 'legacy full prompt', presetId: 'P1' });
    expect(edited.positivePrompt).toBe(`template one, legacy full prompt, ${quality}`);
  });

  it('负面侧对称：破坏负面预设后缀时回退原样', async () => {
    const settings = createChainSettings();
    const uc = getUcPresetPrompt(settings.novelai.model, settings.novelai.ucPreset);
    const snapshot: InlinePromptSnapshot = {
      positivePrompt: 'pos',
      negativePrompt: `${uc}, neg a, no bad stuff`,
      imageSource: 'novelai',
      novelai: { positivePrompt: 'pos', negativePrompt: 'neg a, no bad stuff' },
      promptParts: {
        positive: { core: 'pos', presetId: 'P1' },
        negative: { core: 'neg a', presetId: 'N1' },
      },
    };
    const edited = (await requestEditedPromptSnapshot(
      settings,
      snapshot,
      createDialogMock(settings, { negative: 'broken suffix neg' }),
    ))!;
    expect(edited.promptParts?.negative).toEqual({ core: 'broken suffix neg', presetId: '' });
    expect(edited.negativePrompt).toBe(`${uc}, broken suffix neg`);
  });

  describe('ComfyUI 分支编辑行为', () => {
    const dummyComfyUISnapshot = {
      endpoint: 'http://127.0.0.1:8188',
      positivePrompt: 'triggerA, template one, old core',
      negativePrompt: 'old neg',
      imageOutputNodeId: '9',
      promptBindings: [],
      seedValues: [],
      imageBindings: [],
      loras: [{ name: 'testLora', strength: 1.0 }],
    };

    it('有 parts 快照编辑：仅更新 promptParts，不动最终串与 comfyui 最终串', async () => {
      const settings = createChainSettings();
      const snapshot: InlinePromptSnapshot = {
        imageSource: 'comfyui',
        positivePrompt: 'triggerA, template one, old core',
        negativePrompt: 'old neg',
        comfyui: { ...dummyComfyUISnapshot },
        promptParts: {
          positive: { core: 'old core', presetId: 'P1' },
          negative: { core: 'old neg', presetId: '' },
        },
      };

      const edited = (await requestEditedPromptSnapshot(
        settings,
        snapshot,
        createDialogMock(settings, { positive: 'template one, new modified core' }),
      ))!;

      // 仅更新 promptParts
      expect(edited.promptParts?.positive).toEqual({ core: 'new modified core', presetId: 'P1' });
      // 不动最终串、不动 comfyui 最终串（等待紧随的异步重生成更新）
      expect(edited.positivePrompt).toBe('triggerA, template one, old core');
      expect(edited.comfyui?.positivePrompt).toBe('triggerA, template one, old core');
    });

    it('旧快照（无 parts）未修改直接提交：保持 promptParts 为 undefined', async () => {
      const settings = createChainSettings();
      const legacySnapshot: InlinePromptSnapshot = {
        imageSource: 'comfyui',
        positivePrompt: 'legacy comfyui prompt',
        negativePrompt: 'legacy neg prompt',
        comfyui: { ...dummyComfyUISnapshot, positivePrompt: 'legacy comfyui prompt', negativePrompt: 'legacy neg prompt' },
      };

      // 未做任何修改，直接按默认回填值提交
      const edited = (await requestEditedPromptSnapshot(
        settings,
        legacySnapshot,
        createDialogMock(settings, {}),
      ))!;

      expect(edited.promptParts).toBeUndefined();
      expect(edited.positivePrompt).toBe('legacy comfyui prompt');
      expect(edited.comfyui?.positivePrompt).toBe('legacy comfyui prompt');
    });

    it('旧快照（无 parts）被修改提交：更新 promptParts，最终串不动', async () => {
      const settings = createChainSettings();
      const legacySnapshot: InlinePromptSnapshot = {
        imageSource: 'comfyui',
        positivePrompt: 'legacy comfyui prompt',
        negativePrompt: 'legacy neg prompt',
        comfyui: { ...dummyComfyUISnapshot, positivePrompt: 'legacy comfyui prompt', negativePrompt: 'legacy neg prompt' },
      };

      const edited = (await requestEditedPromptSnapshot(
        settings,
        legacySnapshot,
        createDialogMock(settings, { positive: 'modified legacy prompt' }),
      ))!;

      expect(edited.promptParts?.positive).toEqual({ core: 'modified legacy prompt', presetId: '' });
      expect(edited.positivePrompt).toBe('legacy comfyui prompt');
    });
  });
});
