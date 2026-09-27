import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { CosmosVisionSettings } from '@/constants/novelai';
import { buildPortableDataFile } from '@/services/data-portability/export';
import { applyDataImport, buildDataImportPreview } from '@/services/data-portability/import';
import type { DataPortabilitySectionId } from '@/services/data-portability/sections';

/**
 * 导出并重新导入指定 section，返回导入结果设置
 * @param original 导出源设置
 * @param target 导入目标设置
 * @param sections 参与往返的 section
 * @returns 导入结果设置
 */
async function roundtrip(
  original: CosmosVisionSettings,
  target: CosmosVisionSettings,
  sections: readonly DataPortabilitySectionId[],
): Promise<CosmosVisionSettings> {
  const file = await buildPortableDataFile(original, false, sections, '1.0.0');
  const preview = buildDataImportPreview(JSON.stringify(file));
  const result = await applyDataImport(preview, sections, target);
  expect(result.failed).toBe(0);
  return result.settings;
}

/**
 * 在目标设置上写入本地独有的 ComfyUI 预设，用于验证导入不越界
 * @param settings 目标设置
 */
function seedLocalComfyUIPresets(settings: CosmosVisionSettings): void {
  settings.comfyui.workflowPresets = {
    activePresetId: 'local-w',
    presets: [{ id: 'local-w', name: 'Local Workflow', workflowJson: '{"9":{}}', favoriteNodeIds: ['9'] }],
  };
  settings.comfyui.loraPresets = {
    activePresetId: 'local-l',
    presets: [{ id: 'local-l', name: 'Local LoRA', loras: [{ id: 'el', name: 'local.safetensors', strength: 0.5, enabled: true }] }],
  };
}

describe('comfyui settings data-portability roundtrip', () => {
  it('exports and imports comfyui settings section losslessly', async () => {
    const originalSettings = structuredClone(DEFAULT_SETTINGS);
    originalSettings.comfyui.url = 'http://127.0.0.1:8188';
    originalSettings.comfyui.workflowPresets.presets = [
      { id: 'w1', name: 'Custom Workflow', workflowJson: '{"1":{}}', favoriteNodeIds: [] },
    ];
    originalSettings.comfyui.workflowPresets.activePresetId = 'w1';
    originalSettings.comfyui.loraPresets.presets = [
      {
        id: 'l1',
        name: 'LoRA 组',
        loras: [{ id: 'e1', name: 'a.safetensors', strength: 0.8, enabled: true }],
      },
    ];
    originalSettings.comfyui.loraPresets.activePresetId = 'l1';

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
    expect(result.settings.comfyui.loraPresets.presets[0]!.loras[0]!.name).toBe('a.safetensors');
  });

  it('labels the legacy comfyui settings section for import preview', async () => {
    const file = await buildPortableDataFile(structuredClone(DEFAULT_SETTINGS), false, ['comfyUISettings'], '1.0.0');

    const preview = buildDataImportPreview(JSON.stringify(file));
    const legacySection = preview.sections.find(section => section.id === 'comfyUISettings');

    expect(legacySection?.label).toBe('ComfyUI 配置（旧版）');
  });

  it('exports and imports only comfyui basic settings', async () => {
    const originalSettings = structuredClone(DEFAULT_SETTINGS);
    originalSettings.comfyui.url = 'http://192.168.1.10:8188';
    originalSettings.comfyui.timeout = 120;
    originalSettings.comfyui.positivePromptPresetId = 'custom-positive';
    originalSettings.comfyui.negativePromptPresetId = 'custom-negative';

    const targetSettings = structuredClone(DEFAULT_SETTINGS);
    seedLocalComfyUIPresets(targetSettings);
    const settings = await roundtrip(originalSettings, targetSettings, ['comfyUIBasicSettings']);

    expect(settings.comfyui.url).toBe('http://192.168.1.10:8188');
    expect(settings.comfyui.timeout).toBe(120);
    expect(settings.comfyui.positivePromptPresetId).toBe('custom-positive');
    expect(settings.comfyui.negativePromptPresetId).toBe('custom-negative');
    expect(settings.comfyui.workflowPresets.activePresetId).toBe('local-w');
    expect(settings.comfyui.loraPresets.activePresetId).toBe('local-l');
  });

  it('exports and imports only comfyui workflow presets', async () => {
    const originalSettings = structuredClone(DEFAULT_SETTINGS);
    originalSettings.comfyui.url = 'http://10.0.0.2:8188';
    originalSettings.comfyui.workflowPresets = {
      activePresetId: 'w2',
      presets: [
        { id: 'w1', name: 'First Workflow', workflowJson: '{"1":{}}', favoriteNodeIds: ['1'] },
        { id: 'w2', name: 'Second Workflow', workflowJson: '{"2":{}}', favoriteNodeIds: ['2'] },
      ],
    };

    const targetSettings = structuredClone(DEFAULT_SETTINGS);
    seedLocalComfyUIPresets(targetSettings);
    const settings = await roundtrip(originalSettings, targetSettings, ['comfyUIWorkflowPresets']);

    expect(settings.comfyui.workflowPresets.activePresetId).toBe('w2');
    expect(settings.comfyui.workflowPresets.presets.map(preset => preset.name)).toEqual(['First Workflow', 'Second Workflow']);
    expect(settings.comfyui.workflowPresets.presets[1]!.favoriteNodeIds).toEqual(['2']);
    expect(settings.comfyui.url).toBe(DEFAULT_SETTINGS.comfyui.url);
    expect(settings.comfyui.loraPresets.activePresetId).toBe('local-l');
  });

  it('exports and imports only comfyui lora presets', async () => {
    const originalSettings = structuredClone(DEFAULT_SETTINGS);
    originalSettings.comfyui.loraPresets = {
      activePresetId: 'l2',
      presets: [
        {
          id: 'l2',
          name: 'LoRA 组 A',
          loras: [
            { id: 'e1', name: 'a.safetensors', strength: 0.8, enabled: true },
            { id: 'e2', name: 'b.safetensors', strength: 0.3, enabled: false },
          ],
        },
      ],
    };

    const targetSettings = structuredClone(DEFAULT_SETTINGS);
    seedLocalComfyUIPresets(targetSettings);
    const settings = await roundtrip(originalSettings, targetSettings, ['comfyUILoraPresets']);

    expect(settings.comfyui.loraPresets.activePresetId).toBe('l2');
    expect(settings.comfyui.loraPresets.presets[0]!.name).toBe('LoRA 组 A');
    expect(settings.comfyui.loraPresets.presets[0]!.loras.map(lora => lora.name)).toEqual(['a.safetensors', 'b.safetensors']);
    expect(settings.comfyui.url).toBe(DEFAULT_SETTINGS.comfyui.url);
    expect(settings.comfyui.workflowPresets.activePresetId).toBe('local-w');
  });
});
