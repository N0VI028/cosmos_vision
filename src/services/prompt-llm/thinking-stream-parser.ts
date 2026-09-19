/**
 * LLM 响应思考/正文流式分离
 *
 * 部分模型与中转会把思考过程以标签形式内联在正文里（DeepSeek R1 风格的
 * <think>、中转站常见的 <thinking> / <reasoning>）。TavernHelper 的流式
 * 事件只转发合并后的文本，独立 reasoning_content 字段不会流出；这里在
 * 展示侧按标签边界二次分离，得到 ChatGPT 风格的可折叠思考块。
 */

/** 支持识别的思考标签名 */
const THINKING_TAG_NAMES = ['think', 'thinking', 'reasoning'] as const;

/** 匹配思考标签块（闭合或流式未闭合到文末） */
const THINKING_TAG_PATTERN = new RegExp(
  `<(${THINKING_TAG_NAMES.join('|')})>([\\s\\S]*?)(</\\1>|$)`,
  'gi',
);

/** 是否包含思考标签的快速探测 */
const HAS_THINKING_TAG_PATTERN = new RegExp(`<(${THINKING_TAG_NAMES.join('|')})>`, 'i');

/** 思考/正文分离结果 */
export interface ThinkingSplitResult {
  thinking: string;
  content: string;
}

/**
 * 从累积响应文本中分离思考与正文
 * 流式过程中未闭合的思考标签：其后全部文本视为思考中
 * @param text 累积的完整响应文本
 * @returns 思考文本与正文文本（均去首尾空白）
 */
export function splitThinkingContent(text: string): ThinkingSplitResult {
  if (!HAS_THINKING_TAG_PATTERN.test(text)) return { thinking: '', content: text.trim() };

  let thinking = '';
  let content = '';
  let lastIndex = 0;
  for (const match of text.matchAll(THINKING_TAG_PATTERN)) {
    content += text.slice(lastIndex, match.index);
    thinking += match[2];
    lastIndex = match.index + match[0].length;
  }
  content += text.slice(lastIndex);
  return { thinking: thinking.trim(), content: content.trim() };
}

/**
 * 判断思考块是否仍在流式生成中（存在未闭合的思考标签）
 * @param text 累积的完整响应文本
 * @returns 思考是否仍在流式输出
 */
export function isThinkingStreaming(text: string): boolean {
  if (!HAS_THINKING_TAG_PATTERN.test(text)) return false;
  // 最后一个思考开标签位于最后一个闭标签之后 → 未闭合
  const lastOpen = findLastIndex(text, THINKING_TAG_PATTERN.source);
  const lastClose = findLastIndex(text, /<\/(?:think|thinking|reasoning)>/i.source);
  return lastOpen > lastClose;
}

/**
 * 查找模式在文本中的最后匹配位置
 * @param text 文本
 * @param source 正则源字符串
 * @returns 最后一次匹配的起始下标；无匹配返回 -1
 */
function findLastIndex(text: string, source: string): number {
  const pattern = new RegExp(source, 'gi');
  let last = -1;
  for (const match of text.matchAll(pattern)) {
    last = match.index;
  }
  return last;
}
