import { getContext } from '@sillytavern/scripts/extensions';

/** 楼层尾前端型 slot 结构 */
export interface CvFloorTailSlot {
  slotId: string;
  mesId: number;
  swipeId: number;
  imageRefs: string[];
  /** 目标 iframe 的 DOM id（如果有） */
  targetIframeId?: string;
  /** 目标 iframe 在楼层内的索引序号（如果有） */
  targetIframeIndex?: number;
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
  if (slots[slotId]) {
    delete slots[slotId];
    persistChatMetadata();
  }
}

/**
 * 按楼层 ID 和 swipe ID 筛选楼层尾 slot 列表
 * @param mesId 消息楼层 ID
 * @param swipeId swipe ID
 * @returns 匹配的 slot 数组
 */
export function listFloorTailSlotsBySwipe(mesId: number, swipeId: number): CvFloorTailSlot[] {
  const slots = readFloorTailSlots();
  return Object.values(slots).filter(s => s.mesId === mesId && s.swipeId === swipeId);
}

/**
 * 楼层回退/删除截断时，清理 mesId 大于指定值的楼层尾 slots
 * @param mesId 截断保留的最大楼层 ID
 */
export function pruneFloorTailSlotsAboveMesId(mesId: number): void {
  const slots = readFloorTailSlots();
  let changed = false;
  for (const [id, slot] of Object.entries(slots)) {
    if (slot.mesId > mesId) {
      delete slots[id];
      changed = true;
    }
  }
  if (changed) {
    persistChatMetadata();
  }
}

/**
 * 调用 SillyTavern 防抖保存 chatMetadata
 */
function persistChatMetadata(): void {
  const context = getContext();
  if (typeof context.saveMetadataDebounced === 'function') {
    context.saveMetadataDebounced();
  }
}
