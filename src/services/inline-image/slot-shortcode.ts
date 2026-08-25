/** 段落位点短码：一 gallery / slot 一枚 `⟦cv:slotId⟧` */

export const SLOT_ID_PATTERN = '[a-z0-9]{8,12}';
export const SLOT_SHORTCODE_SOURCE = `⟦cv:(${SLOT_ID_PATTERN})⟧`;
export const SLOT_SHORTCODE_GLOBAL = new RegExp(SLOT_SHORTCODE_SOURCE, 'g');
export const SLOT_SHORTCODE_SINGLE = new RegExp(`^${SLOT_SHORTCODE_SOURCE}$`);
export const SLOT_ID_ONLY = new RegExp(`^${SLOT_ID_PATTERN}$`);

/**
 * 生成新的段落位点 slotId
 * @returns 8 位小写十六进制 id
 */
export function newSlotId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 编码 slot 短码
 * @param slotId 位点 id
 * @returns `⟦cv:slotId⟧`
 */
export function encodeSlotShortcode(slotId: string): string {
  if (!SLOT_ID_ONLY.test(slotId)) throw new Error(`非法 slotId: ${slotId}`);
  return `⟦cv:${slotId}⟧`;
}

/**
 * 判断文本是否已包含指定 slot 短码
 * @param text 原始文本
 * @param slotId 位点 id
 * @returns 是否已有该短码
 */
export function hasSlotShortcode(text: string, slotId: string): boolean {
  return listRawLines(text).some(line => line.trim() === encodeSlotShortcode(slotId));
}

/**
 * 解析独立短码行
 * @param text 待解析文本
 * @returns slotId 或 null
 */
export function parseSlotMarkerLine(text: string): string | null {
  return text.trim().match(SLOT_SHORTCODE_SINGLE)?.[1] ?? null;
}

/**
 * 解析文本中全部 slot 短码 id（去重保序）
 * @param text 原始文本
 * @returns slotId 列表
 */
export function parseSlotIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(new RegExp(SLOT_SHORTCODE_SOURCE, 'g'))) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 解析文本中首个 slot 短码 id
 * @param text 原始文本
 * @returns 首个 slotId 或 null
 */
export function parseFirstSlotId(text: string): string | null {
  return parseSlotIds(text)[0] ?? null;
}

/**
 * 解析文本起始处紧邻的 slot 短码 id
 * @param text 原始文本
 * @returns 起始 slotId 或 null
 */
export function parseLeadingSlotId(text: string): string | null {
  return text.match(new RegExp(`^${SLOT_SHORTCODE_SOURCE}`))?.[1] ?? null;
}

/**
 * 剥离全部段落生图短码
 * @param text 原始文本
 * @returns 剥离后的正文
 */
export function stripSlotShortcodes(text: string): string {
  return text.replace(new RegExp(SLOT_SHORTCODE_SOURCE, 'g'), '');
}

/**
 * 从 raw 中去掉指定 slot 短码（全部出现）
 * @param raw 消息 raw
 * @param slotId 位点 id
 * @returns 去掉后的 raw
 */
export function removeSlotShortcode(raw: string, slotId: string): string {
  const newline = readLineBreak(raw);
  const escapedNewline = escapeRegExp(newline);
  const code = escapeRegExp(encodeSlotShortcode(slotId));
  const leading = new RegExp(`^[\\t ]*${code}[\\t ]*${escapedNewline}?`);
  const middleOrEnd = new RegExp(`${escapedNewline}{1,2}[\\t ]*${code}[\\t ]*(?=${escapedNewline}|$)`, 'g');
  return raw.replace(leading, '').replace(middleOrEnd, '');
}
/**
 * 转义正则字面量
 * @param value 原始文本
 * @returns 可安全拼入正则的文本
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在 raw 的指定偏移处定点附加一枚短码（已有同 slot 则 no-op）
 * @param raw 消息 raw
 * @param at 插入偏移（end-exclusive of host）
 * @param slotId 位点 id
 * @returns 写入后的 raw
 */
export function appendSlotShortcodeAt(raw: string, at: number, slotId: string): string {
  if (hasSlotShortcode(raw, slotId)) {
    return raw;
  }
  if (!Number.isInteger(at) || at < 0 || at > raw.length) {
    throw new Error('短码插入偏移无效，无法绑定短码');
  }
  const insert = buildMarkerInsertion(raw, at, slotId);
  const next = `${raw.slice(0, at)}${insert}${raw.slice(at)}`;
  assertBodyPreserved(raw, next, at, insert.length);
  return next;
}

/**
 * 构建宿主后的独立短码行
 * @param raw 消息原文
 * @param at 宿主尾部偏移
 * @param slotId 位点 id
 * @returns 带必要换行的短码块
 */
function buildMarkerInsertion(raw: string, at: number, slotId: string): string {
  const newline = readLineBreak(raw);
  const before = raw.slice(0, at);
  const after = raw.slice(at);
  const prefix = before.endsWith(newline) ? newline : `${newline}${newline}`;
  const suffix = readMarkerSuffix(after, newline);
  return `${prefix}${encodeSlotShortcode(slotId)}${suffix}`;
}

/**
 * 计算 marker 后所需分隔换行
 * @param after 插入点后的原文
 * @param newline 换行符
 * @returns 后缀换行
 */
function readMarkerSuffix(after: string, newline: string): string {
  if (!after) return '';
  if (after.startsWith(`${newline}${newline}`)) return '';
  return after.startsWith(newline) ? newline : `${newline}${newline}`;
}

/**
 * 按原文换行风格拆行
 * @param raw 消息原文
 * @returns 行列表
 */
function listRawLines(raw: string): string[] {
  return raw.split(/\r?\n/);
}

/**
 * 读取原文换行风格
 * @param raw 消息原文
 * @returns 换行符
 */
function readLineBreak(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * 校验定点写入未改动原文两侧字符
 * @param before 写前 raw
 * @param after 写后 raw
 * @param at 插入偏移
 * @param insertedLength 插入长度
 */
function assertBodyPreserved(before: string, after: string, at: number, insertedLength: number): void {
  const restored = `${after.slice(0, at)}${after.slice(at + insertedLength)}`;
  if (restored !== before) {
    throw new Error('短码写入校验失败：正文发生了非预期变更');
  }
}
