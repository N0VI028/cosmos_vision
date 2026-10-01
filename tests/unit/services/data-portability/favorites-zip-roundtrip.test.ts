import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';
import { downloadPortableDataFile } from '@/services/data-portability/export';
import { applyDataImport, buildDataImportPreviewFromFile } from '@/services/data-portability/import';
import {
  COSMOS_VISION_EXPORT_FORMAT,
  COSMOS_VISION_EXPORT_VERSION,
  COSMOS_VISION_EXPORT_VERSION_ZIP,
  type CosmosVisionExportFile,
} from '@/services/data-portability/types';
import { hasZipMagic, readPortableZipFile, writePortableZipFile } from '@/services/data-portability/zip-bundle';

const mocks = vi.hoisted(() => ({
  triggerBrowserDownload: vi.fn(),
  exportInlineImageFavoriteRecords: vi.fn(),
  importInlineImageFavoriteRecords: vi.fn(),
}));

vi.mock('@/services/browser-download', () => ({
  triggerBrowserDownload: mocks.triggerBrowserDownload,
}));

vi.mock('@/services/inline-image/favorites-cache', () => ({
  exportInlineImageFavoriteRecords: mocks.exportInlineImageFavoriteRecords,
  importInlineImageFavoriteRecords: mocks.importInlineImageFavoriteRecords,
}));

describe('favorites ZIP export and import roundtrip', () => {
  const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

  beforeEach(async () => {
    vi.clearAllMocks();
    const { default: JSZipMock } = await import('@sillytavern/lib/jszip.min');
    vi.stubGlobal('JSZip', JSZipMock);
  });

  it('A. exports ZIP file when favorites bundle is selected and non-empty', async () => {
    const sampleBlob = new Blob([sampleBytes], { type: 'image/png' });
    const mockRecord: InlineImageFavoriteListItem = {
      id: 3,
      characterKey: 'char-alice',
      chatId: 'chat-001',
      slotId: 'slot-alpha',
      imageBlob: sampleBlob,
      promptSnapshot: {
        positivePrompt: '1girl, smile',
        negativePrompt: 'lowres',
        params: { width: 512, height: 768 },
      },
      createdAt: 1700000000000,
    };
    mocks.exportInlineImageFavoriteRecords.mockResolvedValue([mockRecord]);

    await downloadPortableDataFile(DEFAULT_SETTINGS, false, ['inlineFavoritesBundle'], '0.1.0');

    expect(mocks.triggerBrowserDownload).toHaveBeenCalledTimes(1);
    const [downloadBlob, fileName] = mocks.triggerBrowserDownload.mock.calls[0] as [Blob, string];

    expect(fileName).toMatch(/^cosmos-vision-data-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(await hasZipMagic(downloadBlob)).toBe(true);

    const { manifest, readImage } = await readPortableZipFile(downloadBlob);
    expect(manifest.version).toBe(COSMOS_VISION_EXPORT_VERSION_ZIP);
    const bundle = manifest.payload.inlineFavoritesBundle as Array<Record<string, unknown>>;
    expect(bundle).toHaveLength(1);
    expect(bundle[0]?.imageRef).toBe('images/0001-3.png');
    expect(bundle[0]?.imageData).toBeUndefined();

    const extractedImage = await readImage('images/0001-3.png');
    expect(extractedImage).not.toBeNull();
    const extractedBytes = new Uint8Array(await (extractedImage as Blob).arrayBuffer());
    expect(extractedBytes).toEqual(sampleBytes);
  });

  it('B. exports JSON file when favorites bundle is empty', async () => {
    mocks.exportInlineImageFavoriteRecords.mockResolvedValue([]);

    await downloadPortableDataFile(DEFAULT_SETTINGS, false, ['inlineFavoritesBundle'], '0.1.0');

    expect(mocks.triggerBrowserDownload).toHaveBeenCalledTimes(1);
    const [downloadBlob, fileName] = mocks.triggerBrowserDownload.mock.calls[0] as [Blob, string];

    expect(fileName).toMatch(/^cosmos-vision-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await hasZipMagic(downloadBlob)).toBe(false);

    const text = await downloadBlob.text();
    const manifest = JSON.parse(text) as CosmosVisionExportFile;
    expect(manifest.version).toBe(COSMOS_VISION_EXPORT_VERSION);
    expect(manifest.payload.inlineFavoritesBundle).toEqual([]);
  });

  it('C. imports ZIP file and restores favorite records with binary fidelity', async () => {
    const sampleBlob = new Blob([sampleBytes], { type: 'image/png' });
    const manifest: CosmosVisionExportFile = {
      format: COSMOS_VISION_EXPORT_FORMAT,
      version: COSMOS_VISION_EXPORT_VERSION_ZIP,
      exportedAt: new Date().toISOString(),
      sections: ['inlineFavoritesBundle'],
      payload: {
        inlineFavoritesBundle: [
          {
            characterKey: 'char-bob',
            chatId: 'chat-002',
            slotId: 'slot-beta',
            imageRef: 'images/0001-77.png',
            imageType: 'image/png',
            promptSnapshot: { positivePrompt: 'cyberpunk city' },
            createdAt: 1710000000000,
          },
        ],
      },
    };
    const images = new Map<string, Blob>([['images/0001-77.png', sampleBlob]]);
    const zipBlob = await writePortableZipFile(manifest, images);
    const zipFile = new File([zipBlob], 'export.zip', { type: 'application/zip' });

    const preview = await buildDataImportPreviewFromFile(zipFile);
    expect(preview.source).toBe('cosmos_vision');
    expect(preview.sections.some(s => s.id === 'inlineFavoritesBundle')).toBe(true);

    mocks.importInlineImageFavoriteRecords.mockResolvedValue(1);
    const result = await applyDataImport(preview, ['inlineFavoritesBundle'], DEFAULT_SETTINGS);

    expect(result.failed).toBe(0);
    expect(result.imported).toBe(1);
    expect(mocks.importInlineImageFavoriteRecords).toHaveBeenCalledTimes(1);

    const importedRecords = mocks.importInlineImageFavoriteRecords.mock.calls[0]?.[0] as InlineImageFavoriteListItem[];
    expect(importedRecords).toHaveLength(1);
    expect(importedRecords[0]?.characterKey).toBe('char-bob');
    expect(importedRecords[0]?.slotId).toBe('slot-beta');
    // 真实 JSZip 解包 Blob 无 MIME，导入侧须按记录 imageType 补齐
    expect(importedRecords[0]?.imageBlob.type).toBe('image/png');
    const importedBytes = new Uint8Array(await importedRecords[0]!.imageBlob.arrayBuffer());
    expect(importedBytes).toEqual(sampleBytes);
  });

  it('D. supports backward compatibility with v1 single-JSON export', async () => {
    const base64Data = 'data:image/png;base64,AQIDBA==';
    const v1File: CosmosVisionExportFile = {
      format: COSMOS_VISION_EXPORT_FORMAT,
      version: COSMOS_VISION_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sections: ['inlineFavoritesBundle'],
      payload: {
        inlineFavoritesBundle: [
          {
            characterKey: 'char-old',
            chatId: 'chat-old',
            slotId: 'slot-old',
            imageData: base64Data,
            imageType: 'image/png',
            promptSnapshot: {},
            createdAt: 1600000000000,
          },
        ],
      },
    };
    const jsonFile = new File([JSON.stringify(v1File)], 'v1-data.json', { type: 'application/json' });

    const preview = await buildDataImportPreviewFromFile(jsonFile);
    expect(preview.source).toBe('cosmos_vision');
    expect(preview.sections.some(s => s.id === 'inlineFavoritesBundle')).toBe(true);

    mocks.importInlineImageFavoriteRecords.mockResolvedValue(1);
    const result = await applyDataImport(preview, ['inlineFavoritesBundle'], DEFAULT_SETTINGS);

    expect(result.failed).toBe(0);
    expect(result.imported).toBe(1);
    const importedRecords = mocks.importInlineImageFavoriteRecords.mock.calls[0]?.[0] as InlineImageFavoriteListItem[];
    expect(importedRecords).toHaveLength(1);
    const restoredBytes = new Uint8Array(await importedRecords[0]!.imageBlob.arrayBuffer());
    expect(restoredBytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('E. handles missing image entries gracefully without uncaught exceptions', async () => {
    const manifest: CosmosVisionExportFile = {
      format: COSMOS_VISION_EXPORT_FORMAT,
      version: COSMOS_VISION_EXPORT_VERSION_ZIP,
      exportedAt: new Date().toISOString(),
      sections: ['inlineFavoritesBundle'],
      payload: {
        inlineFavoritesBundle: [
          {
            characterKey: 'char-broken',
            chatId: 'chat-broken',
            slotId: 'slot-broken',
            imageRef: 'images/missing-image.png',
            imageType: 'image/png',
            promptSnapshot: {},
            createdAt: 1720000000000,
          },
        ],
      },
    };
    const brokenZipBlob = await writePortableZipFile(manifest, new Map());
    const brokenZipFile = new File([brokenZipBlob], 'broken.zip', { type: 'application/zip' });

    const preview = await buildDataImportPreviewFromFile(brokenZipFile);
    expect(preview.sections.some(s => s.id === 'inlineFavoritesBundle')).toBe(true);

    const result = await applyDataImport(preview, ['inlineFavoritesBundle'], DEFAULT_SETTINGS);

    expect(result.failed).toBe(1);
    expect(result.warnings.some(w => w.includes('缺少图片文件: images/missing-image.png'))).toBe(true);
    expect(mocks.importInlineImageFavoriteRecords).not.toHaveBeenCalled();
  });
});
