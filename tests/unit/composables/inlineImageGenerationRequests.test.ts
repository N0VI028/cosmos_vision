import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { createImagePromptPreset } from '@/constants/image-prompt';
import type { CosmosVisionSettings } from '@/constants/novelai';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  generateImagesFromSnapshot,
  persistFloorTailImages,
  resolveFloorTailRenderContext,
} from '@/composables/inlineImageGenerationRequests';
import { generateComfyUIImagesFromPrompts } from '@/services/comfyui/api';
import { resolveComfyUILoraTriggerWords } from '@/services/comfyui/lora-trigger-words';
import { generateNovelAIImageFromPrompts } from '@/services/novelai/api';

vi.mock('@/services/comfyui/api', () => ({
  generateComfyUIImagesFromPrompts: vi.fn(),
}));

vi.mock('@/services/comfyui/lora-trigger-words', () => ({
  resolveComfyUILoraTriggerWords: vi.fn(),
}));

vi.mock('@/services/novelai/api', () => ({
  generateNovelAIImageFromPrompts: vi.fn(),
}));

function createTestSettings(): CosmosVisionSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.imagePromptPresets.positive = [
    createImagePromptPreset('P1', 'P1', 'template one, '),
  ];
  return settings;
}

describe('inlineImageGenerationRequests floor-tail helpers', () => {
  it('恢复 iframe 标识且不会被 body 文本影响', () => {
    document.body.innerHTML = '<div id="chat"><div class="mes" mesid="8"></div></div>';
    const context = { targetIframeId: 'frame-b', targetIframeIndex: 1 };

    expect(resolveFloorTailRenderContext(document.createElement('body'), 8, context)).toEqual({
      hostIframe: null,
      targetIframeId: 'frame-b',
      targetIframeIndex: 1,
    });
  });

  it('只返回成功持久化的楼层尾图片引用', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce('image-1')
      .mockResolvedValueOnce(null);
    const result = {
      imageBlobs: [new Blob(['one']), new Blob(['two'])],
      promptSnapshot: { positivePrompt: 'prompt', negativePrompt: '' },
    };

    await expect(persistFloorTailImages(render, 8, 0, 'slot', result)).resolves.toEqual(['image-1']);
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe('generateImagesFromSnapshot 再生与回放', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ComfyUI 有 parts 快照：按 parts 重构、拉取 snapshot loras 触发词并返回实际快照', async () => {
    const settings = createTestSettings();
    const controller = new AbortController();
    const mockImageBlob = new Blob(['image-data']);
    const snapshotLoras = [{ name: 'character_lora', strength: 0.8 }];

    const snapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      positivePrompt: 'oldTrigger, oldPositive',
      negativePrompt: 'oldNegative',
      comfyui: {
        endpoint: 'http://127.0.0.1:8188',
        positivePrompt: 'oldTrigger, oldPositive',
        negativePrompt: 'oldNegative',
        imageOutputNodeId: '9',
        promptBindings: [],
        seedValues: [],
        imageBindings: [],
        loras: snapshotLoras,
      },
      promptParts: {
        positive: { core: 'freshCore', presetId: 'P1' },
        negative: { core: 'freshNeg', presetId: '' },
      },
    };

    vi.mocked(resolveComfyUILoraTriggerWords).mockResolvedValueOnce(['freshTrigger']);
    const mockRequestSnapshot = {
      endpoint: 'http://127.0.0.1:8188',
      positivePrompt: 'freshTrigger, template one, freshCore',
      negativePrompt: 'freshNeg',
      imageOutputNodeId: '9',
      promptBindings: [],
      seedValues: [],
      imageBindings: [],
      loras: snapshotLoras,
    };
    vi.mocked(generateComfyUIImagesFromPrompts).mockResolvedValueOnce({
      imageBlobs: [mockImageBlob],
      requestSnapshot: mockRequestSnapshot,
      resolvedRequest: {} as any,
    });

    const result = await generateImagesFromSnapshot(settings, snapshot, controller.signal);

    // 验证按 snapshot.loras 解析触发词
    expect(resolveComfyUILoraTriggerWords).toHaveBeenCalledWith(
      settings.comfyui.url,
      ['character_lora'],
      controller.signal,
    );
    // 验证按 parts 重构正负提示词，并透传 snapshot loras 与触发词
    expect(generateComfyUIImagesFromPrompts).toHaveBeenCalledWith(
      settings.comfyui,
      {
        positivePrompt: 'template one, freshCore',
        negativePrompt: 'freshNeg',
      },
      {
        signal: controller.signal,
        loras: snapshotLoras,
        loraTriggerWords: ['freshTrigger'],
      },
    );
    // 验证返回新快照包含实际 requestSnapshot 与编辑 parts
    expect(result.imageBlobs).toEqual([mockImageBlob]);
    expect(result.promptSnapshot).toEqual({
      imageSource: 'comfyui',
      positivePrompt: 'freshTrigger, template one, freshCore',
      negativePrompt: 'freshNeg',
      comfyui: mockRequestSnapshot,
      promptParts: snapshot.promptParts,
    });
  });

  it('ComfyUI 旧快照（无 parts）：旧串原样发送、触发词传空、不产生 promptParts', async () => {
    const settings = createTestSettings();
    const controller = new AbortController();
    const mockImageBlob = new Blob(['image-data']);
    const snapshotLoras = [{ name: 'legacy_lora', strength: 1.0 }];

    const legacySnapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      positivePrompt: 'legacy positive with trigger',
      negativePrompt: 'legacy negative',
      comfyui: {
        endpoint: 'http://127.0.0.1:8188',
        positivePrompt: 'legacy positive with trigger',
        negativePrompt: 'legacy negative',
        imageOutputNodeId: '9',
        promptBindings: [],
        seedValues: [],
        imageBindings: [],
        loras: snapshotLoras,
      },
    };

    const mockRequestSnapshot = {
      endpoint: 'http://127.0.0.1:8188',
      positivePrompt: 'legacy positive with trigger',
      negativePrompt: 'legacy negative',
      imageOutputNodeId: '9',
      promptBindings: [],
      seedValues: [],
      imageBindings: [],
      loras: snapshotLoras,
    };
    vi.mocked(generateComfyUIImagesFromPrompts).mockResolvedValueOnce({
      imageBlobs: [mockImageBlob],
      requestSnapshot: mockRequestSnapshot,
      resolvedRequest: {} as any,
    });

    const result = await generateImagesFromSnapshot(settings, legacySnapshot, controller.signal);

    // 旧快照不拉取触发词
    expect(resolveComfyUILoraTriggerWords).not.toHaveBeenCalled();
    // 原样发送，触发词传空
    expect(generateComfyUIImagesFromPrompts).toHaveBeenCalledWith(
      settings.comfyui,
      {
        positivePrompt: 'legacy positive with trigger',
        negativePrompt: 'legacy negative',
      },
      {
        signal: controller.signal,
        loras: snapshotLoras,
        loraTriggerWords: [],
      },
    );
    expect(result.promptSnapshot.promptParts).toBeUndefined();
    expect(result.promptSnapshot.positivePrompt).toBe('legacy positive with trigger');
  });

  it('ComfyUI 生成失败或中止时向外抛错，不返回新快照', async () => {
    const settings = createTestSettings();
    const controller = new AbortController();
    const snapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      positivePrompt: 'pos',
      negativePrompt: 'neg',
    };

    vi.mocked(generateComfyUIImagesFromPrompts).mockRejectedValueOnce(new Error('ComfyUI 队列满'));

    await expect(generateImagesFromSnapshot(settings, snapshot, controller.signal)).rejects.toThrow('ComfyUI 队列满');
  });

  it('NovelAI 快照重生成保持现状', async () => {
    const settings = createTestSettings();
    const controller = new AbortController();
    const mockImageBlob = new Blob(['novelai-blob']);
    const snapshot: InlinePromptSnapshot = {
      imageSource: 'novelai',
      positivePrompt: 'nai pos',
      negativePrompt: 'nai neg',
      novelai: {
        positivePrompt: 'nai pos',
        negativePrompt: 'nai neg',
      },
    };

    vi.mocked(generateNovelAIImageFromPrompts).mockResolvedValueOnce(mockImageBlob);

    const result = await generateImagesFromSnapshot(settings, snapshot, controller.signal);

    expect(generateNovelAIImageFromPrompts).toHaveBeenCalledWith(
      settings.novelai,
      snapshot.novelai,
      { signal: controller.signal },
    );
    expect(result).toEqual({ promptSnapshot: snapshot, imageBlobs: [mockImageBlob] });
  });
});
