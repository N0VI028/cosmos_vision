import type { ComfyUIHistoryImage } from '@/services/comfyui/types';

/** history 单条记录 */
export interface ComfyUIHistoryEntry {
  outputs?: Record<string, { images?: ComfyUIHistoryImage[] }>;
  status?: {
    status_str?: string;
    messages?: unknown[];
  };
}

/**
 * 从历史记录提取指定节点的全部图片
 * @param entry 当前 prompt 的历史条目
 * @param imageOutputNodeId 指定输出节点
 * @returns 图片列表；节点尚无输出时返回 null；节点已存在但无图则抛错
 */
export function extractHistoryImages(
  entry: ComfyUIHistoryEntry | null,
  imageOutputNodeId: string,
): ComfyUIHistoryImage[] | null {
  if (!entry?.outputs) return null;
  if (!(imageOutputNodeId in entry.outputs)) return null;

  const images = (entry.outputs[imageOutputNodeId]?.images ?? []).filter(image => Boolean(image.filename));
  if (!images.length) {
    throw new Error(`段落生图结果节点 ${imageOutputNodeId} 未返回任何图片`);
  }
  return images;
}
