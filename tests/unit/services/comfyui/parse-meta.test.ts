import { describe, expect, it } from 'vitest';
import {
  getComfyUIWorkflowValidationError,
  isLinkRef,
  isWritableScalar,
  parseComfyUIWorkflow,
  serializeComfyUIWorkflow,
} from '@/services/comfyui/parse';
import {
  readImageOutputNodeId,
  readPromptBindings,
  setImageOutputNode,
  setPromptBinding,
  stripCosmosVisionMeta,
  validateImageOutput,
  validatePromptBindings,
} from '@/services/comfyui/meta';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

const sampleWorkflow: ComfyUIWorkflow = {
  '1': {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'a', clip: ['2', 0] },
    _meta: {
      title: 'Positive',
      cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: false },
    },
  },
  '2': {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: 'model.safetensors' },
  },
  '3': {
    class_type: 'PreviewImage',
    inputs: { images: ['2', 0] },
    _meta: { cosmosVision: { imageOutput: true } },
  },
};

describe('comfyui parse', () => {
  it('parses and serializes workflow json', () => {
    const json = serializeComfyUIWorkflow(sampleWorkflow);
    const parsed = parseComfyUIWorkflow(json);
    expect(parsed['1'].class_type).toBe('CLIPTextEncode');
    expect(json.includes('  ')).toBe(true);
  });

  it('rejects bad json and empty object', () => {
    expect(() => parseComfyUIWorkflow('{')).toThrow(/解析失败/);
    expect(() => parseComfyUIWorkflow('{}')).toThrow(/空对象/);
  });

  it('distinguishes link refs from ordinary arrays', () => {
    expect(isLinkRef(['1', 0])).toBe(true);
    expect(isLinkRef([1, 2, 3])).toBe(false);
    expect(isWritableScalar('text')).toBe(true);
    expect(isWritableScalar(['1', 0])).toBe(false);
  });

  it('validates bindings and output on default-like workflow', () => {
    const json = serializeComfyUIWorkflow(sampleWorkflow);
    expect(getComfyUIWorkflowValidationError(json)).toBeNull();
  });
});

describe('comfyui meta', () => {
  it('reads bindings and unique output node', () => {
    expect(readPromptBindings(sampleWorkflow)).toEqual([
      { nodeId: '1', inputName: 'text', binding: 'positive' },
    ]);
    expect(readImageOutputNodeId(sampleWorkflow)).toBe('3');
  });

  it('sets unique output and validates missing binding', () => {
    const workflow = structuredClone(sampleWorkflow);
    setImageOutputNode(workflow, '1');
    expect(readImageOutputNodeId(workflow)).toBe('1');
    expect(workflow['3']._meta?.cosmosVision?.imageOutput).toBe(false);

    setPromptBinding(workflow, '1', 'text', null);
    expect(validatePromptBindings(workflow)).toMatch(/未指定/);
    expect(validateImageOutput(workflow)).toBeNull();
  });

  it('strips private meta only', () => {
    const workflow = structuredClone(sampleWorkflow);
    stripCosmosVisionMeta(workflow);
    expect(workflow['1']._meta?.title).toBe('Positive');
    expect(workflow['1']._meta?.cosmosVision).toBeUndefined();
  });
});
