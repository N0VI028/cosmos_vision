import '@sillytavern/lib/jszip.min';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * 从 NovelAI ZIP 响应中提取第一张图片
 * 使用 ST 自带的 JSZip(public/lib/jszip.min.js)解析,兼容流式 data descriptor 写入模式
 * @param zipBlob 官方 `/ai/generate-image` 返回的 ZIP Blob
 * @returns 第一张图片 Blob
 */
export async function extractFirstImage(zipBlob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(zipBlob);
  const entry = Object.values(zip.files).find(file => !file.dir && isImageName(file.name));
  if (!entry) throw new Error('官方响应中没有找到图片');
  const data = await entry.async('blob');
  return new Blob([data], { type: getImageType(entry.name) });
}

function isImageName(name: string): boolean {
  return Object.keys(IMAGE_TYPES).some(ext => name.toLowerCase().endsWith(`.${ext}`));
}

function getImageType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? 'png';
  return IMAGE_TYPES[ext] ?? 'image/png';
}
