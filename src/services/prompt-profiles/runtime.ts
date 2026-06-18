import { uuidv4 } from '@sillytavern/scripts/utils';

import { PROMPT_LLM_FIXED_TAGS_TOKEN, PROMPT_LLM_TRIGGER_NAMES_TOKEN } from '@/constants/default-settings';
import type {
  PromptPerson,
  PromptPersonKind,
  PromptPersonTemplateEntry,
  PromptProfilesSettings,
} from '@/constants/novelai';
import type { PromptLlmRuntimeContent } from '@/services/prompt-llm/message-preset';
import { resolvePromptPersonTemplateEntry } from '@/services/tavern-helper/prompt-profiles-sources';

interface PromptPersonMatchContext {
  contextText: string;
}

/** 命中的人物渲染结果 */
export interface MatchedPromptPerson {
  person: PromptPerson;
  renderedContent: string;
}

/** 人物匹配与渲染结果 */
export interface PromptProfilesRuntimeResult {
  historyContent: string;
  participantContent: string;
  matchedProfiles: MatchedPromptPerson[];
}

/**
 * 创建新人物配置
 * @param kind 人物类型
 * @param name 人物名称
 * @param triggerKeywords 默认触发词列表
 * @returns 默认人物配置
 */
export function createPromptPerson(kind: PromptPersonKind, name: string, triggerKeywords: string[] = []): PromptPerson {
  return {
    id: uuidv4(),
    name: name.trim() || '未命名人物',
    kind,
    enabled: true,
    insertMode: 'always',
    triggerKeywords: normalizePromptPersonKeywords(triggerKeywords),
    staticTags: '',
    templateEntries: createDefaultPromptPersonTemplateEntries(),
  };
}

/**
 * 创建默认人物模板条目
 * @returns 默认模板条目数组
 */
export function createDefaultPromptPersonTemplateEntries(): PromptPersonTemplateEntry[] {
  return [
    createCustomPromptPersonTemplateEntry(
      '人物开始',
      `<person name="${PROMPT_LLM_TRIGGER_NAMES_TOKEN}">
  <fixed_tags>以下固定tag为角色特性，必须原样体现在最终正向提示词中：${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags>
  <references>`,
    ),
    createCustomPromptPersonTemplateEntry('人物结束', `  </references>\n</person>`),
  ];
}

/**
 * 创建自定义人物模板条目
 * @param title 条目标题
 * @param content 条目内容
 * @returns 自定义条目
 */
export function createCustomPromptPersonTemplateEntry(title = '自定义条目', content = ''): PromptPersonTemplateEntry {
  return {
    id: uuidv4(),
    title,
    enabled: true,
    source: 'custom',
    content,
  };
}

/**
 * 构建人物运行时内容
 * @param contextParagraphs 焦点上下文段落
 * @param promptProfiles 提示词Profile设置
 * @returns 历史消息与人物总体信息
 */
export async function buildPromptProfilesRuntimeContent(
  contextParagraphs: string[],
  promptProfiles: PromptProfilesSettings,
): Promise<PromptProfilesRuntimeResult> {
  const historyContent = contextParagraphs.join('\n\n').trim();
  const matchedProfiles = await matchPromptProfiles(contextParagraphs, promptProfiles.profiles);
  return {
    historyContent,
    participantContent: buildParticipantContext(matchedProfiles),
    matchedProfiles,
  };
}

/**
 * 构建 LLM 运行时替换内容
 * @param contextParagraphs 焦点上下文段落
 * @param promptProfiles 提示词Profile设置
 * @returns 供消息预设替换的运行时内容
 */
export async function buildPromptLlmRuntimeContent(
  contextParagraphs: string[],
  promptProfiles: PromptProfilesSettings,
): Promise<PromptLlmRuntimeContent> {
  const result = await buildPromptProfilesRuntimeContent(contextParagraphs, promptProfiles);
  return {
    historyContent: result.historyContent,
    participantContent: result.participantContent,
  };
}

/**
 * 命中当前应参与的人物
 * @param contextParagraphs 焦点上下文段落
 * @param profiles 全部人物
 * @returns 命中的人物列表
 */
export async function matchPromptProfiles(
  contextParagraphs: string[],
  profiles: PromptPerson[],
): Promise<MatchedPromptPerson[]> {
  const matchContext = { contextText: contextParagraphs.join('\n\n').toLowerCase() };
  const matchedProfiles = await Promise.all(profiles.map(person => matchAndRenderPromptPerson(person, matchContext)));
  return matchedProfiles.filter(isMatchedPromptPerson);
}

/**
 * 渲染单个人物模板
 * @param person 人物配置
 * @returns 渲染后的文本
 */
export async function renderPromptPersonTemplate(person: PromptPerson): Promise<string> {
  const renderedEntries = await Promise.all(
    person.templateEntries.map(entry => renderEnabledPromptPersonEntry(person, entry)),
  );
  return renderedEntries.filter(isNonEmptyRenderedEntry).join('\n');
}

/**
 * 构建 participant_context 文本
 * @param matchedProfiles 命中的提示词Profile列表
 * @returns 人物总体信息
 */
export function buildParticipantContext(matchedProfiles: MatchedPromptPerson[]): string {
  return matchedProfiles
    .map(item => item.renderedContent.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 解析单个模板 token
 * @param person 人物配置
 * @param token token 名称
 * @returns token 替换文本
 */
export function resolvePromptPersonTemplateToken(person: PromptPerson, token: string): string {
  if (token === PROMPT_LLM_TRIGGER_NAMES_TOKEN) {
    return buildPromptPersonTriggerNames(person);
  }
  if (token === PROMPT_LLM_FIXED_TAGS_TOKEN) {
    return resolvePromptPersonFixedTags(person);
  }
  return '';
}

/**
 * 判断人物是否应命中
 * @param person 人物配置
 * @param matchContext 匹配上下文
 * @returns 是否命中
 */
function shouldMatchPromptPerson(person: PromptPerson, matchContext: PromptPersonMatchContext): boolean {
  if (person.enabled === false) return false;
  if (person.insertMode === 'always') return true;
  const keywords = normalizePromptPersonKeywords(person.triggerKeywords);
  return keywords.length > 0 && keywords.some(keyword => matchContext.contextText.includes(keyword.toLowerCase()));
}

/**
 * 判断模板条目是否应参与渲染
 * @param entry 模板条目
 * @returns 是否应渲染
 */
function shouldRenderPromptPersonEntry(entry: PromptPersonTemplateEntry): boolean {
  return entry.enabled;
}

/**
 * 渲染单个人物模板条目
 * @param person 人物配置
 * @param entry 模板条目
 * @returns 渲染后的文本
 */
async function renderPromptPersonTemplateEntry(
  person: PromptPerson,
  entry: PromptPersonTemplateEntry,
): Promise<string> {
  if (entry.source === 'custom') {
    return replacePromptPersonTemplateTokens(entry.content, person);
  }
  const resolvedEntry = await resolvePromptPersonTemplateEntry(entry);
  if (resolvedEntry.status !== 'ready') return '';
  return replacePromptPersonTemplateTokens(resolvedEntry.content, person);
}

/**
 * 替换模板文本中的动态 token
 * @param content 原始模板文本
 * @param person 人物配置
 * @returns 替换后的文本
 */
function replacePromptPersonTemplateTokens(content: string, person: PromptPerson): string {
  const fixedTags = resolvePromptPersonFixedTags(person);
  const triggerNames = buildPromptPersonTriggerNames(person);
  const template = fixedTags ? content : stripEmptyFixedTagsBlocks(content);
  return template
    .replaceAll(PROMPT_LLM_TRIGGER_NAMES_TOKEN, triggerNames)
    .replaceAll(PROMPT_LLM_FIXED_TAGS_TOKEN, fixedTags)
    .trim();
}

/**
 * 构建人物关键词名称文本
 * @param person 人物配置
 * @returns 关键词或回退名称
 */
function buildPromptPersonTriggerNames(person: PromptPerson): string {
  const keywords = normalizePromptPersonKeywords(person.triggerKeywords);
  if (keywords.length > 0) return keywords.join('|');
  return person.name.trim();
}

/**
 * 读取可用的固定 tag
 * @param person 人物配置
 * @returns 固定 tag 文本
 */
function resolvePromptPersonFixedTags(person: PromptPerson): string {
  return person.staticTags.trim();
}

/**
 * 标准化人物关键词数组
 * @param keywords 原始关键词列表
 * @returns 去重后的关键词
 */
function normalizePromptPersonKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.map(keyword => keyword.trim()).filter(Boolean)));
}

/**
 * 匹配并渲染单个人物
 * @param person 人物配置
 * @param matchContext 匹配上下文
 * @returns 命中结果
 */
async function matchAndRenderPromptPerson(
  person: PromptPerson,
  matchContext: PromptPersonMatchContext,
): Promise<MatchedPromptPerson | null> {
  if (!shouldMatchPromptPerson(person, matchContext)) return null;
  const renderedContent = await renderPromptPersonTemplate(person);
  if (!renderedContent.trim()) return null;
  return { person, renderedContent };
}

/**
 * 渲染启用的人物模板条目
 * @param person 人物配置
 * @param entry 模板条目
 * @returns 渲染后的条目文本
 */
async function renderEnabledPromptPersonEntry(person: PromptPerson, entry: PromptPersonTemplateEntry): Promise<string> {
  if (!shouldRenderPromptPersonEntry(entry)) return '';
  return renderPromptPersonTemplateEntry(person, entry);
}

/**
 * 移除空固定 tag 包裹块
 * @param content 原始模板文本
 * @returns 去掉空块后的模板
 */
function stripEmptyFixedTagsBlocks(content: string): string {
  const token = escapeRegExp(PROMPT_LLM_FIXED_TAGS_TOKEN);
  const pattern = new RegExp(`<fixed_tags>[\\s\\S]*?${token}[\\s\\S]*?<\\/fixed_tags>`, 'g');
  return content.replace(pattern, '');
}

/**
 * 转义正则特殊字符
 * @param value 原始文本
 * @returns 转义后的正则文本
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 判断是否为命中的人物结果
 * @param value 原始结果
 * @returns 是否为有效命中项
 */
function isMatchedPromptPerson(value: MatchedPromptPerson | null): value is MatchedPromptPerson {
  return value !== null;
}

/**
 * 判断渲染结果是否为非空文本
 * @param value 渲染结果
 * @returns 是否保留该条目
 */
function isNonEmptyRenderedEntry(value: string): boolean {
  return value.trim().length > 0;
}
