import { describe, expect, it } from 'vitest';
import {
  listOutputCandidates,
  mapInputControls,
  normalizeObjectInfo,
} from '@/services/comfyui/object-info';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

const workflow: ComfyUIWorkflow = {
  '1': {
    class_type: 'KSampler',
    inputs: {
      seed: 1,
      steps: 20,
      sampler_name: 'euler',
      text: 'hello',
      enabled: true,
      model: ['2', 0],
      payload: { a: 1 },
    },
    _meta: {
      cosmosVision: {
        promptBindings: { text: 'positive' },
        seedModes: { seed: 'randomize' },
      },
    },
  },
  '2': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } },
  '3': { class_type: 'Other', inputs: {} },
};

describe('comfyui object-info mapping', () => {
  it('maps online schema controls and seed flags', () => {
    const objectInfo = normalizeObjectInfo({
      KSampler: {
        category: 'sampling',
        output_node: false,
        input: {
          required: {
            seed: ['INT', { control_after_generate: true, min: 0, max: 10, step: 1 }],
            steps: ['INT', { min: 1, max: 50 }],
            sampler_name: [['euler', 'heun'], {}],
            text: ['STRING', { multiline: true }],
            enabled: ['BOOLEAN', {}],
            model: ['MODEL', {}],
          },
        },
      },
      PreviewImage: {
        category: 'image',
        output_node: true,
        input: { required: { images: ['IMAGE', {}] } },
      },
    });

    const controls = mapInputControls(workflow, '1', objectInfo);
    expect(controls.find(item => item.inputName === 'model')?.kind).toBe('link');
    expect(controls.find(item => item.inputName === 'sampler_name')?.kind).toBe('select');
    expect(controls.find(item => item.inputName === 'seed')?.controlAfterGenerate).toBe(true);
    expect(controls.find(item => item.inputName === 'text')?.kind).toBe('textarea');
    expect(controls.find(item => item.inputName === 'enabled')?.kind).toBe('boolean');
    expect(controls.find(item => item.inputName === 'payload')?.kind).toBe('json');
    expect(listOutputCandidates(workflow, objectInfo)).toEqual(['2']);
  });

  it('falls back offline to all nodes and basic kinds', () => {
    const controls = mapInputControls(workflow, '1', null);
    expect(controls.find(item => item.inputName === 'steps')?.kind).toBe('number');
    expect(listOutputCandidates(workflow, null)).toEqual(['1', '2', '3']);
  });

  it('keeps online output candidates empty when no schema output matches', () => {
    const objectInfo = normalizeObjectInfo({
      SaveImage: {
        category: 'image',
        output_node: true,
        input: { required: { images: ['IMAGE', {}] } },
      },
    });
    expect(listOutputCandidates(workflow, objectInfo)).toEqual([]);
  });
});
