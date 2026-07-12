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
  return text.includes(encodeSlotShortcode(slotId));
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
  const code = encodeSlotShortcode(slotId);
  return raw.split(code).join('');
}

/**
 * 在 raw 的指定偏移处定点附加一枚短码（已有同 slot 则 no-op）
 * @param raw 消息 raw
 * @param at 插入偏移（end-exclusive of host）
 * @param slotId 位点 id
 * @returns 写入后的 raw
 */
export function appendSlotShortcodeAt(raw: string, at: number, slotId: string): string {
  if (hasSlotShortcode(raw, slotId)) return raw;
  if (!Number.isInteger(at) || at < 0 || at > raw.length) {
    throw new Error('短码插入偏移无效，无法绑定短码');
  }
  const insert = encodeSlotShortcode(slotId);
  const next = `${raw.slice(0, at)}${insert}${raw.slice(at)}`;
  assertBodyUnchanged(raw, next);
  return next;
}

/**
 * 校验定点写 raw 后剥离短码的正文不变
 * @param before 写前 raw
 * @param after 写后 raw
 */
function assertBodyUnchanged(before: string, after: string): void {
  if (stripSlotShortcodes(before) !== stripSlotShortcodes(after)) {
    throw new Error('短码写入校验失败：正文发生了非预期变更');
  }
}
