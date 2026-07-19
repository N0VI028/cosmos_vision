import { uuidv4 } from '@sillytavern/scripts/utils';

import type { NovelAIModel } from '@/constants/novelai';
import { DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH } from '@/constants/novelai-vibe';
import {
  addVibeEncoding,
  createStoredVibeDocument,
  mergeStoredVibeDocuments,
  parseStoredVibeDocument,
  readStoredVibePayload,
} from '@/services/novelai/vibe-document';
import type { OfficialVibeTransferEntry } from '@/services/novelai/vibe-file';
import type {
  NovelAIVibeCacheListItem,
  NovelAIVibeCacheRecord,
  NovelAIVibeCacheSummary,
  NovelAIVibeDownloadPayload,
  ParsedNovelAIVibeFile,
} from '@/services/novelai/vibe-types';
import { deleteSillyTavernFile, readSillyTavernJson, uploadSillyTavernJson } from '@/services/sillytavern/files';

const VIBE_MANIFEST_NAME = 'CV-vibes.json';
const VIBE_MANIFEST_PATH = `/user/files/${VIBE_MANIFEST_NAME}`;
const VIBE_MANIFEST_VERSION = 2;

interface VibeEncodingIndex {
  model: NovelAIModel;
  informationExtracted: number;
  cacheSecretKey?: string;
  createdAt: number;
}

interface VibeSourceEntry {
  sourceHash: string;
  fileName: string;
  filePath: string;
  sourceType: 'image' | 'encoded-vibe';
  hasImage: boolean;
  thumbnailData?: string;
  encodings: VibeEncodingIndex[];
  createdAt: number;
}

interface VibeManifest {
  version: 2;
  sources: VibeSourceEntry[];
}

/** 生成解析时一次加载的同源 vibe 缓存视图 */
export interface NovelAIVibeSourceCacheView {
  imageData: string | null;
  fileName: string | null;
  encodings: Array<{ model: NovelAIModel; informationExtracted: number; encodedData: string }>;
}

let manifestWriteQueue = Promise.resolve();

/**
 * 保存上传的官方 Vibe 文件或普通图片
 * @param payload 已解析文件载荷
 * @param model 当前模型
 * @param informationExtracted 信息提取强度
 */
export async function saveNovelAIVibeFilePayload(
  payload: ParsedNovelAIVibeFile,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<void> {
  const existing = await findVibeSource(payload.sourceHash);
  const incomingDocument = await createStoredVibeDocument(payload, model, informationExtracted);
  const document = existing
    ? mergeStoredVibeDocuments(await readStoredDocument(existing), incomingDocument)
    : incomingDocument;
  const filePath = await uploadStoredDocument(document);
  const storedPayload = await readStoredVibePayload(document, payload.fileName);
  const source = createSourceEntry(
    { ...storedPayload, sourceHash: payload.sourceHash, fileName: payload.fileName },
    document,
    filePath,
    model,
    informationExtracted,
  );
  await mutateVibeManifest(manifest => upsertSource(manifest, source));
  if (existing && existing.filePath !== filePath) await deleteSillyTavernFile(existing.filePath);
}

/**
 * 保存 NovelAI 编码结果
 * @param payload 文件来源
 * @param model 解析模型
 * @param informationExtracted 信息提取强度
 * @param encodedData 编码 Base64
 * @param cacheSecretKey 官网缓存密钥
 */
export async function saveNovelAIVibeEncodedData(
  payload: Pick<ParsedNovelAIVibeFile, 'sourceHash' | 'fileName'>,
  model: NovelAIModel,
  informationExtracted: number,
  encodedData: string,
  cacheSecretKey?: string,
): Promise<void> {
  const existing = await findVibeSource(payload.sourceHash);
  if (!existing) {
    await saveNovelAIVibeFilePayload(
      { ...payload, sourceType: 'encoded-vibe', encodedData, cacheSecretKey },
      model,
      informationExtracted,
    );
    return;
  }
  const document = await readStoredDocument(existing);
  await addVibeEncoding(document, model, informationExtracted, encodedData, cacheSecretKey);
  await uploadStoredDocument(document, existing.filePath);
  await mutateVibeManifest(manifest =>
    updateSourceEncoding(manifest, existing.sourceHash, model, informationExtracted, cacheSecretKey),
  );
}

/**
 * 保存 NovelAI Vibe 缩略图
 * @param sourceHash 来源哈希
 * @param thumbnailData 缩略图 data URL
 */
export async function saveNovelAIVibeThumbnailData(sourceHash: string, thumbnailData: string): Promise<void> {
  const source = await findVibeSource(sourceHash);
  if (!source) return;
  const document = await readStoredDocument(source);
  document.thumbnail = thumbnailData;
  await uploadStoredDocument(document, source.filePath);
  await mutateVibeManifest(manifest => {
    const target = manifest.sources.find(entry => entry.sourceHash === sourceHash);
    if (target) target.thumbnailData = thumbnailData;
  });
}

/**
 * 一次读取同源 Vibe 文件
 * @param sourceHash 来源哈希
 * @returns 原图与编码数据
 */
export async function loadNovelAIVibeSourceCache(sourceHash: string): Promise<NovelAIVibeSourceCacheView> {
  const source = await findVibeSource(sourceHash);
  if (!source) return { imageData: null, fileName: null, encodings: [] };
  const payload = await readStoredVibePayload(await readStoredDocument(source), source.fileName);
  return {
    imageData: payload.imageData ?? null,
    fileName: source.fileName,
    encodings: payload.encodings ?? toSingleEncoding(payload),
  };
}

/**
 * 汇总指定 Vibe 状态
 * @param sourceHash 来源哈希
 * @param model 当前模型
 * @param informationExtracted 信息提取强度
 * @returns Vibe 状态摘要
 */
export async function summarizeNovelAIVibeCache(
  sourceHash: string,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<NovelAIVibeCacheSummary> {
  const source = await findVibeSource(sourceHash);
  if (!source) return createEmptySummary(sourceHash);
  return {
    sourceHash,
    fileName: source.fileName,
    sourceType: source.sourceType,
    hasImage: source.hasImage,
    hasEncoded: source.encodings.length > 0,
    hasExactEncoded: source.encodings.some(entry => matchesEncoding(entry, model, informationExtracted)),
    thumbnailData: source.thumbnailData,
  };
}

/**
 * 读取全部 Vibe 管理列表
 * @returns Vibe 列表
 */
export async function listNovelAIVibeCacheItems(): Promise<NovelAIVibeCacheListItem[]> {
  return (await readVibeManifest()).sources
    .filter(source => source.encodings.length > 0)
    .map(source => ({
      sourceHash: source.sourceHash,
      fileName: source.fileName,
      sourceType: source.sourceType,
      hasImage: source.hasImage,
      hasEncoded: true,
      models: [...new Set(source.encodings.map(entry => entry.model))],
      thumbnailData: source.thumbnailData,
      createdAt: latestVibeTimestamp(source),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 读取单个 Vibe 下载载荷
 * @param sourceHash 来源哈希
 * @returns 下载载荷或 null
 */
export async function getNovelAIVibeDownloadPayload(sourceHash: string): Promise<NovelAIVibeDownloadPayload | null> {
  const source = await findVibeSource(sourceHash);
  return source ? createVibeDownloadPayload(source) : null;
}

/**
 * 读取全部 Vibe 下载载荷
 * @returns 下载载荷列表
 */
export async function listNovelAIVibeDownloadPayloads(): Promise<NovelAIVibeDownloadPayload[]> {
  const payloads = await Promise.all((await readVibeManifest()).sources.map(createVibeDownloadPayload));
  return payloads.filter((payload): payload is NovelAIVibeDownloadPayload => Boolean(payload));
}

/**
 * 导出全部 Vibe 记录
 * @returns 可序列化缓存记录
 */
export async function exportNovelAIVibeCacheRecords(): Promise<NovelAIVibeCacheRecord[]> {
  const records = await Promise.all((await readVibeManifest()).sources.map(hydrateVibeRecords));
  return records.flat();
}

/**
 * 导入 Vibe 记录
 * @param records 外部 Vibe 记录
 * @returns 导入数量
 */
export async function importNovelAIVibeCacheRecords(records: NovelAIVibeCacheRecord[]): Promise<number> {
  for (const record of records) await importVibeRecord(record);
  return records.length;
}

/**
 * 删除指定来源的官方 Vibe 文件
 * @param sourceHash 来源哈希
 */
export async function deleteNovelAIVibeSource(sourceHash: string): Promise<void> {
  const manifest = await readVibeManifest();
  const source = manifest.sources.find(entry => entry.sourceHash === sourceHash);
  if (!source) return;
  await deleteSillyTavernFile(source.filePath);
  manifest.sources = manifest.sources.filter(entry => entry.sourceHash !== sourceHash);
  await writeVibeManifest(manifest);
}

/**
 * 删除全部 Vibe 文件
 */
export async function clearNovelAIVibeCache(): Promise<void> {
  const manifest = await readVibeManifest();
  for (const source of manifest.sources) await deleteSillyTavernFile(source.filePath);
  await writeVibeManifest(createEmptyManifest());
}

/** 导入单条可移植 Vibe 记录 */
async function importVibeRecord(record: NovelAIVibeCacheRecord): Promise<void> {
  const existing = await findVibeSource(record.sourceHash);
  if (!existing) {
    await saveNovelAIVibeFilePayload(record, record.model, record.informationExtracted);
  } else if (record.imageData) {
    const document = await readStoredDocument(existing);
    document.image = record.imageData.replace(/^data:[^;]+;base64,/, '');
    await uploadStoredDocument(document, existing.filePath);
    await mutateVibeManifest(manifest => markSourceHasImage(manifest, record.sourceHash));
  }
  if (record.encodedData) {
    await saveNovelAIVibeEncodedData(
      record,
      record.model,
      record.informationExtracted,
      record.encodedData,
      record.cacheSecretKey,
    );
  }
  if (record.thumbnailData) await saveNovelAIVibeThumbnailData(record.sourceHash, record.thumbnailData);
}

/** 从官方文件水合导出记录 */
async function hydrateVibeRecords(source: VibeSourceEntry): Promise<NovelAIVibeCacheRecord[]> {
  const payload = await readStoredVibePayload(await readStoredDocument(source), source.fileName);
  const thumbnailData = source.thumbnailData;
  const records: NovelAIVibeCacheRecord[] = [];
  if (payload.imageData) records.push(createImageRecord(source, payload, thumbnailData));
  for (const encoding of payload.encodings ?? toSingleEncoding(payload)) {
    records.push({
      sourceHash: source.sourceHash,
      sourceType: 'encoded-vibe',
      fileName: source.fileName,
      model: encoding.model,
      informationExtracted: encoding.informationExtracted,
      encodedData: encoding.encodedData,
      cacheSecretKey: encoding.cacheSecretKey,
      thumbnailData,
      createdAt: latestVibeTimestamp(source),
    });
  }
  return records;
}

/** 创建导出用的原图记录 */
function createImageRecord(
  source: VibeSourceEntry,
  payload: ParsedNovelAIVibeFile,
  thumbnailData?: string,
): NovelAIVibeCacheRecord {
  return {
    sourceHash: source.sourceHash,
    sourceType: 'image',
    fileName: source.fileName,
    model: source.encodings[0]?.model ?? 'nai-diffusion-4-full',
    informationExtracted: source.encodings[0]?.informationExtracted ?? 1,
    imageData: payload.imageData,
    thumbnailData,
    createdAt: source.createdAt,
  };
}

/** 创建官方文件下载载荷 */
async function createVibeDownloadPayload(source: VibeSourceEntry): Promise<NovelAIVibeDownloadPayload | null> {
  const encoding = pickOfficialEncoding(source.encodings);
  if (!encoding) return null;
  const payload = await readStoredVibePayload(await readStoredDocument(source), source.fileName);
  const encodedData = (payload.encodings ?? toSingleEncoding(payload)).find(entry =>
    matchesEncoding(entry, encoding.model, encoding.informationExtracted),
  );
  if (!encodedData) return null;
  return {
    sourceHash: source.sourceHash,
    fileName: source.fileName,
    imageData: payload.imageData,
    encodedData: encodedData.encodedData,
    cacheSecretKey: encodedData.cacheSecretKey,
    model: encoding.model,
    informationExtracted: encoding.informationExtracted,
    referenceStrength: DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
    thumbnailData: source.thumbnailData,
    filePath: source.filePath,
  };
}

/** 根据官方文档创建轻量索引项 */
function createSourceEntry(
  payload: ParsedNovelAIVibeFile,
  document: { image?: string; thumbnail?: string },
  filePath: string,
  model: NovelAIModel,
  informationExtracted: number,
): VibeSourceEntry {
  const parsedEncodings = payload.encodings?.length
    ? payload.encodings.map(toEncodingIndex)
    : payload.encodedData
      ? [{ model, informationExtracted, cacheSecretKey: payload.cacheSecretKey, createdAt: Date.now() }]
      : [];
  return {
    sourceHash: payload.sourceHash,
    fileName: payload.fileName,
    filePath,
    sourceType: document.image ? 'image' : 'encoded-vibe',
    hasImage: Boolean(document.image),
    thumbnailData: payload.thumbnailData ?? document.thumbnail,
    encodings: parsedEncodings,
    createdAt: Date.now(),
  };
}

/** 更新索引中的单组 encoding 元数据 */
function updateSourceEncoding(
  manifest: VibeManifest,
  sourceHash: string,
  model: NovelAIModel,
  informationExtracted: number,
  cacheSecretKey?: string,
): void {
  const source = manifest.sources.find(entry => entry.sourceHash === sourceHash);
  if (!source) return;
  source.encodings = source.encodings.filter(entry => !matchesEncoding(entry, model, informationExtracted));
  source.encodings.push({ model, informationExtracted, cacheSecretKey, createdAt: Date.now() });
}

/** 插入或替换索引来源 */
function upsertSource(manifest: VibeManifest, source: VibeSourceEntry): void {
  const index = manifest.sources.findIndex(entry => entry.sourceHash === source.sourceHash);
  if (index >= 0) manifest.sources[index] = source;
  else manifest.sources.push(source);
}

/** 将来源标记为包含原图 */
function markSourceHasImage(manifest: VibeManifest, sourceHash: string): void {
  const source = manifest.sources.find(entry => entry.sourceHash === sourceHash);
  if (!source) return;
  source.hasImage = true;
  source.sourceType = 'image';
}

/** 将解析 encoding 转为索引元数据 */
function toEncodingIndex(encoding: {
  model: NovelAIModel;
  informationExtracted: number;
  cacheSecretKey?: string;
}): VibeEncodingIndex {
  return {
    model: encoding.model,
    informationExtracted: encoding.informationExtracted,
    cacheSecretKey: encoding.cacheSecretKey,
    createdAt: Date.now(),
  };
}

/** 兼容只有首个 encoding 的载荷 */
function toSingleEncoding(payload: ParsedNovelAIVibeFile): Array<{
  model: NovelAIModel;
  informationExtracted: number;
  encodedData: string;
  cacheSecretKey?: string;
}> {
  if (!payload.encodedData || !payload.model) return [];
  return [
    {
      model: payload.model,
      informationExtracted: payload.informationExtracted ?? 1,
      encodedData: payload.encodedData,
      cacheSecretKey: payload.cacheSecretKey,
    },
  ];
}

/** 读取并校验官方 Vibe 文档 */
async function readStoredDocument(source: VibeSourceEntry): Promise<OfficialVibeTransferEntry> {
  const document = await readSillyTavernJson<OfficialVibeTransferEntry>(source.filePath);
  if (!document) throw new Error(`Vibe 文件不存在：${source.fileName}`);
  return parseStoredVibeDocument(document);
}

/** 上传官方 Vibe 文档并返回路径 */
async function uploadStoredDocument(document: object, existingPath?: string): Promise<string> {
  const fileName = existingPath?.split('/').pop() ?? `CV-vibe-${uuidv4()}.naiv4vibe.json`;
  return uploadSillyTavernJson(fileName, document);
}

/** 选择优先用于导出的 encoding */
function pickOfficialEncoding(entries: VibeEncodingIndex[]): VibeEncodingIndex | undefined {
  return [...entries].sort(
    (left, right) =>
      Number(Boolean(right.cacheSecretKey)) - Number(Boolean(left.cacheSecretKey)) || right.createdAt - left.createdAt,
  )[0];
}

/** 判断索引项是否匹配模型和信息提取强度 */
function matchesEncoding(
  entry: Pick<VibeEncodingIndex, 'model' | 'informationExtracted'>,
  model: NovelAIModel,
  informationExtracted: number,
): boolean {
  return entry.model === model && entry.informationExtracted === informationExtracted;
}

/** 计算来源最近更新时间 */
function latestVibeTimestamp(source: VibeSourceEntry): number {
  return Math.max(source.createdAt, ...source.encodings.map(entry => entry.createdAt));
}

/** 按来源哈希查找索引项 */
async function findVibeSource(sourceHash: string): Promise<VibeSourceEntry | null> {
  return (await readVibeManifest()).sources.find(source => source.sourceHash === sourceHash) ?? null;
}

/** 串行修改 Vibe 轻量索引 */
async function mutateVibeManifest(mutate: (manifest: VibeManifest) => void): Promise<void> {
  const task = manifestWriteQueue.then(async () => {
    const manifest = await readVibeManifest();
    mutate(manifest);
    await uploadSillyTavernJson(VIBE_MANIFEST_NAME, manifest);
  });
  manifestWriteQueue = task.then(
    () => undefined,
    () => undefined,
  );
  await task;
}

/** 串行覆盖 Vibe 轻量索引 */
async function writeVibeManifest(manifest: VibeManifest): Promise<void> {
  const task = manifestWriteQueue.then(() => uploadSillyTavernJson(VIBE_MANIFEST_NAME, manifest));
  manifestWriteQueue = task.then(
    () => undefined,
    () => undefined,
  );
  await task;
}

/** 读取并校验当前版本索引 */
async function readVibeManifest(): Promise<VibeManifest> {
  const manifest = await readSillyTavernJson<VibeManifest>(VIBE_MANIFEST_PATH);
  if (!manifest) return createEmptyManifest();
  if (manifest.version !== VIBE_MANIFEST_VERSION || !Array.isArray(manifest.sources))
    throw new Error('Vibe 清单格式无效');
  return manifest;
}

/** 创建空的 Vibe 轻量索引 */
function createEmptyManifest(): VibeManifest {
  return { version: VIBE_MANIFEST_VERSION, sources: [] };
}

/** 创建不存在来源的空摘要 */
function createEmptySummary(sourceHash: string): NovelAIVibeCacheSummary {
  return {
    sourceHash,
    fileName: sourceHash.slice(0, 8),
    sourceType: 'encoded-vibe',
    hasImage: false,
    hasEncoded: false,
    hasExactEncoded: false,
  };
}
