import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearComfyUIObjectInfoCache,
  fetchComfyUIObjectInfo,
  getCachedComfyUIObjectInfo,
  isImageFilename,
  isImageInputControl,
  listOutputCandidates,
  mapInputControls,
  normalizeObjectInfo,
} from '@/services/comfyui/object-info';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('comfyui object-info', () => {
  afterEach(() => {
    clearComfyUIObjectInfoCache();
    vi.unstubAllGlobals();
  });

  const rawObjectInfo = {
    CLIPTextEncode: {
      display_name: 'CLIP Text Encode',
      category: 'conditioning',
      input: {
        required: {
          text: ['STRING', { multiline: true }],
          clip: ['CLIP'],
        },
      },
      output: ['CONDITIONING'],
      output_name: ['CONDITIONING'],
    },
    LoadImage: {
      display_name: 'Load Image',
      category: 'image',
      input: {
        required: {
          image: ['IMAGEUPLOAD', { image_upload: true }],
        },
      },
      output: ['IMAGE', 'MASK'],
      output_name: ['IMAGE', 'MASK'],
    },
    PreviewImage: {
      display_name: 'Preview Image',
      input: {
        required: {
          images: ['IMAGE'],
        },
      },
      output: [],
    },
  };

  it('normalizes object_info payload correctly', () => {
    const normalized = normalizeObjectInfo(rawObjectInfo);
    expect(normalized.CLIPTextEncode.displayName).toBe('CLIP Text Encode');
    expect(normalized.CLIPTextEncode.inputs[0]).toEqual({
      name: 'text',
      type: 'STRING',
      required: true,
      options: undefined,
      default: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      multiline: true,
      imageUpload: false,
      controlAfterGenerate: false,
    });
    expect(normalized.LoadImage.inputs[0].imageUpload).toBe(true);
    expect(normalized.PreviewImage.inputs[0].type).toBe('IMAGE');
  });

  it('fetches object_info with caching and error handling', async () => {
    const mockFetch = createMockFetch(() => ({
      json: rawObjectInfo,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchComfyUIObjectInfo('http://127.0.0.1:8188');
    expect(data.CLIPTextEncode).toBeDefined();
    expect(getCachedComfyUIObjectInfo('http://127.0.0.1:8188')).toBeDefined();

    // 缓存生效，不再请求
    await fetchComfyUIObjectInfo('http://127.0.0.1:8188');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    clearComfyUIObjectInfoCache('http://127.0.0.1:8188');
    expect(getCachedComfyUIObjectInfo('http://127.0.0.1:8188')).toBeNull();
  });

  it('handles fetch errors properly', async () => {
    vi.stubGlobal('fetch', createMockFetch(() => ({ status: 500, ok: false })));
    await expect(fetchComfyUIObjectInfo('http://127.0.0.1:8188', true)).rejects.toThrow(/请求失败: 500/);
  });

  it('maps input controls and output candidate nodes', () => {
    const objectInfoMap = normalizeObjectInfo(rawObjectInfo);
    const workflow = {
      '1': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'prompt', clip: ['2', 0] },
      },
      '2': {
        class_type: 'LoadImage',
        inputs: { image: 'example.png' },
      },
      '3': {
        class_type: 'PreviewImage',
        inputs: { images: ['1', 0] },
      },
    };

    const controls = mapInputControls(workflow, '1', objectInfoMap);
    expect(controls).toHaveLength(2);
    expect(controls[0].kind).toBe('textarea');
    expect(controls[0].canPromptBind).toBe(true);
    expect(controls[1].kind).toBe('link');

    const imageControls = mapInputControls(workflow, '2', objectInfoMap);
    expect(imageControls).toHaveLength(1);
    expect(imageControls[0].isImageInput).toBe(true);
    expect(imageControls[0].canImageBind).toBe(true);

    const candidates = listOutputCandidates(workflow, objectInfoMap);
    expect(candidates).toContain('2');
    expect(candidates).toContain('3');
  });

  it('detects image filenames and image input controls correctly', () => {
    expect(isImageFilename('avatar.png')).toBe(true);
    expect(isImageFilename('photo.JPEG')).toBe(true);
    expect(isImageFilename('image.webp')).toBe(true);
    expect(isImageFilename('model.safetensors')).toBe(false);
    expect(isImageFilename(123)).toBe(false);

    const objectInfoMap = normalizeObjectInfo(rawObjectInfo);
    const schema = objectInfoMap.LoadImage;
    const spec = schema.inputs[0];
    expect(isImageInputControl('2', 'image', 'input.png', schema, spec)).toBe(true);
    expect(isImageInputControl('1', 'text', 'hello', objectInfoMap.CLIPTextEncode, objectInfoMap.CLIPTextEncode.inputs[0])).toBe(false);
  });
});
