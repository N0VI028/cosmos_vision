import type { PromptWorldbookSourceReference } from '@/constants/novelai';
import { getTavernHelper } from '@/services/tavern-helper/availability';

/** 已解析的外部来源条目 */
export interface ResolvedPromptSourceEntry {
  status: 'ready' | 'missing' | 'unsupported';
  title: string;
  content: string;
}

/** 世界书条目选项 */
export interface PromptWorldbookEntryOption {
  uid: number;
  name: string;
  content: string;
}

/** 世界书分组选项 */
export interface PromptWorldbookGroup {
  worldbookName: string;
  entries: PromptWorldbookEntryOption[];
}

/** 世界书条目解析选项 */
export interface PromptWorldbookResolveOptions {
  includeDisabled?: boolean;
  allowEmptyContent?: boolean;
}

/** 世界书分组读取选项 */
export type PromptWorldbookGroupReadOptions = PromptWorldbookResolveOptions;

const DEFAULT_WORLD_BOOK_RESOLVE_OPTIONS = {
  includeDisabled: true,
  allowEmptyContent: true,
} as const satisfies Required<PromptWorldbookResolveOptions>;

const worldbookRequestCache = new Map<string, Promise<TavernHelperWorldbookEntry[]>>();

/**
 * 获取全部世界书名称列表
 * @returns 世界书名称列表
 */
export function getPromptWorldbookNames(): string[] {
  const tavernHelper = getTavernHelper();
  return tavernHelper?.getWorldbookNames?.() ?? [];
}

/**
 * 获取全部世界书条目分组
 * @returns 世界书分组列表
 */
export async function getPromptWorldbookSourceOptions(): Promise<PromptWorldbookGroup[]> {
  return readPromptWorldbookGroups(getPromptWorldbookNames());
}

/**
 * 解析世界书来源条目
 * @param title 条目标题
 * @param reference 世界书引用
 * @returns 解析结果
 */
export async function resolvePromptWorldbookSourceEntry(
  title: string,
  reference: PromptWorldbookSourceReference,
  options: PromptWorldbookResolveOptions = DEFAULT_WORLD_BOOK_RESOLVE_OPTIONS,
): Promise<ResolvedPromptSourceEntry> {
  if (!reference.worldbookName || reference.entryUid === undefined) {
    return buildResolvedSourceEntry('missing', title, '');
  }
  try {
    const worldbook = await readPromptWorldbook(reference.worldbookName);
    const entry = worldbook.find(item => item.uid === reference.entryUid);
    if (!isPromptWorldbookEntryReadable(entry, options)) {
      return buildResolvedSourceEntry('missing', title, '');
    }
    return entry
      ? buildResolvedSourceEntry('ready', title, entry.content)
      : buildResolvedSourceEntry('missing', title, '');
  } catch {
    return buildResolvedSourceEntry('missing', title, '');
  }
}

/**
 * 查找世界书条目
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @param entryUid 条目 uid
 * @returns 世界书条目
 */
export function findPromptWorldbookEntry(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
  entryUid: number | null,
): PromptWorldbookEntryOption | undefined {
  return getPromptWorldbookEntries(worldbooks, worldbookName).find(entry => entry.uid === entryUid);
}

/**
 * 读取指定世界书下的条目列表
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @returns 条目列表
 */
export function getPromptWorldbookEntries(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
): PromptWorldbookEntryOption[] {
  return worldbooks.find(worldbook => worldbook.worldbookName === worldbookName)?.entries ?? [];
}

/**
 * 按名称列表读取世界书分组
 * @param worldbookNames 世界书名称列表
 * @returns 含有效条目的世界书分组
 */
export async function readPromptWorldbookGroups(worldbookNames: Array<string | null>): Promise<PromptWorldbookGroup[]> {
  return readPromptWorldbookGroupsWithOptions(worldbookNames, DEFAULT_WORLD_BOOK_RESOLVE_OPTIONS);
}

/**
 * 按名称列表读取世界书分组
 * @param worldbookNames 世界书名称列表
 * @param options 读取选项
 * @returns 含有效条目的世界书分组
 */
export async function readPromptWorldbookGroupsWithOptions(
  worldbookNames: Array<string | null>,
  options: PromptWorldbookGroupReadOptions,
): Promise<PromptWorldbookGroup[]> {
  const normalizedNames = Array.from(new Set(worldbookNames.filter(name => name?.trim()).map(name => name!.trim())));
  const worldbooks = await Promise.all(normalizedNames.map(worldbookName => readPromptWorldbookGroup(worldbookName, options)));
  return worldbooks.filter(Boolean) as PromptWorldbookGroup[];
}

/**
 * 读取单个世界书分组
 * @param worldbookName 世界书名称
 * @returns 世界书分组或 null
 */
async function readPromptWorldbookGroup(
  worldbookName: string,
  options: PromptWorldbookGroupReadOptions,
): Promise<PromptWorldbookGroup | null> {
  const entries = await readPromptWorldbook(worldbookName);
  const normalizedEntries = entries
    .filter(entry => isPromptWorldbookEntryReadable(entry, options))
    .map(entry => ({
    uid: entry.uid,
    name: entry.name?.trim() || `条目 ${entry.uid}`,
    content: entry.content?.trim() || '',
  }));
  return normalizedEntries.length ? { worldbookName, entries: normalizedEntries } : null;
}

/**
 * 构建解析结果对象
 * @param status 条目状态
 * @param title 条目标题
 * @param content 条目内容
 * @returns 解析结果
 */
export function buildResolvedSourceEntry(
  status: ResolvedPromptSourceEntry['status'],
  title: string,
  content: string,
): ResolvedPromptSourceEntry {
  return {
    status,
    title: title.trim() || '未命名条目',
    content: content.trim(),
  };
}

/**
 * 判断世界书条目是否可读取
 * @param entry 世界书条目
 * @param options 读取选项
 * @returns 是否可读取
 */
function isPromptWorldbookEntryReadable(
  entry: TavernHelperWorldbookEntry | undefined,
  options: PromptWorldbookResolveOptions,
): entry is TavernHelperWorldbookEntry {
  if (!entry) return false;
  const resolved = { ...DEFAULT_WORLD_BOOK_RESOLVE_OPTIONS, ...options };
  if (!resolved.includeDisabled && entry.enabled === false) return false;
  return resolved.allowEmptyContent || Boolean(entry.content?.trim());
}

/**
 * 读取世界书原始条目并在同轮复用请求
 * @param worldbookName 世界书名称
 * @returns 世界书原始条目
 */
function readPromptWorldbook(worldbookName: string): Promise<TavernHelperWorldbookEntry[]> {
  const normalizedName = worldbookName.trim();
  const cached = worldbookRequestCache.get(normalizedName);
  if (cached) return cached;
  const request = requirePromptWorldbookTavernHelper()
    .getWorldbook(normalizedName)
    .finally(() => worldbookRequestCache.delete(normalizedName));
  worldbookRequestCache.set(normalizedName, request);
  return request;
}

/**
 * 读取并确保 TavernHelper 可用
 * @returns 可安全调用的 TavernHelper
 */
function requirePromptWorldbookTavernHelper(): NonNullable<typeof TavernHelper> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用，无法读取世界书资料');
  }
  return tavernHelper;
}
