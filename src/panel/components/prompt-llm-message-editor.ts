import {
  DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
} from '@/constants/default-settings';
import {
  getPromptLlmMessageEntryKind,
  PROMPT_LLM_MESSAGE_ENTRY_KIND_LABELS,
  type PromptLlmMessage,
  type PromptLlmMessageEntryKind,
  type PromptLlmMessageRole,
} from '@/constants/novelai';
import {
  findWorldbookEntry,
  pickWorldbookEntryUid,
  pickWorldbookName,
} from '@/panel/components/prompt-worldbook-source';
import {
  createCustomPromptLlmMessage,
  createPromptLlmWorldbookMessage,
} from '@/services/prompt-llm/message-source';
import type { PromptWorldbookGroup } from '@/services/tavern-helper/worldbook-sources';

/** 来源类型选项 */
export interface PromptLlmMessageSourceOption {
  label: string;
  value: PromptLlmMessageEntryKind;
}

/** LLM 条目编辑草稿 */
export interface PromptLlmMessageEditorDraft extends PromptLlmMessage {
  kind: PromptLlmMessageEntryKind;
  customTitle: string;
  customContent: string;
  selectedWorldbookName: string;
  selectedWorldbookEntryUid: number | null;
}

/**
 * 构建 LLM 来源类型选项
 * @param currentSource 当前来源
 * @returns 来源选项
 */
export function buildPromptLlmSourceOptions(
  currentSource?: PromptLlmMessageEntryKind,
): PromptLlmMessageSourceOption[] {
  const options = [
    createPromptLlmSourceOption('custom', '自定义'),
    createPromptLlmSourceOption('worldbook_entry', '世界书'),
  ];
  if (!currentSource || options.some(option => option.value === currentSource)) return options;
  return [...options, createPromptLlmSourceOption(currentSource, getPromptLlmSourceLabel(currentSource))];
}

/**
 * 创建 LLM 条目编辑草稿
 * @param message 原始条目
 * @param worldbooks 世界书列表
 * @returns 编辑草稿
 */
export function createPromptLlmMessageEditorDraft(
  message: PromptLlmMessage | undefined,
  worldbooks: PromptWorldbookGroup[],
): PromptLlmMessageEditorDraft {
  const nextMessage = _.cloneDeep(message ?? createCustomPromptLlmMessage('user'));
  const kind = getPromptLlmMessageEntryKind(nextMessage);
  const draft = {
    ...nextMessage,
    kind,
    customTitle: kind === 'custom' ? nextMessage.title : DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
    customContent: kind === 'custom' ? nextMessage.content : '',
    selectedWorldbookName: nextMessage.reference?.worldbookName ?? '',
    selectedWorldbookEntryUid: nextMessage.reference?.entryUid ?? null,
  };
  applyPromptLlmMessageDefaults(draft, worldbooks);
  return draft;
}

/**
 * 构建当前草稿的保存结果
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 * @returns 可写回消息
 */
export function buildSavedPromptLlmMessage(
  draft: PromptLlmMessageEditorDraft,
  worldbooks: PromptWorldbookGroup[],
): PromptLlmMessage {
  const message = buildPromptLlmMessageByKind(draft, worldbooks);
  message.enabled = draft.enabled !== false;
  return message;
}

/**
 * 同步草稿派生字段
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 */
export function syncPromptLlmMessageDraftFields(
  draft: PromptLlmMessageEditorDraft,
  worldbooks: PromptWorldbookGroup[],
): void {
  const message = buildSavedPromptLlmMessage(draft, worldbooks);
  draft.title = message.title;
  draft.content = message.content;
  draft.reference = _.cloneDeep(message.reference);
}

/**
 * 补齐当前来源默认选择
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 */
export function applyPromptLlmMessageDefaults(
  draft: PromptLlmMessageEditorDraft,
  worldbooks: PromptWorldbookGroup[],
): void {
  if (draft.kind !== 'worldbook_entry') return;
  draft.selectedWorldbookName = pickWorldbookName(worldbooks, draft.selectedWorldbookName);
  draft.selectedWorldbookEntryUid = pickWorldbookEntryUid(
    worldbooks,
    draft.selectedWorldbookName,
    draft.selectedWorldbookEntryUid,
  );
}

/**
 * 判断当前草稿是否可以保存
 * @param draft 编辑草稿
 * @returns 是否可保存
 */
export function canSavePromptLlmMessageDraft(draft: PromptLlmMessageEditorDraft): boolean {
  if (draft.kind === 'custom') return true;
  return Boolean(draft.selectedWorldbookName.trim() && draft.selectedWorldbookEntryUid !== null);
}

/**
 * 读取来源类型显示文案
 * @param kind 来源类型
 * @returns 来源名称
 */
export function getPromptLlmSourceLabel(kind: PromptLlmMessageEntryKind): string {
  return PROMPT_LLM_MESSAGE_ENTRY_KIND_LABELS[kind] ?? '外部资料';
}

/**
 * 创建来源选项
 * @param value 来源类型
 * @param label 显示名称
 * @returns 来源选项
 */
function createPromptLlmSourceOption(
  value: PromptLlmMessageEntryKind,
  label: string,
): PromptLlmMessageSourceOption {
  return { label, value };
}

/**
 * 按来源类型构建 LLM 条目
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 * @returns LLM 条目
 */
function buildPromptLlmMessageByKind(
  draft: PromptLlmMessageEditorDraft,
  worldbooks: PromptWorldbookGroup[],
): PromptLlmMessage {
  if (draft.kind === 'worldbook_entry') {
    return buildPromptLlmWorldbookMessage(draft, worldbooks);
  }
  return createCustomPromptLlmMessage(
    draft.role as PromptLlmMessageRole,
    draft.customTitle.trim() || DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
    draft.customContent,
    draft.id,
  );
}

/**
 * 构建世界书来源消息
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 * @returns 世界书消息
 */
function buildPromptLlmWorldbookMessage(
  draft: PromptLlmMessageEditorDraft,
  worldbooks: PromptWorldbookGroup[],
): PromptLlmMessage {
  const entry = findWorldbookEntry(worldbooks, draft.selectedWorldbookName, draft.selectedWorldbookEntryUid);
  const reference = { worldbookName: draft.selectedWorldbookName, entryUid: draft.selectedWorldbookEntryUid ?? -1 };
  return createPromptLlmWorldbookMessage(
    draft.role as PromptLlmMessageRole,
    reference,
    entry?.name ?? draft.title,
    draft.id,
  );
}
