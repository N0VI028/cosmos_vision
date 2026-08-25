import { findChatParagraph } from '@/services/sillytavern/chat-dom';

/** 选段生图路由类型：普通 p 段落走短码，前端型气泡走楼层尾 */
export type InlineRouteType = 'classic-p' | 'frontend';

/**
 * 根据 DOM 元素特征判定选段生图链路路由（排除法）
 * 规则：
 * 1. 处于 iframe 内部的元素 -> 一律 frontend 路由
 * 2. 处于顶层文档中：
 *    - 满足纯标准 Markdown 段落特征（findChatParagraph 返回非空） -> classic-p 路由
 *    - 其它所有情况（自定义 HTML/CSS、卡片组件、details、带样式的段落等） -> frontend 路由
 * @param element 目标 DOM 元素
 * @returns 路由类型
 */
export function resolveInlineRoute(element: HTMLElement): InlineRouteType {
  const isIframe = element.ownerDocument !== document;
  if (isIframe) {
    return 'frontend';
  }

  const chatParagraph = findChatParagraph(element);
  return chatParagraph ? 'classic-p' : 'frontend';
}
