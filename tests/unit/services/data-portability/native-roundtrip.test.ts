import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { createRandomPresetPool } from '@/constants/random-preset-pool';
import { buildPortableDataFile } from '@/services/data-portability/export';
import { applyDataImport, buildDataImportPreview } from '@/services/data-portability/import';

describe('native data portability roundtrip', () => {
  it('exports and imports all native sections seamlessly', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.novelai.accounts = [
      { id: 'acc-1', name: 'Primary Account', url: 'https://api.novelai.net', apiKey: 'test-key', enabled: true },
    ];
    settings.imagePromptPresets.positive[0].text = 'masterpiece, detailed';

    const sections = ['novelAISettings', 'novelAISecrets', 'imagePromptPresets'] as const;
    const file = await buildPortableDataFile(settings, true, sections, '0.1.0');
    const json = JSON.stringify(file);

    const preview = buildDataImportPreview(json);
    expect(preview.source).toBe('cosmos_vision');
    expect(preview.sections.map(s => s.id)).toEqual(['novelAISettings', 'novelAISecrets', 'imagePromptPresets']);

    const targetSettings = structuredClone(DEFAULT_SETTINGS);
    const result = await applyDataImport(preview, ['novelAISettings', 'novelAISecrets', 'imagePromptPresets'], targetSettings);

    expect(result.imported).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.settings.novelai.accounts[0].name).toBe('Primary Account');
    expect(result.settings.imagePromptPresets.positive[0].text).toBe('masterpiece, detailed');
  });

  it('rejects invalid or corrupted JSON data', () => {
    expect(() => buildDataImportPreview('{ bad json')).toThrow();
    expect(() => buildDataImportPreview('{"format":"unknown"}')).toThrow(/未识别的导入文件格式/);
  });

  it('exports and imports random preset pools by id merge', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.randomPresetPools.enabled = false;
    settings.randomPresetPools.pools = [
      createRandomPresetPool('pool-1', { name: '画师池', presetIds: ['P1', 'P2'] }),
      createRandomPresetPool('pool-2', { side: 'negative', triggerMode: 'workflow', triggerWorkflowIds: ['wf-1'], presetIds: ['N1'] }),
    ];
    const file = await buildPortableDataFile(settings, true, ['randomPresetPools'], '0.1.0');

    const preview = buildDataImportPreview(JSON.stringify(file));
    expect(preview.sections.map(s => s.id)).toEqual(['randomPresetPools']);
    expect(preview.sections[0]!.count).toBe(2);

    const targetSettings = structuredClone(DEFAULT_SETTINGS);
    targetSettings.randomPresetPools.pools = [createRandomPresetPool('pool-1', { name: '本地旧池' })];
    const result = await applyDataImport(preview, ['randomPresetPools'], targetSettings);

    expect(result.failed).toBe(0);
    expect(result.imported).toBe(2);
    // 总开关随导出传播，导入后保留关闭状态
    expect(result.settings.randomPresetPools.enabled).toBe(false);
    // 相同 id 覆盖（本地旧池被导入项覆盖），导入独有追加
    expect(result.settings.randomPresetPools.pools).toHaveLength(2);
    expect(result.settings.randomPresetPools.pools.find(pool => pool.id === 'pool-1')?.presetIds).toEqual(['P1', 'P2']);
    expect(result.settings.randomPresetPools.pools.find(pool => pool.id === 'pool-2')?.triggerWorkflowIds).toEqual(['wf-1']);
  });
});
