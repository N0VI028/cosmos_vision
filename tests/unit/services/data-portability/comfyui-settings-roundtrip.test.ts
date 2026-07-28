import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { buildPortableDataFile } from '@/services/data-portability/export';
import { applyDataImport, buildDataImportPreview } from '@/services/data-portability/import';

describe('comfyui settings data-portability roundtrip', () => {
  it('exports and imports comfyui settings section losslessly', async () => {
    const originalSettings = structuredClone(DEFAULT_SETTINGS);
    originalSettings.comfyui.url = 'http://127.0.0.1:8188';
    originalSettings.comfyui.workflowPresets.presets = [
      { id: 'w1', name: 'Custom Workflow', workflowJson: '{"1":{}}', favoriteNodeIds: [] },
    ];
    originalSettings.comfyui.workflowPresets.activePresetId = 'w1';

    const file = await buildPortableDataFile(originalSettings, false, ['comfyUISettings'], '1.0.0');
    const jsonText = JSON.stringify(file);

    const preview = buildDataImportPreview(jsonText);
    expect(preview.source).toBe('cosmos_vision');
    expect(preview.sections.map(s => s.id)).toContain('comfyUISettings');

    const importedSettings = structuredClone(DEFAULT_SETTINGS);
    const result = await applyDataImport(preview, ['comfyUISettings'], importedSettings);

    expect(result.imported).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.settings.comfyui.url).toBe('http://127.0.0.1:8188');
    expect(result.settings.comfyui.workflowPresets.presets[0].name).toBe('Custom Workflow');
    expect(result.settings.comfyui.workflowPresets.activePresetId).toBe('w1');
  });
});
