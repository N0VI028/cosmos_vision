import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
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
});
