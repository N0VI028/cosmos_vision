import '@sillytavern/lib/jszip.min';

import type { InlineImageFavoriteRecord } from '@/services/inline-image/favorites-cache';
import {
  COSMOS_VISION_EXPORT_FORMAT,
  COSMOS_VISION_EXPORT_VERSION_ZIP,
  type CosmosVisionExportFile,
  type PortableInlineFavoriteRecord,
} from '@/services/data-portability/types';

interface ZipArchiveEntry {
  name: string;
  dir: boolean;
  async(type: 'blob' | 'string'): Promise<unknown>;
}

interface ZipArchiveInstance {
  files: Record<string, ZipArchiveEntry>;
  file(name: string, data?: unknown): this | ZipArchiveEntry | null;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface ZipConstructor {
  new (): ZipArchiveInstance;
  loadAsync(data: unknown): Promise<ZipArchiveInstance>;
}

/**
 * 安全获取全局 JSZip 构造器
 * @returns JSZip 构造器
 */
function getJSZipConstructor(): ZipConstructor {
  const ctor = (globalThis as unknown as Record<string, unknown>).JSZip as ZipConstructor | undefined;
  if (!ctor) throw new Error('JSZip 未加载');
  return ctor;
}

/** ZIP 读取器包装对象 */
export interface PortableZipBundleReader {
  manifest: CosmosVisionExportFile;
  readImage: (name: string) => Promise<Blob | null>;
}

/**
 * 检查 Blob 是否包含 ZIP 文件的魔数（PK\x03\x04）
 * @param blob 输入的 Blob 数据
 * @returns 是否包含 ZIP 魔数
 */
export async function hasZipMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 4) return false;
  const buffer = await blob.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * 将导出清单与图片资源打包为 ZIP Blob
 * @param manifest 导出文件清单数据
 * @param images 图片文件路径与 Blob 的映射
 * @returns 打包后的 ZIP Blob
 */
export async function writePortableZipFile(
  manifest: CosmosVisionExportFile,
  images: ReadonlyMap<string, Blob>,
): Promise<Blob> {
  const ZipClass = getJSZipConstructor();
  const zip = new ZipClass();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  for (const [name, blob] of images.entries()) {
    zip.file(name, blob);
  }
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * 解析 ZIP 导出的数据包
 * @param blob ZIP 文件数据
 * @returns 包含清单与图片提取函数的读取器
 */
export async function readPortableZipFile(blob: Blob): Promise<PortableZipBundleReader> {
  const ZipClass = getJSZipConstructor();
  const zip = await ZipClass.loadAsync(blob);
  const manifest = await extractManifest(zip);
  return {
    manifest,
    readImage: async (name: string): Promise<Blob | null> => {
      const entry = zip.file(name);
      if (!entry || typeof (entry as ZipArchiveEntry).async !== 'function') return null;
      const data = await (entry as ZipArchiveEntry).async('blob');
      return data instanceof Blob ? data : new Blob([data as BlobPart]);
    },
  };
}

/**
 * 从 ZIP 压缩包中提取并校验 manifest.json
 * @param zip ZIP 实例
 * @returns 校验通过的清单数据
 */
async function extractManifest(zip: ZipArchiveInstance): Promise<CosmosVisionExportFile> {
  const entry = zip.file('manifest.json');
  if (!entry || typeof (entry as ZipArchiveEntry).async !== 'function') {
    throw new Error('未识别的导入文件格式');
  }
  try {
    const text = (await (entry as ZipArchiveEntry).async('string')) as string;
    const parsed = JSON.parse(text) as unknown;
    if (!isZipManifest(parsed)) throw new Error('未识别的导入文件格式');
    return parsed;
  } catch {
    throw new Error('未识别的导入文件格式');
  }
}

/**
 * 校验对象是否为合法的 v2 ZIP 清单
 * @param value 外部解析值
 * @returns 是否匹配
 */
function isZipManifest(value: unknown): value is CosmosVisionExportFile {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.format === COSMOS_VISION_EXPORT_FORMAT && record.version === COSMOS_VISION_EXPORT_VERSION_ZIP;
}

/**
 * 判断是否为有效的收藏图片记录载荷（支持 Base64 或 imageRef 引用）
 * @param value 外部值
 * @returns 是否匹配
 */
export function isPortableFavoriteRecord(value: unknown): value is PortableInlineFavoriteRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const hasImage = typeof record.imageData === 'string' || (typeof record.imageRef === 'string' && record.imageRef.length > 0);
  return (
    hasImage &&
    typeof record.characterKey === 'string' &&
    typeof record.chatId === 'string' &&
    typeof record.slotId === 'string' &&
    record.slotId.length > 0
  );
}

/**
 * 转换收藏图片记录数组为 IndexedDB 实体
 * @param payload 外部收藏载荷
 * @param zipImageReader 可选 ZIP 图片读取器
 * @returns 还原后的收藏实体列表
 */
export async function toInlineFavoriteRecords(
  payload: unknown,
  zipImageReader?: (imageRef: string) => Promise<Blob | null>,
): Promise<InlineImageFavoriteRecord[]> {
  const list = Array.isArray(payload) ? payload : [];
  const records = list.filter(isPortableFavoriteRecord);
  return Promise.all(records.map(record => toInlineFavoriteRecord(record, zipImageReader)));
}

/**
 * 转换单条收藏记录为 IndexedDB 实体
 * @param record 收藏记录数据
 * @param zipImageReader 可选 ZIP 图片读取器
 * @returns IndexedDB 收藏实体
 */
async function toInlineFavoriteRecord(
  record: PortableInlineFavoriteRecord,
  zipImageReader?: (imageRef: string) => Promise<Blob | null>,
): Promise<InlineImageFavoriteRecord> {
  const imageBlob = await resolveFavoriteRecordBlob(record, zipImageReader);
  return {
    characterKey: record.characterKey,
    chatId: record.chatId,
    slotId: record.slotId,
    imageBlob,
    promptSnapshot: _.cloneDeep(record.promptSnapshot),
    createdAt: record.createdAt,
  };
}

/**
 * 解析单条收藏记录所引用的图片 Blob
 * @param record 收藏记录数据
 * @param zipImageReader 可选 ZIP 图片读取器
 * @returns 图片 Blob
 */
async function resolveFavoriteRecordBlob(
  record: PortableInlineFavoriteRecord,
  zipImageReader?: (imageRef: string) => Promise<Blob | null>,
): Promise<Blob> {
  if (typeof record.imageRef === 'string' && record.imageRef.length > 0) {
    const blob = zipImageReader ? await zipImageReader(record.imageRef) : null;
    if (!blob) throw new Error(`缺少图片文件: ${record.imageRef}`);
    // 真实 JSZip 解包出的 Blob 不带 MIME，用记录里的 imageType 补齐，保证服务端落盘扩展名正确
    return blob.type ? blob : new Blob([blob], { type: record.imageType || 'image/png' });
  }
  return dataUrlToBlob(record.imageData ?? '', record.imageType);
}

/**
 * 将 Base64 data URL 解析还原为 Blob
 * @param dataUrl 数据 URL
 * @param fallbackType 兜底 MIME 类型
 * @returns 还原出的 Blob
 */
function dataUrlToBlob(dataUrl: string, fallbackType: string): Blob {
  const [header = '', base64 = ''] = dataUrl.split(',', 2);
  const mime = header.match(/^data:([^;]+);base64$/)?.[1] ?? fallbackType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
