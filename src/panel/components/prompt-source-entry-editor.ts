import {
  getPromptPersonTemplateEntryKind,
  normalizePromptPersonTemplateEntryId,
  PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS,
  type PromptPersonKind,
  type PromptPersonTemplateEntry,
  type PromptPersonTemplateEntryKind,
} from '@/constants/novelai';
import { createCustomPromptPersonTemplateEntry } from '@/services/prompt-profiles/runtime';
import {
  createPromptPersonCharacterDescriptionEntry,
  createPromptPersonCharacterWorldbookEntry,
  createPromptPersonUserPersonaEntry,
  type PromptPersonWorldbookGroup,
} from '@/services/tavern-helper/prompt-profiles-sources';
import { findPromptWorldbookEntry } from '@/services/tavern-helper/worldbook-sources';
import {
  pickWorldbookEntryUid,
  pickWorldbookName,
} from '@/panel/components/prompt-worldbook-source';

/** 弹窗来源选项 */
export interface EntrySourceOption {
  label: string;
  value: PromptPersonTemplateEntryKind;
}

/** 普通下拉选项 */
export interface SelectOption<TValue extends string | number> {
  label: string;
  value: TValue;
}

/** 模板条目编辑草稿 */
export interface PromptSourceEditorDraft extends PromptPersonTemplateEntry {
  kind: PromptPersonTemplateEntryKind;
  customTitle: string;
  customContent: string;
  selectedCharacterName: string;
  selectedPersonaKey: string;
  selectedWorldbookName: string;
  selectedWorldbookEntryUid: number | null;
}

interface SourceEditorDefaults {
  characterName: string;
  personaKey: string;
}

interface SourceSelectDefaults {
  characterOptions: Array<SelectOption<string>>;
  personaOptions: Array<SelectOption<string>>;
}

type SourceEntryBuilder = (
  draft: PromptSourceEditorDraft,
  worldbooks: PromptPersonWorldbookGroup[],
) => PromptPersonTemplateEntry;

/**
 * 构建来源类型选项
 * @param kind 人物类型
 * @param currentSource 当前来源
 * @returns 来源类型列表
 */
export function buildSourceOptions(
  _kind: PromptPersonKind,
  currentSource?: PromptPersonTemplateEntryKind,
): EntrySourceOption[] {
  const options = [
    createSourceOption('custom', '自定义'),
    createSourceOption('character_description', '角色描述'),
    createSourceOption('user_persona', '用户人设'),
    createSourceOption('character_worldbook_entry', '世界书'),
  ];
  if (!currentSource || options.some(option => option.value === currentSource)) return options;
  return [...options, createSourceOption(currentSource, getSourceTypeLabel(currentSource))];
}

/**
 * 创建模板条目编辑草稿
 * @param entry 现有模板条目
 * @param defaults 默认选择
 * @param worldbooks 世界书列表
 * @returns 编辑草稿
 */
export function createSourceEditorDraft(
  entry: PromptPersonTemplateEntry | undefined,
  defaults: SourceEditorDefaults,
  worldbooks: PromptPersonWorldbookGroup[],
): PromptSourceEditorDraft {
  const nextEntry = _.cloneDeep(entry ?? createCustomPromptPersonTemplateEntry());
  const nextSource = getPromptPersonTemplateEntryKind(nextEntry);
  const draft = {
    ...nextEntry,
    kind: nextSource,
    customTitle: nextSource === 'custom' ? nextEntry.title : '自定义条目',
    customContent: nextSource === 'custom' ? nextEntry.content : '',
    selectedCharacterName: nextEntry.reference?.characterName ?? defaults.characterName.trim(),
    selectedPersonaKey:
      nextEntry.reference?.personaId ?? nextEntry.reference?.personaName ?? defaults.personaKey.trim(),
    selectedWorldbookName: nextEntry.reference?.worldbookName ?? '',
    selectedWorldbookEntryUid: nextEntry.reference?.entryUid ?? null,
  };
  applySourceDefaults(draft, { characterOptions: [], personaOptions: [] }, worldbooks);
  return draft;
}

/**
 * 构建当前草稿的保存结果
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 * @returns 可写回列表的模板条目
 */
export function buildSavedPromptSourceEntry(
  draft: PromptSourceEditorDraft,
  worldbooks: PromptPersonWorldbookGroup[],
): PromptPersonTemplateEntry {
  return { ...SOURCE_ENTRY_BUILDERS[draft.kind](draft, worldbooks), enabled: draft.enabled };
}

/**
 * 同步草稿派生字段
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 */
export function syncDraftEntryFields(draft: PromptSourceEditorDraft, worldbooks: PromptPersonWorldbookGroup[]): void {
  const entry = buildSavedPromptSourceEntry(draft, worldbooks);
  draft.title = entry.title;
  draft.content = entry.content;
  draft.reference = _.cloneDeep(entry.reference);
}

/**
 * 补齐当前来源默认选择
 * @param draft 编辑草稿
 * @param defaults 下拉默认选项
 * @param worldbooks 世界书列表
 */
export function applySourceDefaults(
  draft: PromptSourceEditorDraft,
  defaults: SourceSelectDefaults,
  worldbooks: PromptPersonWorldbookGroup[],
): void {
  SOURCE_DEFAULT_APPLIERS[draft.kind]?.(draft, defaults, worldbooks);
}

/**
 * 判断当前草稿是否可以保存
 * @param draft 编辑草稿
 * @returns 是否可保存
 */
export function canSaveSourceEditor(draft: PromptSourceEditorDraft): boolean {
  return SOURCE_SAVE_VALIDATORS[draft.kind](draft);
}

/**
 * 构建文本下拉选项
 * @param values 候选文本
 * @returns 下拉选项
 */
export function buildTextSelectOptions(values: string[]): Array<SelectOption<string>> {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).map(value => ({ label: value, value }));
}

/**
 * 创建来源类型选项
 * @param value 来源类型
 * @param label 显示名称
 * @returns 来源类型选项
 */
function createSourceOption(value: PromptPersonTemplateEntryKind, label: string): EntrySourceOption {
  return { label, value };
}

/**
 * 构建自定义条目
 * @param draft 编辑草稿
 * @returns 自定义模板条目
 */
function buildCustomEntry(draft: PromptSourceEditorDraft): PromptPersonTemplateEntry {
  return {
    ...createCustomPromptPersonTemplateEntry(draft.customTitle.trim() || '自定义条目', draft.customContent),
    id: normalizePromptPersonTemplateEntryId(draft.id, 'custom'),
  };
}

/**
 * 构建角色描述条目
 * @param draft 编辑草稿
 * @returns 角色描述模板条目
 */
function buildCharacterDescriptionEntry(draft: PromptSourceEditorDraft): PromptPersonTemplateEntry {
  return createPromptPersonCharacterDescriptionEntry(draft.selectedCharacterName, draft.id);
}

/**
 * 构建用户人设 条目
 * @param draft 编辑草稿
 * @returns 用户人设 模板条目
 */
function buildUserPersonaEntry(draft: PromptSourceEditorDraft): PromptPersonTemplateEntry {
  return createPromptPersonUserPersonaEntry(draft.selectedPersonaKey, draft.selectedPersonaKey, draft.id);
}

/**
 * 构建世界书条目
 * @param draft 编辑草稿
 * @param worldbooks 世界书列表
 * @returns 世界书模板条目
 */
function buildWorldbookEntry(
  draft: PromptSourceEditorDraft,
  worldbooks: PromptPersonWorldbookGroup[],
): PromptPersonTemplateEntry {
  const entry = findPromptWorldbookEntry(worldbooks, draft.selectedWorldbookName, draft.selectedWorldbookEntryUid);
  const reference = { worldbookName: draft.selectedWorldbookName, entryUid: draft.selectedWorldbookEntryUid ?? -1 };
  return createPromptPersonCharacterWorldbookEntry(reference, entry?.name ?? draft.title, draft.id);
}

/**
 * 补齐角色卡默认选择
 * @param draft 编辑草稿
 * @param defaults 下拉默认选项
 */
function applyCharacterDefaults(draft: PromptSourceEditorDraft, defaults: SourceSelectDefaults): void {
  draft.selectedCharacterName ||= defaults.characterOptions[0]?.value ?? '';
}

/**
 * 补齐 persona 默认选择
 * @param draft 编辑草稿
 * @param defaults 下拉默认选项
 */
function applyPersonaDefaults(draft: PromptSourceEditorDraft, defaults: SourceSelectDefaults): void {
  draft.selectedPersonaKey ||= defaults.personaOptions[0]?.value ?? '';
}

/**
 * 补齐世界书默认选择
 * @param draft 编辑草稿
 * @param defaults 下拉默认选项
 * @param worldbooks 世界书列表
 */
function applyWorldbookDefaults(
  draft: PromptSourceEditorDraft,
  _defaults: SourceSelectDefaults,
  worldbooks: PromptPersonWorldbookGroup[],
): void {
  draft.selectedWorldbookName = pickWorldbookName(worldbooks, draft.selectedWorldbookName);
  draft.selectedWorldbookEntryUid = pickWorldbookEntryUid(
    worldbooks,
    draft.selectedWorldbookName,
    draft.selectedWorldbookEntryUid,
  );
}

/**
 * 获取来源类型显示
 * @param source 来源类型
 * @returns 来源类型名称
 */
function getSourceTypeLabel(source: PromptPersonTemplateEntryKind): string {
  return PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS[source] ?? '外部资料';
}

const SOURCE_SAVE_VALIDATORS: Record<PromptPersonTemplateEntryKind, (draft: PromptSourceEditorDraft) => boolean> = {
  custom: () => true,
  character_description: draft => Boolean(draft.selectedCharacterName.trim()),
  character_worldbook_entry: draft =>
    Boolean(draft.selectedWorldbookName.trim() && draft.selectedWorldbookEntryUid !== null),
  user_persona: draft => Boolean(draft.selectedPersonaKey.trim()),
};

const SOURCE_DEFAULT_APPLIERS: Partial<
  Record<
    PromptPersonTemplateEntryKind,
    (draft: PromptSourceEditorDraft, defaults: SourceSelectDefaults, worldbooks: PromptPersonWorldbookGroup[]) => void
  >
> = {
  character_description: applyCharacterDefaults,
  character_worldbook_entry: applyWorldbookDefaults,
  user_persona: applyPersonaDefaults,
};

const SOURCE_ENTRY_BUILDERS: Record<PromptPersonTemplateEntryKind, SourceEntryBuilder> = {
  custom: buildCustomEntry,
  character_description: buildCharacterDescriptionEntry,
  character_worldbook_entry: buildWorldbookEntry,
  user_persona: buildUserPersonaEntry,
};
