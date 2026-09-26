import { describe, expect, it } from 'vitest';
import { applyModelMatch, isModelMatchManagedInput, readComfyUIMainModelNames } from '@/services/comfyui/model-loaders';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

/** 构造仅含输入与类型的测试节点 */
function node(classType: string, inputs: Record<string, unknown>): ComfyUIWorkflow[string] {
  return { class_type: classType, inputs };
}

describe('comfyui model-loaders', () => {
  it('extracts ckpt_name from checkpoint loader', () => {
    const workflow: ComfyUIWorkflow = {
      '4': node('CheckpointLoaderSimple', { ckpt_name: 'waiIllustriousSDXL_v150.safetensors' }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual(['waiIllustriousSDXL_v150.safetensors']);
  });

  it('extracts unet_name from unet loader', () => {
    const workflow: ComfyUIWorkflow = {
      '1': node('UNETLoader', { unet_name: 'flux1-dev.safetensors', weight_dtype: 'default' }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual(['flux1-dev.safetensors']);
  });

  it('extracts unet_name from custom node class types', () => {
    const workflow: ComfyUIWorkflow = {
      '7': node('MyCustomLoader', { unet_name: ' custom_model.safetensors ' }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual(['custom_model.safetensors']);
  });

  it('ignores lora, vae, and clip inputs', () => {
    const workflow: ComfyUIWorkflow = {
      '2': node('LoraLoader', { lora_name: 'style.safetensors' }),
      '3': node('VAELoader', { vae_name: 'vae-ft.safetensors' }),
      '4': node('CLIPLoader', { clip_name: 'clip_l.safetensors' }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual([]);
  });

  it('deduplicates repeated names case-insensitively and keeps first order', () => {
    const workflow: ComfyUIWorkflow = {
      '1': node('CheckpointLoaderSimple', { ckpt_name: 'model.safetensors' }),
      '2': node('UNETLoader', { unet_name: 'MODEL.safetensors' }),
      '3': node('UNETLoader', { unet_name: 'other.safetensors' }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual(['model.safetensors', 'other.safetensors']);
  });

  it('ignores empty strings and non-string values', () => {
    const workflow: ComfyUIWorkflow = {
      '1': node('CheckpointLoaderSimple', { ckpt_name: '   ' }),
      '2': node('UNETLoader', { unet_name: ['model.safetensors', 0] }),
      '3': node('CheckpointLoaderSimple', { ckpt_name: 42 }),
      '4': node('UNETLoader', { unet_name: null }),
    };
    expect(readComfyUIMainModelNames(workflow)).toEqual([]);
  });

  it('writes the first main model name into modelMatch node string input', () => {
    const workflow: ComfyUIWorkflow = {
      '10': node('UNETLoader', { unet_name: 'krea2_turbo_int8_convrot.safetensors' }),
      '11': {
        class_type: 'RegexMatch',
        inputs: { string: '', regex_pattern: 'krea|k2' },
        _meta: { cosmosVision: { modelMatch: true } },
      },
    };

    applyModelMatch(workflow);

    expect(workflow['11'].inputs.string).toBe('krea2_turbo_int8_convrot.safetensors');
    expect(workflow['10'].inputs.unet_name).toBe('krea2_turbo_int8_convrot.safetensors');
  });

  it('writes an empty string when no main model exists', () => {
    const workflow: ComfyUIWorkflow = {
      '11': {
        class_type: 'RegexMatch',
        inputs: { string: 'stale' },
        _meta: { cosmosVision: { modelMatch: true } },
      },
    };

    applyModelMatch(workflow);

    expect(workflow['11'].inputs.string).toBe('');
  });

  it('leaves workflows without modelMatch nodes untouched', () => {
    const workflow: ComfyUIWorkflow = {
      '10': node('UNETLoader', { unet_name: 'a.safetensors' }),
      '11': node('RegexMatch', { string: 'keep me' }),
    };

    applyModelMatch(workflow);

    expect(workflow['11'].inputs.string).toBe('keep me');
  });
});

describe('comfyui isModelMatchManagedInput', () => {
  const modelMatchNode = {
    class_type: 'RegexMatch',
    inputs: { string: '', regex_pattern: 'krea|k2' },
    _meta: { cosmosVision: { modelMatch: true } },
  } satisfies ComfyUIWorkflow[string];

  it('hides the string input of a modelMatch node', () => {
    expect(isModelMatchManagedInput(modelMatchNode, 'string')).toBe(true);
  });

  it('keeps other inputs of a modelMatch node visible', () => {
    expect(isModelMatchManagedInput(modelMatchNode, 'regex_pattern')).toBe(false);
  });

  it('keeps plain nodes untouched', () => {
    expect(isModelMatchManagedInput(node('RegexMatch', { string: '' }), 'string')).toBe(false);
    expect(isModelMatchManagedInput(undefined, 'string')).toBe(false);
  });
});
