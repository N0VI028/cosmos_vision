import type { WdTagResult } from '@/services/wd-tagger/types';

/**
 * 将 WD 分类标签合并为可编辑草稿
 * @param result WD Tagger 标签结果
 * @returns 逗号分隔且去重的标签草稿
 */
export function formatWdTagDraft(result: WdTagResult): string {
  const labels = [...result.generalTags, ...result.characterTags].map(tag => tag.label);
  return Array.from(new Set(labels)).join(', ');
}

/**
 * 追加固定 tag，并保持单个逗号分隔
 * @param current 当前固定 tag
 * @param draft 用户确认的草稿
 * @returns 规范化后的固定 tag
 */
export function appendStaticTags(current: string, draft: string): string {
  const base = current.trim().replace(/,\s*$/, '');
  const addition = draft.trim().replace(/^,\s*/, '');
  if (!base) return addition;
  if (!addition) return base;
  return `${base}, ${addition}`;
}
