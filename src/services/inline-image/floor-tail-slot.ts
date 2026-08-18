import { getContext } from '@sillytavern/scripts/extensions';

/** 楼层尾前端型 slot 结构 */
export interface CvFloorTailSlot {
  slotId: string;
  mesId: number;
  swipeId: number;
  promptText: string;
  imageRefs: string[];
  createdAt: number;
  route: 'frontend';
}

interface CosmosVisionChatMetadata {
  slots?: Record<string, CvFloorTailSlot>;
}

/**
 * 读取当前聊天元数据中的全部楼层尾 slot
 * @returns slot 字典
 */
export function readFloorTailSlots(): Record<string, CvFloorTailSlot> {
  const context = getContext();
  const metadata = context.chatMetadata as { cosmos_vision?: CosmosVisionChatMetadata } | undefined;
  return metadata?.cosmos_vision?.slots ?? {};
}

/**
 * 写入单个楼层尾 slot 并持久化元数据
 * @param slot 楼层尾 slot 对象
 */
export function writeFloorTailSlot(slot: CvFloorTailSlot): void {
  const context = getContext();
  const metadata = (context.chatMetadata ?? {}) as { cosmos_vision?: CosmosVisionChatMetadata };
  if (!metadata.cosmos_vision) metadata.cosmos_vision = {};
  if (!metadata.cosmos_vision.slots) metadata.cosmos_vision.slots = {};
  metadata.cosmos_vision.slots[slot.slotId] = slot;
  persistChatMetadata();
}

/**
 * 删除指定 ID 的楼层尾 slot
 * @param slotId 位点 ID
 */
export function deleteFloorTailSlot(slotId: string): void {
  const slots = readFloorTailSlots();
  if (!slots[slotId]) return;
  delete slots[slotId];
  persistChatMetadata();
}

/**
 * 按楼层 ID 与 swipeId 查询关联的全部楼层尾 slot
 * @param mesId 消息楼层 ID
 * @param swipeId 当前激活的 swipeId
 * @returns slot 数组（按创建时间正序）
 */
export function listFloorTailSlotsBySwipe(mesId: number, swipeId: number): CvFloorTailSlot[] {
  const slots = readFloorTailSlots();
  return Object.values(slots)
    .filter(slot => slot.mesId === mesId && slot.swipeId === swipeId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 清理 mesId 超出有效范围的楼层尾 slot 并返回被删除项
 * ST 删除消息后剩余 mesId 为 [0, threshold) 连续区间，任何 mesId >= threshold 的 slot 均已失效
 * @param threshold 有效 mesId 上界（删除后 chat.length）
 * @returns 被删除的 slot 数组
 */
export function pruneFloorTailSlotsAboveMesId(threshold: number): CvFloorTailSlot[] {
  const slots = readFloorTailSlots();
  const deleted: CvFloorTailSlot[] = [];
  for (const [id, slot] of Object.entries(slots)) {
    if (slot.mesId >= threshold) {
      deleted.push(slot);
      delete slots[id];
    }
  }
  if (deleted.length > 0) persistChatMetadata();
  return deleted;
}

/**
 * 防抖持久化当前聊天元数据
 */
function persistChatMetadata(): void {
  const context = getContext();
  context.saveMetadataDebounced?.();
}
