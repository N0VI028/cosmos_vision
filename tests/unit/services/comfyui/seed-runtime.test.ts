import { beforeEach, describe, expect, it } from 'vitest';
import { applySeedModes, clearSeedRuntimeCounters } from '@/services/comfyui/seed-runtime';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

function makeWorkflow(mode: 'fixed' | 'randomize' | 'increment' | 'decrement', seed = 5): ComfyUIWorkflow {
  return {
    '3': {
      class_type: 'KSampler',
      inputs: { seed },
      _meta: { cosmosVision: { seedModes: { seed: mode } } },
    },
  };
}

describe('comfyui seed runtime', () => {
  beforeEach(() => {
    clearSeedRuntimeCounters();
  });

  it('keeps fixed seed', () => {
    const workflow = makeWorkflow('fixed', 42);
    const values = applySeedModes(workflow, 'fp');
    expect(values[0].value).toBe(42);
    expect(workflow['3'].inputs.seed).toBe(42);
  });

  it('randomizes seed within safe range', () => {
    const workflow = makeWorkflow('randomize', 1);
    const values = applySeedModes(workflow, 'fp');
    expect(values[0].value).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(values[0].value)).toBe(true);
  });

  it('increments and wraps', () => {
    const workflow = makeWorkflow('increment', 7);
    expect(applySeedModes(workflow, 'fp')[0].value).toBe(7);
    expect(applySeedModes(workflow, 'fp')[0].value).toBe(8);
  });

  it('decrements and wraps at zero', () => {
    const workflow = makeWorkflow('decrement', 0);
    expect(applySeedModes(workflow, 'fp')[0].value).toBe(0);
    const next = applySeedModes(workflow, 'fp')[0].value;
    expect(next).toBe(Number.MAX_SAFE_INTEGER);
  });
});
