/**
 * ST 聊天 DOM 段落定位与上下文抽取
 * 以当前可见聊天界面为准,不依赖 TavernHelper.getChatMessages
 */

/**
 * 提取段落纯文本,剔除插件注入的浮窗按钮等非原文节点
 * @param p 段落 DOM 元素
 * @returns 段落文本(已去首尾空白)
 */
function getCleanParagraphText(p: HTMLElement): string {
  // 克隆后剥离插件注入节点,避免污染原文
  const clone = p.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cv-inline-gen-btn').forEach(el => el.remove());
  return clone.textContent?.trim() ?? '';
}

/**
 * 从聊天 DOM 中提取所有可见段落
 * @returns 段落文本数组,按 DOM 顺序排列
 */
export function extractAllParagraphs(): string[] {
  const paragraphs: string[] = [];
  const paragraphElements = getChatParagraphElements();

  paragraphElements.forEach(p => {
    const text = getCleanParagraphText(p);
    if (text) {
      paragraphs.push(text);
    }
  });

  return paragraphs;
}

/**
 * 获取聊天区全部段落元素
 * @returns 按 DOM 顺序排列的段落元素数组
 */
export function getChatParagraphElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.mes_text p'));
}

/**
 * 定位目标段落在全局段落序列中的索引
 * @param targetP 目标段落 DOM 元素
 * @returns 段落索引,未找到返回 -1
 */
export function findParagraphIndex(targetP: HTMLElement): number {
  return getChatParagraphElements().indexOf(targetP);
}

/**
 * 提取目标段落前后各 N 段的上下文
 * @param targetP 目标段落 DOM 元素
 * @param radius 焦点段落前后各取几个段落
 * @returns 上下文段落文本数组(包含目标段落)
 */
export function extractContextAroundParagraph(targetP: HTMLElement, radius: number): string[] {
  const allParagraphs = extractAllParagraphs();
  const targetIndex = findParagraphIndex(targetP);
  const safeRadius = normalizeContextParagraphCount(radius);

  if (targetIndex === -1) {
    throw new Error('未找到目标段落');
  }

  const start = Math.max(0, targetIndex - safeRadius);
  const end = Math.min(allParagraphs.length, targetIndex + safeRadius + 1);

  return allParagraphs.slice(start, end);
}

/**
 * 读取当前焦点聊天段落
 * @returns 当前带选中态的聊天段落,未找到返回 null
 */
export function getFocusedChatParagraph(): HTMLElement | null {
  const paragraph = document.querySelector('.mes_text p.cv-inline-selected');
  return paragraph instanceof HTMLElement ? paragraph : null;
}

/**
 * 规范化聊天段落范围输入
 * @param value 用户填写值
 * @returns 可安全用于上下文截取的非负整数
 */
export function normalizeContextParagraphCount(value: number): number {
  return Math.max(0, Math.floor(value));
}

/**
 * 从段落 DOM 向上查找所属消息的 mesid
 * @param p 段落 DOM 元素
 * @returns mesid 字符串,未找到返回 null
 */
export function findMessageId(p: HTMLElement): string | null {
  const mesBlock = p.closest('[mesid]');
  return mesBlock?.getAttribute('mesid') ?? null;
}

/**
 * 从任意 DOM 元素向上查找其所属的聊天段落 p
 * 兼容 `<p>` 内部嵌套 `<em>` / `<q>` / `<strong>` 等内联元素的点击
 * @param el 点击目标元素
 * @returns 所属的 `.mes_text` 下的 `<p>` 元素,未找到返回 null
 */
export function findChatParagraph(el: HTMLElement): HTMLElement | null {
  return el.closest('.mes_text p');
}
