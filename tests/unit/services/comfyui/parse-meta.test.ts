import { describe, expect, it } from 'vitest';
import {
  getComfyUIWorkflowValidationError,
  normalizeComfyUIUrl,
  parseComfyUIWorkflow,
  serializeComfyUIWorkflow,
} from '@/services/comfyui/parse';
import {
  clearImageOutputNode,
  readImageBindings,
  readImageOutputNodeId,
  readNumberInput,
  readPromptBindings,
  readSeedModes,
  setImageBinding,
  setImageOutputNode,
  setPromptBinding,
  setSeedMode,
  stripCosmosVisionMeta,
  validateImageBindings,
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
    expect(() => parseComfyUIWorkflow('  ')).toThrow(/请先导入/);
    expect(() => parseComfyUIWorkflow('[]')).toThrow(/必须是 API 格式对象/);
  });

  it('normalizes comfyui url correctly', () => {
    expect(normalizeComfyUIUrl('http://127.0.0.1:8188/')).toBe('http://127.0.0.1:8188');
    expect(normalizeComfyUIUrl('http://localhost:8188///')).toBe('http://localhost:8188');
    expect(() => normalizeComfyUIUrl('')).toThrow(/请先填写/);
  });

  it('validates bindings and output on default-like workflow', () => {
    const json = serializeComfyUIWorkflow(sampleWorkflow);
    expect(getComfyUIWorkflowValidationError(json)).toBeNull();
  });
});

describe('comfyui meta', () => {
  it('reads bindings, seed modes, and unique output node', () => {
    expect(readPromptBindings(sampleWorkflow)).toEqual([
      { nodeId: '1', inputName: 'text', binding: 'positive' },
    ]);
    expect(readImageOutputNodeId(sampleWorkflow)).toBe('3');
  });

  it('sets unique output and manages seed mode', () => {
    const workflow = structuredClone(sampleWorkflow);
    setImageOutputNode(workflow, '1');
    expect(readImageOutputNodeId(workflow)).toBe('1');
    expect(workflow['3']._meta?.cosmosVision?.imageOutput).toBe(false);

    clearImageOutputNode(workflow);
    expect(readImageOutputNodeId(workflow)).toBeNull();

    setSeedMode(workflow, '2', 'seed', 'fixed');
    expect(readSeedModes(workflow)).toEqual([
      { nodeId: '2', inputName: 'seed', mode: 'fixed', value: 0 },
    ]);

    setSeedMode(workflow, '2', 'seed', null);
    expect(readSeedModes(workflow)).toHaveLength(0);
  });

  it('sets and reads image bindings and validates correctly', () => {
    const workflow = structuredClone(sampleWorkflow);
    workflow['4'] = {
      class_type: 'LoadImage',
      inputs: { image: 'test.png' },
    };
    setImageBinding(workflow, '4', 'image', 'character-avatar');
    expect(readImageBindings(workflow)).toEqual([
      { nodeId: '4', inputName: 'image', source: 'character-avatar' },
    ]);
    expect(validateImageBindings(workflow)).toBeNull();

    setImageBinding(workflow, '4', 'image', null);
    expect(readImageBindings(workflow)).toEqual([]);
  });

  it('validates missing binding and output node errors', () => {
    const workflow = structuredClone(sampleWorkflow);
    setPromptBinding(workflow, '1', 'text', null);
    expect(validatePromptBindings(workflow)).toMatch(/未指定/);

    delete workflow['3'];
    expect(validateImageOutput(workflow)).not.toBeNull();
  });

  it('reads numeric inputs with fallbacks', () => {
    expect(readNumberInput({ class_type: 'K', inputs: { seed: 123 } }, 'seed', 0)).toBe(123);
    expect(readNumberInput({ class_type: 'K', inputs: { seed: '456' } }, 'seed', 0)).toBe(456);
    expect(readNumberInput({ class_type: 'K', inputs: { seed: 'invalid' } }, 'seed', 99)).toBe(99);
  });

  it('strips private meta only', () => {
    const workflow = structuredClone(sampleWorkflow);
    setImageBinding(workflow, '1', 'image', 'user-avatar');
    stripCosmosVisionMeta(workflow);
    expect(workflow['1']._meta?.title).toBe('Positive');
    expect(workflow['1']._meta?.cosmosVision).toBeUndefined();
  });
});
