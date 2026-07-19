import type { NovelAIModel } from '@/constants/novelai';
import {
  getOfficialNovelAIVibeModelKey,
  parseOfficialNovelAIVibeTransferContent,
  stripDataUrlBase64,
  type OfficialVibeEncodingEntry,
  type OfficialVibeTransferEntry,
} from '@/services/novelai/vibe-file';
import { sha256Text } from '@/services/novelai/vibe-shared';
import type { ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

/**
 * 创建本地保存的官方 Vibe 文档
 * @param payload 已解析 Vibe 载荷
 * @param model 默认 NovelAI 模型
 * @param informationExtracted 默认信息提取强度
 * @returns 官方 Vibe 文档
 */
export async function createStoredVibeDocument(
  payload: ParsedNovelAIVibeFile,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<OfficialVibeTransferEntry> {
  if (payload.officialFileData) return parseStoredVibeDocument(payload.officialFileData);
  const document = createEmptyVibeDocument(payload, model, informationExtracted);
  for (const encoding of payload.encodings ?? []) {
    await addVibeEncoding(
      document,
      encoding.model,
      encoding.informationExtracted,
      encoding.encodedData,
      encoding.cacheSecretKey,
    );
  }
  if (payload.encodedData && !(payload.encodings?.length ?? 0)) {
    await addVibeEncoding(document, model, informationExtracted, payload.encodedData, payload.cacheSecretKey);
  }
  return document;
}

/**
 * 合并同一来源的新旧 Vibe 文档
 * @param existing 已保存文档
 * @param incoming 新上传文档
 * @returns 保留旧数据并应用新内容的文档
 */
export function mergeStoredVibeDocuments(
  existing: OfficialVibeTransferEntry,
  incoming: OfficialVibeTransferEntry,
): OfficialVibeTransferEntry {
  const image = incoming.image ?? existing.image;
  return {
    ...existing,
    ...incoming,
    id: incoming.id ?? existing.id,
    image,
    thumbnail: incoming.thumbnail ?? existing.thumbnail,
    encodings: mergeVibeEncodingGroups(existing, incoming),
    type: image ? 'image' : 'encoding',
  };
}

/** 合并全部模型的 encoding，并让新文档替换相同提取强度 */
function mergeVibeEncodingGroups(
  existing: OfficialVibeTransferEntry,
  incoming: OfficialVibeTransferEntry,
): OfficialVibeTransferEntry['encodings'] {
  const modelKeys = new Set([...Object.keys(existing.encodings), ...Object.keys(incoming.encodings)]);
  return Object.fromEntries(
    [...modelKeys].map(modelKey => [modelKey, mergeVibeEncodingGroup(existing, incoming, modelKey)]),
  );
}

/** 合并单个模型下的 encoding */
function mergeVibeEncodingGroup(
  existing: OfficialVibeTransferEntry,
  incoming: OfficialVibeTransferEntry,
  modelKey: string,
): Record<string, OfficialVibeEncodingEntry> {
  const incomingEntries = incoming.encodings[modelKey] ?? {};
  const replaced = new Set(
    Object.values(incomingEntries).map(entry =>
      readEncodingInformation(entry, incoming.importInfo.information_extracted),
    ),
  );
  const preserved = Object.entries(existing.encodings[modelKey] ?? {}).filter(
    ([, entry]) => !replaced.has(readEncodingInformation(entry, existing.importInfo.information_extracted)),
  );
  return Object.fromEntries([...preserved, ...Object.entries(incomingEntries)]);
}

/** 读取 encoding 的信息提取强度 */
function readEncodingInformation(entry: OfficialVibeEncodingEntry, fallback: number): number {
  return entry.params?.information_extracted ?? fallback;
}

/**
 * 将新 encoding 写入官方 Vibe 文档
 * @param document 官方 Vibe 文档
 * @param model NovelAI 模型
 * @param informationExtracted 信息提取强度
 * @param encodedData encoding Base64
 * @param cacheSecretKey 官网缓存密钥
 */
export async function addVibeEncoding(
  document: OfficialVibeTransferEntry,
  model: NovelAIModel,
  informationExtracted: number,
  encodedData: string,
  cacheSecretKey?: string,
): Promise<void> {
  const modelKey = getOfficialNovelAIVibeModelKey(model);
  const key = cacheSecretKey ?? (await sha256Text(`${document.id ?? document.name}:${model}:${informationExtracted}`));
  document.encodings[modelKey] ??= {};
  removeMatchingEncodings(document.encodings[modelKey], informationExtracted);
  document.encodings[modelKey][key] = {
    encoding: stripDataUrlBase64(encodedData),
    params: { information_extracted: informationExtracted },
  };
  document.importInfo = { ...document.importInfo, model, information_extracted: informationExtracted };
  document.type = document.image ? 'image' : 'encoding';
}

/** 删除同模型下相同信息提取强度的旧 encoding */
function removeMatchingEncodings(
  encodings: Record<string, { params?: { information_extracted?: number } }>,
  informationExtracted: number,
): void {
  for (const [key, entry] of Object.entries(encodings)) {
    if (entry.params?.information_extracted === informationExtracted) delete encodings[key];
  }
}

/**
 * 解析官方 Vibe 文档
 * @param document 官方 Vibe 文档或 JSON 文本
 * @returns 官方 Vibe 文档
 */
export function parseStoredVibeDocument(document: OfficialVibeTransferEntry | string): OfficialVibeTransferEntry {
  if (typeof document !== 'string') return document;
  const parsed = JSON.parse(document) as OfficialVibeTransferEntry;
  if (!parsed || parsed.identifier !== 'novelai-vibe-transfer') throw new Error('本地 Vibe 文件格式无效');
  return parsed;
}

/**
 * 从官方文档读取运行时载荷
 * @param document 官方 Vibe 文档
 * @param fileName 展示文件名
 * @returns 解析后的载荷
 */
export async function readStoredVibePayload(
  document: OfficialVibeTransferEntry,
  fileName: string,
): Promise<ParsedNovelAIVibeFile> {
  const [payload] = await parseOfficialNovelAIVibeTransferContent(JSON.stringify(document), fileName);
  if (!payload) throw new Error('本地 Vibe 文件缺少有效内容');
  return payload;
}

/** 创建没有官方原始文件时使用的基础文档 */
function createEmptyVibeDocument(
  payload: ParsedNovelAIVibeFile,
  model: NovelAIModel,
  informationExtracted: number,
): OfficialVibeTransferEntry {
  const image = payload.imageData ? stripDataUrlBase64(payload.imageData) : undefined;
  return {
    identifier: 'novelai-vibe-transfer',
    version: 1,
    type: image ? 'image' : 'encoding',
    id: payload.sourceHash,
    image,
    encodings: {},
    name: payload.fileName,
    thumbnail: payload.thumbnailData,
    importInfo: {
      model,
      information_extracted: informationExtracted,
      strength: 1,
    },
  };
}
