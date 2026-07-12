/**
 * DOM 宿主正文 ↔ message.mes 原文定位
 * 优先子串精确匹配，失败后规范空白/标点/markdown 噪声，再 seed+块尾与段落索引回退
 */

export interface HostLocateQuery {
  host: string;
  occurrence: number;
  paragraphIndex: number;
  siblingHosts: string[];
}

interface MappedText {
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
    locateByExactHost(raw, query.host, query.occurrence)
    ?? locateByNormalizedHost(raw, query.host, query.occurrence)
    ?? locateBySeedBlockEnd(raw, query.host, query.occurrence)
    ?? locateByParagraphIndex(raw, query.paragraphIndex, query.siblingHosts)
  );
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
 * @returns 映射表
 */
function mapNormalize(source: string): MappedText {
  const chars: string[] = [];
  const sourceEnd: number[] = [];
  let i = 0;
  while (i < source.length) {
    const cp = source.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    if (isMarkdownNoise(ch)) {
      i += width;
      continue;
    }
    if (cp === 0x2026) {
      pushMapped(chars, sourceEnd, '...', i + width);
      i += width;
      continue;
    }
    if ('“”„«»'.includes(ch)) {
      pushMapped(chars, sourceEnd, '"', i + width);
      i += width;
      continue;
    }
    if ("‘’‚′".includes(ch)) {
      pushMapped(chars, sourceEnd, "'", i + width);
      i += width;
      continue;
    }
    if (ch === '\r') {
      i += width;
      continue;
    }
    if (/\s/.test(ch)) {
      while (i < source.length && /\s/.test(source[i]!)) i += 1;
      if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
        pushMapped(chars, sourceEnd, ' ', i);
      }
      continue;
    }
    pushMapped(chars, sourceEnd, ch, i + width);
    i += width;
  }
  return trimMapped(chars, sourceEnd);
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
  while (start < end && chars[start] === ' ') start += 1;
  while (end > start && chars[end - 1] === ' ') end -= 1;
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
