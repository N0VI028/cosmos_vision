import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  getPromptPersonTemplateEntryKind,
  normalizePromptPersonTemplateEntryId,
  type PromptPersonSourceReference,
  type PromptPersonTemplateEntry,
  type PromptPersonTemplateEntryKind,
} from '@/constants/novelai';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import {
  buildResolvedSourceEntry,
  getPromptWorldbookNames,
  readPromptWorldbookGroupsWithOptions,
  resolvePromptWorldbookSourceEntry,
  type PromptWorldbookGroup,
  type ResolvedPromptSourceEntry,
} from '@/services/tavern-helper/worldbook-sources';

/** 已解析的人物模板条目 */
export type ResolvedPromptPersonTemplateEntry = ResolvedPromptSourceEntry;

/** 世界书分组选项 */
export type PromptPersonWorldbookGroup = PromptWorldbookGroup;

/** 角色资料选项 */
export interface PromptPersonCharacterSourceOptions {
  description: {
    title: string;
  };
  worldbooks: PromptPersonWorldbookGroup[];
}

type TemplateEntryResolver = (
  title: string,
  reference: PromptPersonSourceReference,
) => Promise<ResolvedPromptPersonTemplateEntry> | ResolvedPromptPersonTemplateEntry;

const TEMPLATE_ENTRY_RESOLVERS: Partial<
  Record<Exclude<PromptPersonTemplateEntryKind, 'custom'>, TemplateEntryResolver>
> = {
  user_persona: resolveUserPersonaEntry,
  character_description: resolveCharacterDescriptionEntry,
  character_worldbook_entry: resolveCharacterWorldbookEntry,
};

/**
 * 获取角色卡名称列表
 * @returns 角色卡名称列表
 */
export function getPromptPersonCharacterNames(): string[] {
  const tavernHelper = getTavernHelper();
  return tavernHelper?.getCharacterNames?.() ?? [];
}

/**
 * 获取 persona 名称列表
 * @returns persona 名称列表
 */
export function getPromptPersonUserPersonaNames(): string[] {
  const tavernHelper = getTavernHelper();
  return readPersonaList(tavernHelper ? () => tavernHelper.getPersonaNames() : undefined);
}

/**
 * 获取 persona 头像 id 列表
 * @returns persona 头像 id 列表
 */
export function getPromptPersonUserPersonaIds(): string[] {
  const tavernHelper = getTavernHelper();
  return readPersonaList(tavernHelper ? () => tavernHelper.getPersonaIds() : undefined);
}

/**
 * 获取全部世界书名称列表
 * @returns 世界书名称列表
 */
export function getPromptPersonWorldbookNames(): string[] {
  return getPromptWorldbookNames();
}

/**
 * 获取用户人设 描述文本
 * @param personaId persona 名称、头像 id 或 current
 * @returns persona 描述
 */
export function getPromptPersonUserPersonaDescription(personaId: string): string {
  const persona = requirePromptProfilesPersona(personaId);
  const content = buildUserPersonaDescription(persona);
  if (!content) {
    throw new Error(`用户人设 "${personaId}" 没有可用介绍`);
  }
  return content;
}

/**
 * 获取角色描述文本
 * @param characterName 角色卡名称
 * @returns 角色描述
 */
export async function getPromptPersonCharacterDescription(characterName: string): Promise<string> {
  const tavernHelper = requirePromptProfilesTavernHelper();
  const rawCharacter = await tavernHelper.getCharacter(characterName);
  const description = normalizeText(rawCharacter.description);
  if (description) return description;

  const charData = tavernHelper.getCharData(characterName);
  const fallbackDescription = readObjectString(charData, ['description', 'data.description']);
  if (!fallbackDescription) {
    throw new Error(`角色卡 "${characterName}" 没有可用描述`);
  }
  return fallbackDescription;
}

/**
 * 获取角色卡绑定世界书的条目列表
 * @param characterName 角色卡名称
 * @returns 世界书条目列表
 */
export async function getPromptPersonCharacterWorldbookEntries(
  characterName: string,
): Promise<PromptPersonCharacterSourceOptions['worldbooks']> {
  const tavernHelper = requirePromptProfilesTavernHelper();
  const bindings = tavernHelper.getCharWorldbookNames(characterName);
  return readPromptPersonWorldbookGroups([bindings.primary, ...bindings.additional]);
}

/**
 * 获取全部世界书的条目列表
 * @returns 世界书条目列表
 */
export async function getPromptPersonWorldbookSourceOptions(): Promise<PromptPersonWorldbookGroup[]> {
  return readPromptPersonWorldbookGroups(getPromptPersonWorldbookNames());
}

/**
 * 获取角色资料来源选项
 * @param characterName 角色卡名称
 * @returns 描述与世界书资料
 */
export async function getPromptPersonCharacterSourceOptions(
  characterName: string,
): Promise<PromptPersonCharacterSourceOptions> {
  return {
    description: {
      title: '角色描述',
    },
    worldbooks: await getPromptPersonCharacterWorldbookEntries(characterName),
  };
}

/**
 * 解析单个人物模板条目
 * @param entry 模板条目
 * @returns 解析结果
 */
export async function resolvePromptPersonTemplateEntry(
  entry: PromptPersonTemplateEntry,
): Promise<ResolvedPromptPersonTemplateEntry> {
  const kind = getPromptPersonTemplateEntryKind(entry);
  if (kind === 'custom') {
    return buildResolvedTemplateEntry('ready', entry.title, entry.content);
  }
  const reference = entry.reference;
  const resolver = TEMPLATE_ENTRY_RESOLVERS[kind];
  if (!reference || !resolver) return buildResolvedTemplateEntry('missing', entry.title, '');
  return resolver(entry.title, reference);
}

/**
 * 构造外部角色描述条目
 * @param characterName 角色名
 * @returns 模板条目片段
 */
export function createPromptPersonCharacterDescriptionEntry(
  characterName: string,
  id = uuidv4(),
): PromptPersonTemplateEntry {
  return {
    id: normalizePromptPersonTemplateEntryId(id, 'character_description'),
    title: '角色描述',
    enabled: true,
    content: '',
    reference: { characterName },
  };
}

/**
 * 构造外部世界书条目
 * @param reference 条目引用
 * @param entryName 条目名
 * @returns 模板条目片段
 */
export function createPromptPersonCharacterWorldbookEntry(
  reference: PromptPersonSourceReference,
  entryName: string,
  id = uuidv4(),
): PromptPersonTemplateEntry {
  return {
    id: normalizePromptPersonTemplateEntryId(id, 'character_worldbook_entry'),
    title: entryName.trim() || '世界书条目',
    enabled: true,
    content: '',
    reference,
  };
}

/**
 * 构造用户人设 条目
 * @param personaId persona 头像 id 或名称
 * @param personaName persona 显示名称
 * @returns 模板条目片段
 */
export function createPromptPersonUserPersonaEntry(
  personaId: string,
  personaName = '',
  id = uuidv4(),
): PromptPersonTemplateEntry {
  return {
    id: normalizePromptPersonTemplateEntryId(id, 'user_persona'),
    title: '用户介绍',
    enabled: true,
    content: '',
    reference: { personaId, personaName },
  };
}

/**
 * 解析用户人设 模板条目
 * @param title 条目标题
 * @param reference 条目引用
 * @returns 解析结果
 */
function resolveUserPersonaEntry(
  title: string,
  reference: PromptPersonSourceReference,
): ResolvedPromptPersonTemplateEntry {
  const personaId = reference.personaId || reference.personaName;
  if (!personaId) return buildResolvedTemplateEntry('missing', title, '');
  try {
    return buildResolvedTemplateEntry('ready', title, getPromptPersonUserPersonaDescription(personaId));
  } catch {
    return buildResolvedTemplateEntry('missing', title, '');
  }
}

/**
 * 解析角色描述模板条目
 * @param title 条目标题
 * @param reference 条目引用
 * @returns 解析结果
 */
async function resolveCharacterDescriptionEntry(
  title: string,
  reference: PromptPersonSourceReference,
): Promise<ResolvedPromptPersonTemplateEntry> {
  if (!reference.characterName) {
    return buildResolvedTemplateEntry('missing', title, '');
  }
  try {
    const content = await getPromptPersonCharacterDescription(reference.characterName);
    return buildResolvedTemplateEntry('ready', title, content);
  } catch {
    return buildResolvedTemplateEntry('missing', title, '');
  }
}

/**
 * 解析角色世界书模板条目
 * @param title 条目标题
 * @param reference 条目引用
 * @returns 解析结果
 */
async function resolveCharacterWorldbookEntry(
  title: string,
  reference: PromptPersonSourceReference,
): Promise<ResolvedPromptPersonTemplateEntry> {
  return resolvePromptWorldbookSourceEntry(title, reference, {
    includeDisabled: false,
    allowEmptyContent: false,
  });
}

/**
 * 读取人物模板可用的世界书分组
 * @param worldbookNames 世界书名称列表
 * @returns 世界书分组
 */
async function readPromptPersonWorldbookGroups(worldbookNames: Array<string | null>): Promise<PromptPersonWorldbookGroup[]> {
  return readPromptWorldbookGroupsWithOptions(worldbookNames, {
    includeDisabled: false,
    allowEmptyContent: false,
  });
}

/**
 * 构建解析结果对象
 * @param status 条目状态
 * @param title 条目标题
 * @param content 条目内容
 * @returns 解析结果
 */
function buildResolvedTemplateEntry(
  status: ResolvedPromptPersonTemplateEntry['status'],
  title: string,
  content: string,
): ResolvedPromptPersonTemplateEntry {
  return buildResolvedSourceEntry(status, title, normalizeText(content));
}

/**
 * 读取并确保 TavernHelper 可用
 * @returns 可安全调用的 TavernHelper
 */
function requirePromptProfilesTavernHelper(): NonNullable<typeof TavernHelper> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用，无法读取人物资料');
  }
  return tavernHelper;
}

/**
 * 读取并确保 persona 获取接口可用
 * @param personaId persona 名称、头像 id 或 current
 * @returns persona 内容
 */
function requirePromptProfilesPersona(personaId: string): TavernPersona {
  const tavernHelper = requirePromptProfilesTavernHelper();
  if (typeof tavernHelper.getPersona !== 'function') {
    throw new Error('persona 接口不可用，无法读取用户资料');
  }
  return tavernHelper.getPersona(personaId);
}

/**
 * 读取 persona 列表
 * @param getter persona 列表读取函数
 * @returns 字符串列表
 */
function readPersonaList(getter: (() => string[]) | undefined): string[] {
  try {
    return getter?.().filter(isNonEmptyString) ?? [];
  } catch {
    return [];
  }
}

/**
 * 构建用户人设 描述
 * @param persona persona 内容
 * @returns 可注入提示词的介绍文本，不拼接 Persona Title 元数据
 */
function buildUserPersonaDescription(persona: TavernPersona): string {
  return [persona.description, persona.lorebook].map(normalizeText).filter(isNonEmptyString).join('\n\n');
}

/**
 * 读取对象中某些路径下的字符串字段
 * @param value 原始对象
 * @param paths 候选路径
 * @returns 首个非空字符串
 */
function readObjectString(value: unknown, paths: string[]): string {
  if (!_.isPlainObject(value)) return '';
  for (const path of paths) {
    const result = normalizeText(_.get(value, path));
    if (result) return result;
  }
  return '';
}

/**
 * 规范化文本
 * @param value 原始值
 * @returns 去空白后的文本
 */
function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 判断是否为非空字符串
 * @param value 原始值
 * @returns 是否为非空字符串
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

