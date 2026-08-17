import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadableImageStreamItem } from '@/services/inline-image/favorites-download';
import type { InlineImageDownloadOptions } from '@/services/inline-image/download-options';

const mocks = vi.hoisted(() => ({
  transformInlineImageForDownload: vi.fn(),
  downloadInlineImageBlob: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

vi.mock('@/services/inline-image/image-download-transform', () => ({
  transformInlineImageForDownload: mocks.transformInlineImageForDownload,
  downloadInlineImageBlob: mocks.downloadInlineImageBlob,
  triggerBrowserDownload: mocks.triggerBrowserDownload,
}));

const downloadOptions = {} as InlineImageDownloadOptions;

/** 构造流式下载项 */
function streamItem(loadBlob: () => Promise<Blob>): DownloadableImageStreamItem {
  return { loadBlob, createdAt: 1 };
}

/** 动态加载被测模块（需先注入 JSZip 全局替身） */
async function importDownloadModule() {
  const { default: JSZipMock } = await import('@sillytavern/lib/jszip.min');
  vi.stubGlobal('JSZip', JSZipMock);
  return import('@/services/inline-image/favorites-download');
}

describe('downloadInlineImageStreamItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transformInlineImageForDownload.mockImplementation(async (blob: Blob) => ({ blob, extension: 'png' }));
  });

  it('空列表直接返回零计数', async () => {
    const { downloadInlineImageStreamItems } = await importDownloadModule();
    const result = await downloadInlineImageStreamItems([], downloadOptions);
    expect(result).toEqual({ succeededCount: 0, failedCount: 0 });
    expect(mocks.triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it('单张成功直接下载并返回成功计数', async () => {
    const { downloadInlineImageStreamItems } = await importDownloadModule();
    const blob = new Blob(['single']);

    const result = await downloadInlineImageStreamItems(
      [streamItem(() => Promise.resolve(blob))],
      downloadOptions,
    );

    expect(result).toEqual({ succeededCount: 1, failedCount: 0 });
    expect(mocks.downloadInlineImageBlob).toHaveBeenCalledWith(blob, expect.any(String), downloadOptions);
  });

  it('ZIP 部分失败跳过并计数，仍导出成功项', async () => {
    const { downloadInlineImageStreamItems } = await importDownloadModule();
    const items = [
      streamItem(() => Promise.resolve(new Blob(['a']))),
      streamItem(() => Promise.reject(new Error('missing'))),
      streamItem(() => Promise.resolve(new Blob(['c']))),
    ];

    const result = await downloadInlineImageStreamItems(items, downloadOptions, 'archive.zip');

    expect(result).toEqual({ succeededCount: 2, failedCount: 1 });
    expect(mocks.triggerBrowserDownload).toHaveBeenCalledTimes(1);
  });

  it('全部失败时抛错且不触发下载', async () => {
    const { downloadInlineImageStreamItems } = await importDownloadModule();
    const items = [
      streamItem(() => Promise.reject(new Error('missing-a'))),
      streamItem(() => Promise.reject(new Error('missing-b'))),
    ];

    await expect(downloadInlineImageStreamItems(items, downloadOptions)).rejects.toThrow('没有可成功导出的图片');
    expect(mocks.triggerBrowserDownload).not.toHaveBeenCalled();
  });
});
