import type { NovelAIModel } from '@/constants/novelai';
import { stripDataUrlBase64 } from '@/services/novelai/vibe-file';
import { sha256Text } from '@/services/novelai/vibe-shared';
import type { NovelAIVibeDownloadPayload } from '@/services/novelai/vibe-types';

const OFFICIAL_VIBE_IDENTIFIER = 'novelai-vibe-transfer';
const OFFICIAL_THUMBNAIL_MAX_SIZE = 256;
const OFFICIAL_THUMBNAIL_QUALITY = 0.8;

interface OfficialVibeFile {
  identifier: string;
  version: 1;
  type: 'image';
  image: string;
  id: string;
  encodings: Record<string, Record<string, { encoding: string; params: { information_extracted: number } }>>;
  name: string;
  thumbnail: string;
  createdAt: number;
  importInfo: {
    model: NovelAIModel;
    information_extracted: number;
    strength: number;
  };
}

const OFFICIAL_MODEL_KEY_MAP: Record<NovelAIModel, string> = {
  'nai-diffusion-5-curated': '',
  'nai-diffusion-5-full': '',
  'nai-diffusion-4-5-curated': 'v4-5curated',
  'nai-diffusion-4-5-full': 'v4-5full',
  'nai-diffusion-4-curated-preview': 'v4curated',
  'nai-diffusion-4-full': 'v4full',
  'nai-diffusion-3': '',
  'nai-diffusion-furry-3': '',
};

/**
 * 生成官网可导入的 .naiv4vibe 文件
 * @param payload 当前要导出的 vibe 数据
 * @returns 官网文件 Blob 与文件名
 */
export async function generateOfficialNovelAIVibeFile(
  payload: NovelAIVibeDownloadPayload,
): Promise<{ blob: Blob; fileName: string }> {
  assertOfficialVibeExportable(payload);
  const imageBase64 = stripDataUrlBase64(payload.imageData);
  const imageId = await sha256Text(imageBase64);
  const thumbnail = await generateOfficialThumbnail(payload.imageData);
  const cacheSecretKey = await createOfficialCacheSecretKey(payload, imageId);
  const file = buildOfficialVibeFile(payload, imageId, thumbnail, imageBase64, cacheSecretKey);
  return {
    blob: new Blob([JSON.stringify(file)], { type: 'application/json' }),
    fileName: `${file.name}.naiv4vibe`,
  };
}

/**
 * 校验当前缓存是否具备官网导出条件
 * @param payload 当前要导出的 vibe 数据
 */
function assertOfficialVibeExportable(payload: NovelAIVibeDownloadPayload): asserts payload is NovelAIVibeDownloadPayload & {
  imageData: string;
} {
  if (!payload.imageData) throw new Error('当前 vibe 缺少原图，无法导出官网格式，请重新上传图片后再试');
  if (!OFFICIAL_MODEL_KEY_MAP[payload.model]) throw new Error('当前模型不支持导出官网 Vibe 文件，请切换到 V4 或 V4.5 模型后重新解析');
}

/**
 * 生成官网文件对象
 * @param payload 当前要导出的 vibe 数据
 * @param imageId 官网规则生成的图片 ID
 * @param thumbnail 官网缩略图
 * @param imageBase64 原图纯 base64
 * @returns 官网文件对象
 */
function buildOfficialVibeFile(
  payload: NovelAIVibeDownloadPayload & { imageData: string },
  imageId: string,
  thumbnail: string,
  imageBase64: string,
  cacheSecretKey: string,
): OfficialVibeFile {
  const modelKey = OFFICIAL_MODEL_KEY_MAP[payload.model];
  return {
    identifier: OFFICIAL_VIBE_IDENTIFIER,
    version: 1,
    type: 'image',
    image: imageBase64,
    id: imageId,
    encodings: buildOfficialEncodings(payload, modelKey, cacheSecretKey),
    name: buildOfficialVibeName(imageId),
    thumbnail,
    createdAt: Date.now(),
    importInfo: buildOfficialImportInfo(payload),
  };
}

/**
 * 构建官网 encodings 节点
 * @param payload 当前要导出的 vibe 数据
 * @param modelKey 官网模型短 key
 * @returns encodings 节点
 */
function buildOfficialEncodings(
  payload: NovelAIVibeDownloadPayload,
  modelKey: string,
  cacheSecretKey: string,
): OfficialVibeFile['encodings'] {
  return {
    [modelKey]: {
      [cacheSecretKey]: {
        encoding: payload.encodedData,
        params: { information_extracted: payload.informationExtracted },
      },
    },
  };
}

/**
 * 构建官网 importInfo 节点
 * @param payload 当前要导出的 vibe 数据
 * @returns importInfo 节点
 */
function buildOfficialImportInfo(payload: NovelAIVibeDownloadPayload): OfficialVibeFile['importInfo'] {
  return {
    model: payload.model,
    information_extracted: payload.informationExtracted,
    strength: payload.referenceStrength,
  };
}

/**
 * 生成官网文件 encodings 使用的缓存密钥
 * @param payload 当前要导出的 vibe 数据
 * @param imageId 官网图片 ID
 * @returns 本地稳定缓存密钥
 */
async function createOfficialCacheSecretKey(payload: NovelAIVibeDownloadPayload, imageId: string): Promise<string> {
  return sha256Text(`${imageId}:${payload.sourceHash}:${payload.model}:${payload.informationExtracted}`);
}

/**
 * 根据官网规则生成文件短名
 * @param imageId 官网图片 ID
 * @returns 官网风格文件名
 */
function buildOfficialVibeName(imageId: string): string {
  return `${imageId.slice(0, 6)}-${imageId.slice(-6)}`;
}

/**
 * 生成官网规范的 JPEG 缩略图
 * @param imageData 原图 DataURL
 * @returns 缩略图 DataURL
 */
async function generateOfficialThumbnail(imageData: string): Promise<string> {
  const image = await loadImageElement(imageData);
  const scale = OFFICIAL_THUMBNAIL_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 Canvas，无法生成官网缩略图');
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', OFFICIAL_THUMBNAIL_QUALITY);
}

/**
 * 加载原图为浏览器图片对象
 * @param imageData 原图 DataURL
 * @returns 图片对象
 */
function loadImageElement(imageData: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('加载 Vibe 原图失败，无法生成官网缩略图'));
    image.src = imageData;
  });
}
