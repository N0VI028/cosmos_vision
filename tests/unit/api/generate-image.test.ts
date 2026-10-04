import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { extension_settings } from '@sillytavern/scripts/extensions';

vi.mock('@/services/prompt-llm/runtime-request', () => ({ extractPromptLlmResult: vi.fn() }));
vi.mock('@/services/tavern-helper/prompt-llm', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/tavern-helper/prompt-llm')>()),
  buildPromptLlmSchemaFields: vi.fn(() => null),
}));
vi.mock('@/services/novelai/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/novelai/api')>()),
  buildNovelAIResolvedRequest: vi.fn(() => ({ resolved: true })),
  generateNovelAIImagesFromResolvedRequest: vi.fn(),
}));
vi.mock('@/services/comfyui/api', () => ({ generateComfyUIImagesFromResolvedRequest: vi.fn() }));
vi.mock('@/services/comfyui/request', () => ({ buildComfyUIResolvedRequest: vi.fn(() => ({ resolved: true })) }));
vi.mock('@/services/comfyui/lora-presets', () => ({ getActiveComfyUILoraPreset: vi.fn() }));
vi.mock('@/services/comfyui/lora-trigger-words', () => ({ resolveActiveComfyUILoraTriggerWords: vi.fn() }));

import { generateImage } from '@/api/generate-image';
import type { CharacterPromptItem } from '@/constants/novelai';
import { generateComfyUIImagesFromResolvedRequest } from '@/services/comfyui/api';
import { resolveActiveComfyUILoraTriggerWords } from '@/services/comfyui/lora-trigger-words';
import { getActiveComfyUILoraPreset } from '@/services/comfyui/lora-presets';
import { buildComfyUIResolvedRequest } from '@/services/comfyui/request';
import {
  buildNovelAIResolvedRequest,
  generateNovelAIImagesFromResolvedRequest,
} from '@/services/novelai/api';
import { extractPromptLlmResult } from '@/services/prompt-llm/runtime-request';
import { useSettingsStore } from '@/store/settings';

const mockedExtract = vi.mocked(extractPromptLlmResult);
const mockedBuildNaiRequest = vi.mocked(buildNovelAIResolvedRequest);
const mockedNaiImages = generateNovelAIImagesFromResolvedRequest as unknown as Mock;
const mockedComfyImages = generateComfyUIImagesFromResolvedRequest as unknown as Mock;
const mockedBuildComfyRequest = vi.mocked(buildComfyUIResolvedRequest);
const mockedActiveLoraPreset = vi.mocked(getActiveComfyUILoraPreset);
const mockedLoraTriggerWords = vi.mocked(resolveActiveComfyUILoraTriggerWords);

const extensionSettings = extension_settings as Record<string, unknown>;
const LORA_PRESET = { id: 'group-1', name: '默认组', loras: [] };
const EXTRACTED_CHARACTER: CharacterPromptItem = {
  positivePrompt: '2girls',
  negativePrompt: 'bad hands',
  position: { x: 0.2, y: 0.8 },
};

/** 准备已保存设置并指定图源 */
function setupSavedSettings(imageSource: 'novelai' | 'comfyui') {
  const store = useSettingsStore();
  store.savedSettings.imageSource = imageSource;
  return store;
}

describe('api/generate-image', () => {
  beforeEach(() => {
    Object.keys(extensionSettings).forEach(key => delete extensionSettings[key]);
    setActivePinia(createPinia());
    mockedActiveLoraPreset.mockReturnValue(LORA_PRESET);
    mockedLoraTriggerWords.mockResolvedValue([]);
    mockedComfyImages.mockResolvedValue([]);
    mockedNaiImages.mockResolvedValue({ imageBlobs: [], snapshot: {}, prompts: {} });
  });

  it('rawText 与 prompts 均未提供时抛中文错误', async () => {
    setupSavedSettings('novelai');

    await expect(generateImage({})).rejects.toThrow('rawText 与 prompts 至少提供一个');
    expect(mockedExtract).not.toHaveBeenCalled();
    expect(mockedNaiImages).not.toHaveBeenCalled();
  });

  it('同传 prompts 与 rawText 时走 prompts 并忽略 rawText', async () => {
    setupSavedSettings('novelai');

    const result = await generateImage({
      rawText: '未使用的原始回复',
      prompts: { positivePrompt: '1girl', characterPrompts: [{ positivePrompt: '2girls' }] },
    });

    expect(mockedExtract).not.toHaveBeenCalled();
    expect(result.prompts).toEqual({
      positivePrompt: '1girl',
      negativePrompt: '',
      characterPrompts: [{ positivePrompt: '2girls', negativePrompt: '', position: { x: 0.5, y: 0.5 } }],
    });
  });

  it('角色坐标非法或缺省时回退中心点', async () => {
    setupSavedSettings('novelai');

    const result = await generateImage({
      prompts: {
        positivePrompt: '1girl',
        characterPrompts: [
          { positivePrompt: 'a', position: { x: 3, y: -1 } },
          { positivePrompt: 'b', position: { x: 0.25, y: 0.75 } },
        ],
      },
    });

    expect(result.prompts.characterPrompts.map(item => item.position)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.25, y: 0.75 },
    ]);
  });

  it('rawText 分支调用提取且提取产物进入生图管道', async () => {
    const store = setupSavedSettings('novelai');
    mockedExtract.mockReturnValue({
      output: { positivePrompt: '提取正面', negativePrompt: '提取负面' },
      characterPrompts: [EXTRACTED_CHARACTER],
    });

    const result = await generateImage({ rawText: 'LLM 原始回复' });

    expect(mockedExtract).toHaveBeenCalledWith('LLM 原始回复', store.savedSettings.promptLlm, null);
    expect(mockedBuildNaiRequest).toHaveBeenCalledWith(
      store.savedSettings.novelai,
      store.savedSettings.imagePromptPresets,
      store.savedSettings.promptLlm,
      {
        positiveLLMPrompt: '提取正面',
        negativeLLMPrompt: '提取负面',
        positivePromptMode: 'direct',
        negativePromptMode: 'direct',
        characterPrompts: [EXTRACTED_CHARACTER],
      },
    );
    expect(result.prompts).toEqual({
      positivePrompt: '提取正面',
      negativePrompt: '提取负面',
      characterPrompts: [EXTRACTED_CHARACTER],
    });
  });

  it('提取抛出结构化错误时原样透传', async () => {
    setupSavedSettings('novelai');
    mockedExtract.mockImplementation(() => {
      throw new Error('LLM 返回的格式不符合预期');
    });

    await expect(generateImage({ rawText: 'LLM 原始回复' })).rejects.toThrow('LLM 返回的格式不符合预期');
    expect(mockedBuildNaiRequest).not.toHaveBeenCalled();
  });

  it('imageSource 为 novelai 时走 NovelAI 已解析请求管道', async () => {
    const store = setupSavedSettings('novelai');
    mockedNaiImages.mockResolvedValue({
      imageBlobs: [new Blob(['a'])],
      snapshot: {},
      prompts: {},
    });

    const result = await generateImage({
      prompts: { positivePrompt: '1girl', negativePrompt: 'lowres' },
      requestId: 'req-1',
    });

    expect(mockedNaiImages).toHaveBeenCalledWith({ resolved: true }, store.savedSettings.novelai.imageCount, {
      signal: undefined,
      onStreamPreview: undefined,
    });
    expect(mockedBuildComfyRequest).not.toHaveBeenCalled();
    expect(result.requestId).toBe('req-1');
    expect(result.imageBlobs).toHaveLength(1);
  });

  it('缺省 requestId 自动生成', async () => {
    setupSavedSettings('novelai');

    const result = await generateImage({ prompts: { positivePrompt: '1girl' } });

    expect(result.requestId).toMatch(/^cv-api-\d+$/);
  });

  it('imageSource 为 comfyui 时走 ComfyUI 已解析请求管道并解析触发词', async () => {
    const store = setupSavedSettings('comfyui');
    mockedLoraTriggerWords.mockResolvedValue(['trigger-a']);

    await generateImage({ prompts: { positivePrompt: '1girl', negativePrompt: 'lowres' } });

    expect(mockedActiveLoraPreset).toHaveBeenCalledWith(store.savedSettings.comfyui.loraPresets);
    expect(mockedLoraTriggerWords).toHaveBeenCalledWith(
      {
        url: store.savedSettings.comfyui.url,
        loraPresets: { ...store.savedSettings.comfyui.loraPresets, activePresetId: LORA_PRESET.id },
      },
      undefined,
    );
    expect(mockedBuildComfyRequest).toHaveBeenCalledWith(
      store.savedSettings.comfyui,
      store.savedSettings.imagePromptPresets,
      { positivePrompt: '1girl', negativePrompt: 'lowres' },
      ['trigger-a'],
      {
        positive: store.savedSettings.comfyui.positivePromptPresetId,
        negative: store.savedSettings.comfyui.negativePromptPresetId,
      },
      LORA_PRESET,
    );
    expect(mockedComfyImages).toHaveBeenCalledWith(store.savedSettings.comfyui, { resolved: true }, {
      signal: undefined,
      onProgress: undefined,
    });
    expect(mockedNaiImages).not.toHaveBeenCalled();
  });

  it('onStreamPreview 收到附加 requestId 的事件', async () => {
    setupSavedSettings('novelai');
    const onStreamPreview = vi.fn();

    await generateImage({
      prompts: { positivePrompt: '1girl' },
      requestId: 'req-nai',
      onStreamPreview,
    });

    const event = { previewBlob: new Blob(['p']), imageIndex: 0, step: 3, totalSteps: 28, completedCount: 0, imageCount: 1, isFinal: false };
    mockedNaiImages.mock.calls[0]![2]!.onStreamPreview!(event);

    expect(onStreamPreview).toHaveBeenCalledWith({ ...event, requestId: 'req-nai' });
  });

  it('onProgress 收到附加 requestId 的进度', async () => {
    setupSavedSettings('comfyui');
    const onProgress = vi.fn();

    await generateImage({
      prompts: { positivePrompt: '1girl' },
      requestId: 'req-comfy',
      onProgress,
    });

    mockedComfyImages.mock.calls[0]![2]!.onProgress!({ value: 4, max: 20 });

    expect(onProgress).toHaveBeenCalledWith({ value: 4, max: 20, requestId: 'req-comfy' });
  });

  it('底层生图错误原样 reject', async () => {
    setupSavedSettings('novelai');
    const failure = new Error('已尝试多组账号但均失败');
    mockedNaiImages.mockRejectedValue(failure);

    await expect(generateImage({ prompts: { positivePrompt: '1girl' } })).rejects.toBe(failure);
  });
});
