import { createPromptPersonTagsDraft, type PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';
import { readPngTextChunks } from './png-metadata';
import type { PngTextChunk } from './types';

/**
 * 合并多组逗号分隔的 tag 并保持首次出现顺序去重
 * @param tagGroups 待合并的 tag 组
 * @returns 规范化合并后的逗号分隔 tag 字符串
 */
export function mergeTagsPreservingOrder(tagGroups: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of tagGroups) {
    if (!group) continue;
    const tags = group.split(',').map(tag => tag.trim()).filter(Boolean);
    for (const tag of tags) {
      const normalizedKey = tag.toLowerCase();
      if (!seen.has(normalizedKey)) {
        seen.add(normalizedKey);
        merged.push(tag);
      }
    }
  }

  return merged.join(', ');
}

/**
 * 解析 NovelAI 生图元数据
 * @param rawText Chunk 文本
 * @returns 提取的草稿或 null
 */
export function parseNaiMetadata(rawText: string): PromptPersonTagsDraft | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  let data: Record<string, any>;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error('元数据 JSON 解析失败');
  }

  if (!data || typeof data !== 'object') return null;
  const hasV4 = Boolean(data.v4_prompt || data.v4_negative_prompt);
  const hasV3 = 'prompt' in data || 'uc' in data;
  if (!hasV4 && !hasV3) return null;

  let positiveTags = '';
  let negativeTags = '';

  const charCaptions = data.v4_prompt?.caption?.char_captions;
  if (Array.isArray(charCaptions) && charCaptions.length > 0) {
    const charTexts = charCaptions
      .map((item: any) => (typeof item?.char_caption === 'string' ? item.char_caption : ''))
      .filter(Boolean);
    const baseText = typeof data.v4_prompt?.caption?.base_caption === 'string'
      ? data.v4_prompt.caption.base_caption
      : (typeof data.prompt === 'string' ? data.prompt : '');
    positiveTags = mergeTagsPreservingOrder([...charTexts, baseText]);
  } else if (typeof data.v4_prompt?.caption?.base_caption === 'string') {
    positiveTags = data.v4_prompt.caption.base_caption.trim();
  } else if (typeof data.prompt === 'string') {
    positiveTags = data.prompt.trim();
  }

  if (typeof data.v4_negative_prompt?.caption?.base_caption === 'string') {
    negativeTags = data.v4_negative_prompt.caption.base_caption.trim();
  } else if (typeof data.uc === 'string') {
    negativeTags = data.uc.trim();
  }

  return createPromptPersonTagsDraft(positiveTags, negativeTags);
}

/**
 * 解析 Stable Diffusion (A1111 系) 生图参数文本
 * @param rawText parameters 文本内容
 * @returns 提取的草稿或 null
 */
export function parseSdParameters(rawText: string): PromptPersonTagsDraft | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  let positive = '';
  let negative = '';
  const negMarker = 'Negative prompt:';
  const negIndex = trimmed.indexOf(negMarker);

  if (negIndex !== -1) {
    positive = trimmed.slice(0, negIndex).trim();
    const afterNeg = trimmed.slice(negIndex + negMarker.length);
    const stepsMatch = afterNeg.match(/(?:^|\n)\s*Steps:\s*\d+/);
    negative = stepsMatch && stepsMatch.index !== undefined
      ? afterNeg.slice(0, stepsMatch.index).trim()
      : afterNeg.trim();
  } else {
    const stepsMatch = trimmed.match(/(?:^|\n)\s*Steps:\s*\d+/);
    positive = stepsMatch && stepsMatch.index !== undefined
      ? trimmed.slice(0, stepsMatch.index).trim()
      : trimmed;
  }

  return createPromptPersonTagsDraft(positive, negative);
}

/**
 * 递归追踪连向 CLIPTextEncode 的上游节点 ID
 * @param graph ComfyUI 节点关系图
 * @param linkRef 节点连接引用
 * @param visited 已访问节点集合
 */
function traceClipTextNodeIds(
  graph: Record<string, any>,
  linkRef: unknown,
  visited = new Set<string>(),
): string[] {
  if (!Array.isArray(linkRef) || typeof linkRef[0] !== 'string') return [];
  const nodeId = String(linkRef[0]);
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const node = graph[nodeId];
  if (!node) return [];
  if (node.class_type === 'CLIPTextEncode') return [nodeId];

  const result: string[] = [];
  if (node.inputs && typeof node.inputs === 'object') {
    for (const val of Object.values(node.inputs)) {
      if (Array.isArray(val) && typeof val[0] === 'string' && graph[val[0]]) {
        result.push(...traceClipTextNodeIds(graph, val, visited));
      }
    }
  }
  return result;
}

/**
 * 解析 ComfyUI prompt API 图结构
 * @param rawText prompt Chunk 负载 JSON
 * @returns 提取的草稿或 null
 */
export function parseComfyUiPrompt(rawText: string): PromptPersonTagsDraft | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  let graph: Record<string, any>;
  try {
    graph = JSON.parse(trimmed);
  } catch {
    throw new Error('元数据 JSON 解析失败');
  }

  if (!graph || typeof graph !== 'object') return null;

  const clipNodes: Array<{ id: string; text: string }> = [];
  for (const [id, node] of Object.entries(graph)) {
    if (node?.class_type === 'CLIPTextEncode' && typeof node?.inputs?.text === 'string') {
      clipNodes.push({ id, text: node.inputs.text });
    }
  }
  if (clipNodes.length === 0) return null;

  const positiveSourceIds = new Set<string>();
  const negativeSourceIds = new Set<string>();

  for (const node of Object.values(graph)) {
    if (!node?.inputs || typeof node.inputs !== 'object') continue;
    if (node.inputs.positive) {
      for (const id of traceClipTextNodeIds(graph, node.inputs.positive)) positiveSourceIds.add(id);
    }
    if (node.inputs.negative) {
      for (const id of traceClipTextNodeIds(graph, node.inputs.negative)) negativeSourceIds.add(id);
    }
  }

  const positiveTexts: string[] = [];
  const negativeTexts: string[] = [];

  for (const { id, text } of clipNodes) {
    const textTrimmed = text.trim();
    if (!textTrimmed) continue;
    if (negativeSourceIds.has(id)) {
      negativeTexts.push(textTrimmed);
    } else {
      positiveTexts.push(textTrimmed);
    }
  }

  return createPromptPersonTagsDraft(positiveTexts.join(', '), negativeTexts.join(', '));
}

/**
 * 从 PNG 文本 Chunk 列表中按优先级匹配并提取人物 tag 草稿
 * @param chunks PNG 文本 Chunk 列表
 * @returns 提取的人物 tag 草稿
 */
export function extractPromptTagsFromChunks(chunks: PngTextChunk[]): PromptPersonTagsDraft {
  if (!chunks || chunks.length === 0) {
    throw new Error('未在图片中找到支持的生图元数据（NAI/SD/ComfyUI）');
  }

  // 各生图源的 Chunk 关键字与对应解析器，按 NAI → SD → ComfyUI 优先级尝试
  const parsers: Array<{ keywords: string[]; parse: (text: string) => PromptPersonTagsDraft | null }> = [
    { keywords: ['Description', 'Comment'], parse: parseNaiMetadata },
    { keywords: ['parameters'], parse: parseSdParameters },
    { keywords: ['prompt'], parse: parseComfyUiPrompt },
  ];

  for (const { keywords, parse } of parsers) {
    for (const chunk of chunks) {
      if (!keywords.includes(chunk.keyword)) continue;
      const draft = parse(chunk.text);
      if (!draft) continue;
      if (!draft.positiveTags && !draft.negativeTags) throw new Error('元数据中未找到有效的提示词内容');
      return draft;
    }
  }

  throw new Error('未在图片中找到支持的生图元数据（NAI/SD/ComfyUI）');
}

/**
 * 从 PNG 图片文件读取内置元数据并提取人物提示词草稿
 * @param file 图片文件或 Blob
 * @returns 提取的正面和负面提示词草稿
 */
export async function extractPromptTagsFromImage(file: File | Blob): Promise<PromptPersonTagsDraft> {
  const chunks = await readPngTextChunks(file);
  return extractPromptTagsFromChunks(chunks);
}
