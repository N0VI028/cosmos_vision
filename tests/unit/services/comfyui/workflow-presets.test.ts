import { describe, expect, it } from 'vitest';
import {
  buildComfyUIWorkflowExportJson,
  findComfyUIWorkflowPreset,
  getActiveComfyUIWorkflowPreset,
  importComfyUIWorkflowPreset,
  toggleFavoriteNodeId,
} from '@/services/comfyui/workflow-presets';

describe('comfyui workflow-presets helper', () => {
  const presetsState = {
    activePresetId: 'w1',
    presets: [
      { id: 'w1', name: 'Preset 1', workflowJson: '{}', favoriteNodeIds: ['node-1'] },
      { id: 'w2', name: 'Preset 2', workflowJson: '{}', favoriteNodeIds: [] },
    ],
  };

  it('finds active workflow preset correctly', () => {
    const preset = getActiveComfyUIWorkflowPreset(presetsState);
    expect(preset.id).toBe('w1');
    expect(preset.name).toBe('Preset 1');
  });

  it('finds specific workflow preset by id', () => {
    const preset = findComfyUIWorkflowPreset(presetsState, 'w2');
    expect(preset?.id).toBe('w2');
  });

  it('toggles favorite node id state', () => {
    const added = toggleFavoriteNodeId(['node-1'], 'node-2', true);
    expect(added).toContain('node-2');

    const removed = toggleFavoriteNodeId(added, 'node-2', true);
    expect(removed).not.toContain('node-2');
  });

  it('imports workflow into a new active preset without overwriting the current preset', () => {
    const settings = {
      activePresetId: 'current',
      presets: [{ id: 'current', name: '当前预设', workflowJson: 'old-json', favoriteNodeIds: ['node-1'] }],
    };

    const preset = importComfyUIWorkflowPreset(settings, 'imported', 'flux-api.json', 'new-json');

    expect(preset).toMatchObject({ id: 'imported', name: 'flux-api', workflowJson: 'new-json', favoriteNodeIds: [] });
    expect(settings.activePresetId).toBe('imported');
    expect(settings.presets[0]).toMatchObject({ workflowJson: 'old-json', favoriteNodeIds: ['node-1'] });
  });

  it('builds formatted export json with 2 spaces indentation and equivalent content', () => {
    const rawWorkflow = {
      '1': {
        class_type: 'KSampler',
        inputs: {
          seed: 123456,
        },
      },
    };
    const preset = {
      id: 'p1',
      name: 'Test Workflow',
      workflowJson: JSON.stringify(rawWorkflow),
      favoriteNodeIds: [],
    };

    const exported = buildComfyUIWorkflowExportJson(preset);
    expect(exported).toBe(JSON.stringify(rawWorkflow, null, 2));
    expect(JSON.parse(exported)).toEqual(rawWorkflow);
  });

  it('throws error when building export json for invalid workflow json', () => {
    const invalidPresets = [
      { id: 'p2', name: 'Bad 1', workflowJson: '', favoriteNodeIds: [] },
      { id: 'p3', name: 'Bad 2', workflowJson: '{ invalid json', favoriteNodeIds: [] },
      { id: 'p4', name: 'Bad 3', workflowJson: '{}', favoriteNodeIds: [] },
      { id: 'p5', name: 'Bad 4', workflowJson: '[]', favoriteNodeIds: [] },
      { id: 'p6', name: 'Bad 5', workflowJson: JSON.stringify({ '1': { inputs: {} } }), favoriteNodeIds: [] },
    ];

    for (const preset of invalidPresets) {
      expect(() => buildComfyUIWorkflowExportJson(preset)).toThrow();
    }
  });
});
