import type { PromptWorldbookEntryOption, PromptWorldbookGroup } from '@/services/tavern-helper/worldbook-sources';
import { findPromptWorldbookEntry, getPromptWorldbookEntries } from '@/services/tavern-helper/worldbook-sources';

/**
 * 构建世界书下拉选项
 * @param worldbooks 世界书列表
 * @param currentName 当前世界书名称
 * @returns 世界书选项
 */
export function buildWorldbookOptions(
  worldbooks: PromptWorldbookGroup[],
  currentName = '',
): Array<{ label: string; value: string }> {
  const options = worldbooks.map(worldbook => ({
    label: worldbook.worldbookName,
    value: worldbook.worldbookName,
  }));
  const isMissing = currentName.trim() && !worldbooks.some(wb => wb.worldbookName === currentName);
  return isMissing ? [{ label: `已失效：${currentName}`, value: currentName }, ...options] : options;
}

/**
 * 构建世界书条目下拉选项
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @param currentUid 当前条目 uid
 * @returns 条目选项
 */
export function buildWorldbookEntryOptions(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
  currentUid: number | null = null,
): Array<{ label: string; value: number }> {
  const entries = getPromptWorldbookEntries(worldbooks, worldbookName);
  const options = entries.map(entry => ({ label: entry.name, value: entry.uid }));
  const isMissing = currentUid !== null && !entries.some(e => e.uid === currentUid);
  return isMissing ? [{ label: `已失效：条目 ${currentUid}`, value: currentUid }, ...options] : options;
}

/**
 * 选择有效世界书
 * @param worldbooks 世界书列表
 * @param currentName 当前世界书名称
 * @returns 可用世界书名称
 */
export function pickWorldbookName(worldbooks: PromptWorldbookGroup[], currentName: string): string {
  return currentName.trim() || (worldbooks[0]?.worldbookName ?? '');
}

/**
 * 选择有效世界书条目
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @param currentUid 当前条目 uid
 * @returns 可用条目 uid
 */
export function pickWorldbookEntryUid(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
  currentUid: number | null,
): number | null {
  if (currentUid !== null) return currentUid;
  const entries = getPromptWorldbookEntries(worldbooks, worldbookName);
  return entries[0]?.uid ?? null;
}

/**
 * 查找世界书条目
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @param entryUid 条目 uid
 * @returns 世界书条目
 */
export function findWorldbookEntry(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
  entryUid: number | null,
): PromptWorldbookEntryOption | undefined {
  return findPromptWorldbookEntry(worldbooks, worldbookName, entryUid);
}

/**
 * 判断世界书引用是否已失效
 * @param worldbooks 世界书列表
 * @param worldbookName 世界书名称
 * @param entryUid 条目 uid
 * @returns 是否失效
 */
export function isWorldbookReferenceMissing(
  worldbooks: PromptWorldbookGroup[],
  worldbookName: string,
  entryUid: number | null,
): boolean {
  const hasName = Boolean(worldbookName.trim());
  const hasUid = entryUid !== null;
  if (!hasName && !hasUid) return false;
  if (!hasName || !hasUid) return true;
  const entries = getPromptWorldbookEntries(worldbooks, worldbookName);
  const nameExists = worldbooks.some(wb => wb.worldbookName === worldbookName.trim());
  return !nameExists || !entries.some(e => e.uid === entryUid);
}

/**
 * 获取世界书引用在编辑器中的标题展示
 * @param title 当前标题
 * @param missing 当前引用是否失效
 * @returns 用于 UI 展示的标题
 */
export function getWorldbookReferenceDisplayTitle(title: string, missing: boolean): string {
  const normalizedTitle = title.trim() || '世界书条目';
  return missing ? `已失效：${normalizedTitle}` : normalizedTitle;
}
