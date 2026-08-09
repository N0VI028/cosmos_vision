/**
 * 账号路由模式共享常量与描述文本
 * NovelAI 与提示词 LLM 共用同一套路由模式语义,集中维护避免两处 UI 描述漂移
 */

/** 路由模式:故障转移(每次从列表第一组账号开始,失败后按顺序继续尝试) */
export const ROUTING_MODE_FAILOVER = 'sequential';

/** 路由模式:负载均衡(每次请求轮换首选账号,失败后继续尝试其它账号) */
export const ROUTING_MODE_LOAD_BALANCE = 'load_balance';

/** 路由模式 value → 中文描述文本 */
export const ROUTING_MODE_HINTS: Record<string, string> = {
  [ROUTING_MODE_FAILOVER]: '每次都从列表第一组账号开始，失败后按顺序继续尝试',
  [ROUTING_MODE_LOAD_BALANCE]: '每次请求都会轮换首选账号，失败后继续尝试其它账号',
};

/**
 * 读取指定路由模式的描述文本
 * @param routingMode 路由模式 value
 * @returns 用户可见的中文描述
 */
export function getRoutingModeHint(routingMode: string): string {
  return ROUTING_MODE_HINTS[routingMode] ?? ROUTING_MODE_HINTS[ROUTING_MODE_FAILOVER]!;
}