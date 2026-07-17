import '@sillytavern/lib/jszip.min';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * 从 NovelAI ZIP 响应中提取全部图片
 * 使用 ST 自带的 JSZip(public/lib/jszip.min.js)解析,兼容流式 data descriptor 写入模式
 * @param zipBlob 官方 `/ai/generate-image` 返回的 ZIP Blob
 * @returns 按压缩包顺序排列的图片
 */
export async function extractImages(zipBlob: Blob): Promise<Blob[]> {
  const zip = await JSZip.loadAsync(zipBlob);
  const entries = Object.values(zip.files).filter(file => !file.dir && isImageName(file.name));
  if (!entries.length) throw new Error('官方响应中没有找到图片');
  return Promise.all(entries.map(async entry => {
    const data = await entry.async('blob');
    return new Blob([data], { type: getImageType(entry.name) });
  }));
}

/**
 * 判断文件名是否为支持的图片格式
 * @param name 文件名
 * @returns 是否为图片
 */
function isImageName(name: string): boolean {
  return Object.keys(IMAGE_TYPES).some(ext => name.toLowerCase().endsWith(`.${ext}`));
}

/**
 * 根据文件名获取图片 MIME 类型
 * @param name 文件名
 * @returns MIME 类型
 */
function getImageType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? 'png';
  return IMAGE_TYPES[ext] ?? 'image/png';
}
