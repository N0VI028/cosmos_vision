/**
 * DOM 宿主正文 ↔ message.mes 原文定位
 * 优先子串精确匹配，失败后规范噪声、识别正则删文，再按 seed 与段落索引回退
 */

const MIN_DELETION_COVERAGE = 0.35;
const MIN_DELETION_MATCH_LENGTH = 16;

export interface HostLocateQuery {
  host: string;
  occurrence: number;
  paragraphIndex: number;
  siblingHosts: string[];
}

export interface MappedText {
  normalized: string;
  /** normalized[i] 对应源串 end-exclusive 偏移 */
  sourceEnd: number[];
}

interface RawBlock {
  text: string;
  start: number;
  end: number;
}

/**
 * 在 raw 中定位 host 尾部插入点（end-exclusive）
 * @param raw 消息 mes 原文
 * @param query 宿主查询
 * @returns 插入偏移，找不到返回 null
 */
export function locateHostEndInRaw(raw: string, query: HostLocateQuery): number | null {
  return (
    locateByDirectHost(raw, query.host, query.occurrence)
    ?? locateByTransformedHost(raw, query.host, query.occurrence)
    ?? locateByParagraphIndex(raw, query.paragraphIndex, query.siblingHosts)
  );
}

/**
 * 使用连续正文匹配宿主
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 宿主尾部偏移或 null
 */
function locateByDirectHost(raw: string, host: string, occurrence: number): number | null {
  return locateByExactHost(raw, host, occurrence) ?? locateByNormalizedHost(raw, host, occurrence);
}

/**
 * 使用正则变形后的正文匹配宿主
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 原始段落尾部偏移或 null
 */
function locateByTransformedHost(raw: string, host: string, occurrence: number): number | null {
  return locateByOrderedDeletion(raw, host, occurrence) ?? locateBySeedBlockEnd(raw, host, occurrence);
}

/**
 * 将正则删文后的 DOM 文本按有序子序列匹配回 raw 段落
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 原始段落尾部偏移或 null
 */
function locateByOrderedDeletion(raw: string, host: string, occurrence: number): number | null {
  const hostNorm = mapNormalize(host).normalized;
  if (hostNorm.length < MIN_DELETION_MATCH_LENGTH) return null;
  const candidates = splitRawBlocks(raw).filter(block => {
    const blockNorm = mapNormalize(block.text).normalized;
    return isHighConfidenceDeletionMatch(hostNorm, blockNorm);
  });
  return candidates[occurrence]?.end ?? null;
}

/**
 * 判断宿主是否是原段落删文后的高置信结果
 * @param hostNorm 规范化宿主文本
 * @param blockNorm 规范化 raw 段落
 * @returns 是否满足保留比例与有序匹配
 */
function isHighConfidenceDeletionMatch(hostNorm: string, blockNorm: string): boolean {
  if (!blockNorm || hostNorm.length / blockNorm.length < MIN_DELETION_COVERAGE) return false;
  return isOrderedSubsequence(hostNorm, blockNorm);
}

/**
 * 判断 needle 的全部字符是否在 haystack 中保持原顺序
 * @param needle 待匹配文本
 * @param haystack 原始文本
 * @returns 是否为有序子序列
 */
function isOrderedSubsequence(needle: string, haystack: string): boolean {
  let needleIndex = 0;
  for (const char of haystack) {
    if (char === needle[needleIndex]) needleIndex += 1;
    if (needleIndex === needle.length) return true;
  }
  return false;
}

/**
 * 按 host 原文子串定位第 n 次出现的尾部
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 尾部偏移或 null
 */
function locateByExactHost(raw: string, host: string, occurrence: number): number | null {
  if (!host) return null;
  return findNthEnd(raw, host, occurrence);
}

/**
 * 规范化后定位完整 host，并映射回源串偏移
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 尾部偏移或 null
 */
function locateByNormalizedHost(raw: string, host: string, occurrence: number): number | null {
  if (!host) return null;
  const rawMap = mapNormalize(raw);
  const hostNorm = mapNormalize(host).normalized;
  if (!hostNorm) return null;
  const endNorm = findNthEnd(rawMap.normalized, hostNorm, occurrence);
  if (endNorm === null || endNorm <= 0) return null;
  return rawMap.sourceEnd[endNorm - 1] ?? null;
}

/**
 * 用 host 前缀 seed 命中后扩展到所属双换行块尾
 * @param raw 原文
 * @param host 宿主正文
 * @param occurrence 0-based
 * @returns 块尾偏移或 null
 */
function locateBySeedBlockEnd(raw: string, host: string, occurrence: number): number | null {
  const hostNorm = mapNormalize(host).normalized;
  if (hostNorm.length < 16) return null;
  const rawMap = mapNormalize(raw);
  const seedLen = Math.min(48, hostNorm.length);
  const seed = hostNorm.slice(0, seedLen);
  const endSeedNorm = findNthEnd(rawMap.normalized, seed, occurrence);
  if (endSeedNorm === null) return null;
  const seedStartNorm = endSeedNorm - seedLen;
  const sourcePos = seedStartNorm > 0
    ? rawMap.sourceEnd[seedStartNorm - 1]!
    : (rawMap.sourceEnd[0] ?? 0) - 1;
  const blocks = splitRawBlocks(raw);
  const block = blocks.find(item => sourcePos >= item.start && sourcePos < item.end);
  return block?.end ?? null;
}

/**
 * 按 DOM 段落序回退到 raw 双换行段落尾部
 * @param raw 原文
 * @param paragraphIndex 消息内 p 序
 * @param siblingHosts DOM 各段正文
 * @returns 尾部偏移或 null
 */
function locateByParagraphIndex(
  raw: string,
  paragraphIndex: number,
  siblingHosts: string[],
): number | null {
  const blocks = splitRawBlocks(raw);
  if (!blocks.length || paragraphIndex < 0) return null;
  if (paragraphIndex < blocks.length && blocks.length === siblingHosts.length) {
    return blocks[paragraphIndex]!.end;
  }
  const targetNorm = mapNormalize(siblingHosts[paragraphIndex] ?? '').normalized;
  if (!targetNorm) return null;
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    const score = similarityScore(targetNorm, mapNormalize(blocks[i]!.text).normalized);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestScore < 0.35) return null;
  return blocks[bestIdx]!.end;
}

/**
 * 查找 needle 第 n 次出现的 end-exclusive 偏移
 * @param haystack 被搜索串
 * @param needle 子串
 * @param occurrence 0-based
 * @returns 尾部偏移或 null
 */
function findNthEnd(haystack: string, needle: string, occurrence: number): number | null {
  if (!needle) return null;
  let from = 0;
  let found = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return null;
    if (found === occurrence) return index + needle.length;
    found += 1;
    from = index + needle.length;
  }
  return null;
}

/**
 * 将原文按双换行切成块（保留源偏移）
 * @param raw 消息原文
 * @returns 非空块列表
 */
function splitRawBlocks(raw: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const parts = raw.split(/(\n\s*\n)/);
  let offset = 0;
  for (const part of parts) {
    const start = offset;
    const end = offset + part.length;
    offset = end;
    if (/^\n\s*\n$/.test(part) || !part.trim()) continue;
    const trailed = part.length - part.trimEnd().length;
    blocks.push({ text: part, start, end: end - trailed });
  }
  return blocks;
}

/**
 * 构造规范化串及每个字符对应的源 end 偏移
 * @param source 源文本
 * @param preserveNewlines 是否保留换行
 * @returns 映射表
 */
export function mapNormalize(source: string, preserveNewlines = false): MappedText {
  const chars: string[] = [];
  const sourceEnd: number[] = [];
  let i = 0;
  while (i < source.length) {
    const cp = source.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    if (isMarkdownNoise(ch) || ch === '\r') {
      i += width;
      continue;
    }
    const special = normalizeSpecialChar(ch, cp);
    if (special) {
      pushMapped(chars, sourceEnd, special, i + width);
      i += width;
      continue;
    }
    if (preserveNewlines && ch === '\n') {
      i = consumeNewlines(source, i, chars, sourceEnd);
      continue;
    }
    if (/\s/.test(ch)) {
      i = consumeWhitespace(source, i, chars, sourceEnd, preserveNewlines);
      continue;
    }
    pushMapped(chars, sourceEnd, ch, i + width);
    i += width;
  }
  return trimMapped(chars, sourceEnd);
}

/**
 * 规范化标点与省略号等特殊字符
 * @param ch 字符
 * @param cp 代码点
 * @returns 规范化后的字符或 null
 */
function normalizeSpecialChar(ch: string, cp: number): string | null {
  if (cp === 0x2026) return '...';
  if ('“”„«»'.includes(ch)) return '"';
  if ("‘’‚′".includes(ch)) return "'";
  return null;
}

/**
 * 消费连续换行与环绕空白
 * @param source 源串
 * @param start 起始位置
 * @param chars 字符数组
 * @param sourceEnd 偏移数组
 * @returns 新位置
 */
function consumeNewlines(source: string, start: number, chars: string[], sourceEnd: number[]): number {
  let i = start;
  while (i < source.length && /[\r\n\t ]/.test(source[i]!)) i += 1;
  if (chars.length > 0 && chars[chars.length - 1] !== '\n') {
    pushMapped(chars, sourceEnd, '\n', i);
  }
  return i;
}

/**
 * 消费空白字符并合并为单个空格
 * @param source 源串
 * @param start 起始位置
 * @param chars 字符数组
 * @param sourceEnd 偏移数组
 * @param preserveNewlines 是否保留换行模式
 * @returns 新位置
 */
function consumeWhitespace(
  source: string,
  start: number,
  chars: string[],
  sourceEnd: number[],
  preserveNewlines: boolean,
): number {
  let i = start;
  const pattern = preserveNewlines ? /[ \t]/ : /\s/;
  while (i < source.length && pattern.test(source[i]!)) i += 1;
  const last = chars[chars.length - 1];
  if (chars.length > 0 && last !== ' ' && last !== '\n') {
    pushMapped(chars, sourceEnd, ' ', i);
  }
  return i;
}

/**
 * 推入规范化字符并记录源 end
 * @param chars 字符数组
 * @param sourceEnd 偏移数组
 * @param chunk 写入内容
 * @param end 源 end-exclusive
 */
function pushMapped(chars: string[], sourceEnd: number[], chunk: string, end: number): void {
  for (const unit of chunk) {
    chars.push(unit);
    sourceEnd.push(end);
  }
}

/**
 * 去掉规范化首尾空格并同步偏移
 * @param chars 字符
 * @param sourceEnd 偏移
 * @returns 映射表
 */
function trimMapped(chars: string[], sourceEnd: number[]): MappedText {
  let start = 0;
  let end = chars.length;
  while (start < end && /\s/.test(chars[start]!)) start += 1;
  while (end > start && /\s/.test(chars[end - 1]!)) end -= 1;
  return {
    normalized: chars.slice(start, end).join(''),
    sourceEnd: sourceEnd.slice(start, end),
  };
}

/**
 * 是否为 match 时需忽略的 markdown 噪声字符
 * @param ch 单字符
 * @returns 是否噪声
 */
function isMarkdownNoise(ch: string): boolean {
  return ch === '*' || ch === '_' || ch === '~' || ch === '`' || ch === '>' || ch === '\\';
}

/**
 * 粗略相似度：公共前缀 / 包含 / seed 命中
 * @param a 规范化串 A
 * @param b 规范化串 B
 * @returns 0~1
 */
function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const limit = Math.min(a.length, b.length, 64);
  let same = 0;
  while (same < limit && a[same] === b[same]) same += 1;
  const prefix = same / Math.max(a.length, b.length);
  const seed = a.slice(0, Math.min(24, a.length));
  const hit = seed && b.includes(seed) ? 0.5 : 0;
  return Math.max(prefix, hit);
}
