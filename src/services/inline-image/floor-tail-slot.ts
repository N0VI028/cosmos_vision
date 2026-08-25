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
  return Object.values(slots).filter(slot => slot.mesId === mesId && slot.swipeId === swipeId);
}

/**
 * 按 iframe 渲染目标查找已存在的楼层尾 slot，用于同 iframe 多次生图归并复用
 * 匹配规则：targetIframeId 相同，或 targetIframeIndex 相同；
 * 两者均缺失（顶层非 iframe 前端气泡）时按"同楼同 swipe 无 iframe 标识"归并为一组
 * @param mesId 消息楼层 ID
 * @param swipeId swipe ID
 * @param target 渲染目标上下文
 * @returns 已存在的 slot 或 undefined
 */
export function findFloorTailSlotByTarget(
  mesId: number,
  swipeId: number,
  target: { targetIframeId?: string; targetIframeIndex?: number },
): CvFloorTailSlot | undefined {
  return listFloorTailSlotsBySwipe(mesId, swipeId).find(slot => isSameIframeTarget(slot, target));
}

/**
 * 判断 slot 与目标是否指向同一 iframe 渲染单元
 * @param slot 楼层尾 slot
 * @param target 渲染目标上下文
 * @returns 是否同一渲染单元
 */
function isSameIframeTarget(
  slot: CvFloorTailSlot,
  target: { targetIframeId?: string; targetIframeIndex?: number },
): boolean {
  if (target.targetIframeId && slot.targetIframeId === target.targetIframeId) return true;
  if (typeof target.targetIframeIndex === 'number' && slot.targetIframeIndex === target.targetIframeIndex) return true;
  const bothUntagged = !target.targetIframeId && typeof target.targetIframeIndex !== 'number'
    && !slot.targetIframeId && typeof slot.targetIframeIndex !== 'number';
  return bothUntagged;
}

/**
 * 楼层回退/删除截断时，清理超出有效范围的楼层尾 slots
 * @param threshold 删除后的聊天长度，即有效 mesId 上界
 * @returns 被删除的 slot 列表
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
  if (deleted.length) persistChatMetadata();
  return deleted;
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
