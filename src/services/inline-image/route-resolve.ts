import { findChatParagraph } from '@/services/sillytavern/chat-dom';

/** 选段生图路由类型：普通 p 段落走短码，前端型气泡走楼层尾 */
export type InlineRouteType = 'classic-p' | 'frontend';

/**
 * 根据 DOM 元素特征判定选段生图链路
 * @param element 目标 DOM 元素
 * @returns 路由类型
 */
export function resolveInlineRoute(element: HTMLElement): InlineRouteType {
  if (element.ownerDocument !== document) {
    throw new Error('暂不支持 iframe 内选段生图');
  }
  if (findChatParagraph(element)) {
    return 'classic-p';
  }
  return 'frontend';
}
