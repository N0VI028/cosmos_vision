import {
  getPromptPersonTemplateEntryKind,
  PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS,
  type PromptPersonTemplateEntry,
  type PromptPersonTemplateEntryKind,
} from '@/constants/novelai';
import type { ResolvedPromptPersonTemplateEntry } from '@/services/tavern-helper/prompt-profiles-sources';

/**
 * 获取条目类型
 * @param entry 模板条目
 * @returns 条目类型
 */
export function getPromptSourceEntryKind(entry: PromptPersonTemplateEntry): PromptPersonTemplateEntryKind {
  return getPromptPersonTemplateEntryKind(entry);
}

/**
 * 判断是否为自定义条目
 * @param entry 模板条目
 * @returns 是否为自定义条目
 */
export function isCustomPromptSourceEntry(entry: PromptPersonTemplateEntry): boolean {
  return getPromptSourceEntryKind(entry) === 'custom';
}

/**
 * 获取条目来源显示
 * @param entry 模板条目
 * @returns 来源标签
 */
export function getPromptSourceEntryLabel(entry: PromptPersonTemplateEntry): string {
  return PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS[getPromptSourceEntryKind(entry)] ?? '外部资料';
}

/**
 * 获取条目标题
 * @param entry 模板条目
 * @returns 列表标题
 */
export function getPromptSourceEntryTitle(entry: PromptPersonTemplateEntry): string {
  const title = entry.title.trim();
  if (title) return title;
  const content = entry.content.trim().replace(/\s+/g, ' ');
  if (!content) return '未命名条目';
  return content.length > 30 ? `${content.slice(0, 30)}...` : content;
}

/**
 * 获取外部资料状态文案
 * @param status 解析状态
 * @returns 状态文案
 */
export function getPromptSourceStatusText(status: ResolvedPromptPersonTemplateEntry['status']): string {
  if (status === 'ready') return '可用';
  if (status === 'unsupported') return '未接入';
  return '来源失效';
}

/**
 * 获取外部资料状态颜色
 * @param status 解析状态
 * @returns PrimeVue Tag severity
 */
export function getPromptSourceStatusSeverity(
  status: ResolvedPromptPersonTemplateEntry['status'],
): 'success' | 'warn' | 'danger' {
  if (status === 'ready') return 'success';
  if (status === 'unsupported') return 'warn';
  return 'danger';
}

/**
 * 获取解析结果的预览文本
 * @param resolved 解析结果
 * @returns 预览文本
 */
export function getPromptSourcePreviewText(resolved: ResolvedPromptPersonTemplateEntry | null): string {
  if (!resolved) return '正在读取资料...';
  if (resolved.status === 'ready') return resolved.content;
  if (resolved.status === 'unsupported') return '该资料来源本期仅保留占位';
  return '当前引用已失效，运行时会跳过该条目';
}
