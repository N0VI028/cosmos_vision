/**
 * 历史楼层数量上限
 *
 * 基于性能研究：100层、50条规则、2KB/层的正则阶段 p95 约 2.5ms
 * 防止实际聊天增长到数千层时阻塞主线程
 */
export const MAX_HISTORY_FLOOR_COUNT = 100;
