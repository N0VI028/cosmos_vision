import { MAX_HISTORY_FLOOR_COUNT } from '@/constants/limits';
import type { PromptLlmContext, PromptLlmSettings } from '@/constants/prompt-llm';
import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';
import {
  getCurrentCharacterKey,
  getCurrentUserPersonaKey,
} from '@/services/tavern-helper/prompt-profiles-context';
import {
  getPromptPersonCharacterDescription,
  getPromptPersonUserPersonaDescription,
} from '@/services/tavern-helper/prompt-profiles-sources';

/** 酒馆助手消息最小结构 */
export interface TavernChatMessageLike {
  message_id: number;
  name?: string;
  role: 'system' | 'assistant' | 'user' | 'unknown' | string;
  is_hidden: boolean;
  message: string;
}

export type ChatMessageReaderFn = (
  range: string,
  filters: { role: 'all'; hide_state: 'all' },
) => TavernChatMessageLike[];

export type RegexFormatterFn = (
  text: string,
  source: 'user_input' | 'ai_output',
  destination: 'prompt',
  options: { depth: number },
) => string;

/**
 * 安全渲染 Prompt-Template EJS 模板
 * - 若未安装 ST-Prompt-Template 或未就绪：静默返回原文，不弹窗、不抛错、不打印错误日志
 * - 若文本不包含 <%：快路径立即返回
 * - 若 EJS 执行中抛出异常：仅记录 console.debug，安全降级返回原文
 *
 * @param content 待处理的世界书或角色卡文本
 * @returns 渲染精简后的纯文本或原文
 */
export async function safeRenderPromptTemplate(content: string): Promise<string> {
  if (typeof content !== 'string') return '';
  const trimmed = content.trim();

  // 1. 快路径：不含 EJS 标记直接返回，避免任何额外开销
  if (!trimmed || !trimmed.includes('<%')) {
    return content;
  }

  // 2. 静默探测：检查 ST-Prompt-Template 是否可用
  const ejsEvaluator = (globalThis as any).EjsTemplate?.evalTemplate;
  if (typeof ejsEvaluator !== 'function') {
    return content;
  }

  // 3. 安全调用：捕获运行时所有可能错误并平滑回退原文
  try {
    const rendered = await ejsEvaluator(content, null);
    return typeof rendered === 'string' ? rendered : content;
  } catch (error) {
    console.debug('[auto-runtime] EJS template rendering skipped due to error:', error);
    return content;
  }
}

/**
 * 自动读取当前选中角色卡的描述文本
 * 兜底策略：若通过 getCurrentCharacterKey() 未能获取到当前角色名（例如单人模式未命名），则降级传递 'current'
 * @returns 角色卡描述或空字符串
 */
export async function getAutoCharacterDescription(): Promise<string> {
  try {
    const charName = getCurrentCharacterKey() || 'current';
    const desc = await getPromptPersonCharacterDescription(charName);
    return typeof desc === 'string' ? desc.trim() : '';
  } catch (error) {
    console.debug('[auto-runtime] Failed to read character description:', error);
    return '';
  }
}

/**
 * 自动读取当前激活用户人设的描述文本与世界书
 * @returns 用户人设描述或空字符串
 */
export function getAutoUserPersonaDescription(): string {
  try {
    const desc = getPromptPersonUserPersonaDescription('current');
    return typeof desc === 'string' ? desc.trim() : '';
  } catch (error) {
    console.debug('[auto-runtime] Failed to read user persona:', error);
    return '';
  }
}

/**
 * 自动读取当前激活用户人设的名字
 * @returns 用户人设名字或空字符串
 */
export function getAutoUserPersonaName(): string {
  return getCurrentUserPersonaKey() ?? '';
}

/**
 * 读取 SillyTavern 当前世界书配置中是否包含名称前缀
 * 解析路径：@sillytavern/scripts/world-info -> public/scripts/world-info.js
 * @returns 是否包含名称前缀（默认为 true）
 */
export async function getAutoWorldInfoIncludeNames(): Promise<boolean> {
  try {
    const wiModule = await import('@sillytavern/scripts/world-info');
    const settings = wiModule.getWorldInfoSettings?.();
    if (settings && typeof settings.world_info_include_names === 'boolean') {
      return settings.world_info_include_names;
    }
  } catch (error) {
    console.debug('[auto-runtime] Failed to read world_info_include_names setting:', error);
  }
  return true;
}

/**
 * 获取 SillyTavern 当前上下文最大 Token 数
 * 解析路径：@sillytavern/script -> public/script.js (getMaxContextSize)
 * @returns 上下文大小（缺省时返回 8192）
 */
export async function getAutoWorldInfoMaxContext(): Promise<number> {
  try {
    const stScript = await import('@sillytavern/script');
    if (typeof stScript.getMaxContextSize === 'function') {
      const maxCtx = Number(stScript.getMaxContextSize());
      if (Number.isFinite(maxCtx) && maxCtx > 0) {
        return maxCtx;
      }
    }
  } catch (error) {
    console.debug('[auto-runtime] Failed to read max context size:', error);
  }
  return 8192;
}

export interface BuildAutoWorldInfoChatOptions {
  /** 向前追溯的历史楼层数 */
  historyFloorCount: number;
  /** 当前焦点消息在完整 chat[] 中的索引 */
  currentMessageIndex?: number | null;
  /** depth 计算基准（默认为 chat.length - 1 或 currentMessageIndex - 1） */
  depthBaseline?: number;
  /** 可选注入的消息读取函数 */
  getChatMessages?: ChatMessageReaderFn;
  /** 可选注入的正则格式化函数 */
  formatAsTavernRegexedString?: RegexFormatterFn;
  /** 是否在单条消息前附加角色名（如 "Name: text"） */
  includeNames?: boolean;
  /** 可选注入的 chat 数组长度（当 depthBaseline 未指定时用于兜底） */
  chatLength?: number;
}

/**
 * 过滤隐藏消息和 system 消息，保留最近 effectiveCount 条。
 * 注意：世界书匹配依赖完整的对话上下文，因此始终保留 user 消息（有意忽略 ignoreUserMessagesInHistory）。
 */
function filterVisibleMessages(
  rawMessages: TavernChatMessageLike[],
  effectiveCount: number,
): TavernChatMessageLike[] {
  return rawMessages
    .filter(msg => !msg.is_hidden && msg.role !== 'system')
    .slice(-effectiveCount);
}

/**
 * 格式化单条聊天消息并应用正则处理
 */
function formatSingleChatMessage(
  msg: TavernChatMessageLike,
  depthBaseline: number,
  regexFormatter?: RegexFormatterFn,
  includeNames = true,
): string | null {
  const rawText = msg.message ?? '';
  const source = msg.role === 'user' ? 'user_input' : 'ai_output';
  const depth = Math.max(0, depthBaseline - msg.message_id);

  let processedText = rawText;
  if (typeof regexFormatter === 'function') {
    try {
      processedText = regexFormatter(rawText, source, 'prompt', { depth });
    } catch (error) {
      console.debug('[auto-runtime] Regex formatting error on message:', msg.message_id, error);
      processedText = rawText;
    }
  }

  const trimmedText = processedText.trim();
  if (!trimmedText) return null;

  return includeNames && msg.name ? `${msg.name}: ${trimmedText}` : trimmedText;
}

/**
 * 从 TavernHelper 读取原始楼层消息
 */
function fetchRawMessages(
  rangeStart: number,
  rangeEnd: number,
  reader?: ChatMessageReaderFn,
): TavernChatMessageLike[] {
  const getMessages = reader ?? getOptionalTavernHelper()?.getChatMessages;
  if (typeof getMessages !== 'function') return [];
  try {
    const raw = getMessages(`${rangeStart}-${rangeEnd}`, { role: 'all', hide_state: 'all' });
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    console.debug('[auto-runtime] getChatMessages failed:', error);
    return [];
  }
}

/**
 * 构建用于 SillyTavern 世界书扫描的聊天消息数组 (chatForWI)
 * 最终按 depth 升序（即从新到旧，数组倒序）返回供 ST 世界书匹配器消费。
 */
export function buildAutoWorldInfoChatMessages(options: BuildAutoWorldInfoChatOptions): string[] {
  const { historyFloorCount, currentMessageIndex } = options;
  if (currentMessageIndex == null || currentMessageIndex <= 0 || historyFloorCount <= 0) {
    return [];
  }

  const effectiveCount = Math.min(historyFloorCount, MAX_HISTORY_FLOOR_COUNT);
  const rangeEnd = currentMessageIndex - 1;
  const rangeStart = Math.max(0, rangeEnd - effectiveCount + 1);

  const rawMessages = fetchRawMessages(rangeStart, rangeEnd, options.getChatMessages);
  const visibleMessages = filterVisibleMessages(rawMessages, effectiveCount);
  if (visibleMessages.length === 0) return [];

  const depthBaseline =
    options.depthBaseline ??
    (options.chatLength ? options.chatLength - 1 : currentMessageIndex - 1);
  const regexFormatter =
    options.formatAsTavernRegexedString ?? getOptionalTavernHelper()?.formatAsTavernRegexedString;
  const includeNames = options.includeNames ?? true;

  const formatted: string[] = [];
  for (const msg of visibleMessages) {
    const line = formatSingleChatMessage(msg, depthBaseline, regexFormatter, includeNames);
    if (line) formatted.push(line);
  }

  return formatted.reverse();
}

export interface ScanAutoWorldInfoOptions {
  characterDescription?: string;
  personaDescription?: string;
  maxContext?: number;
  getWorldInfoPromptFn?: (
    chat: string[],
    maxContext: number,
    isDryRun: boolean,
    globalScanData: any,
  ) => Promise<{ worldInfoString?: string } | undefined>;
}

/**
 * 触发 SillyTavern 世界书扫描 (getWorldInfoPrompt)
 * @param chatForWI 格式化后的聊天消息数组
 * @param options 角色描述与人设等上下文
 * @returns 激活的世界书词条组合文本或空字符串
 */
export async function scanAutoWorldInfo(
  chatForWI: string[],
  options: ScanAutoWorldInfoOptions = {},
): Promise<string> {
  if (chatForWI.length === 0 && !options.characterDescription && !options.personaDescription) {
    return '';
  }

  try {
    let fn = options.getWorldInfoPromptFn;
    if (!fn) {
      const wiModule = await import('@sillytavern/scripts/world-info');
      fn = wiModule.getWorldInfoPrompt;
    }

    if (typeof fn !== 'function') return '';

    const globalScanData = {
      personaDescription: options.personaDescription || '',
      characterDescription: options.characterDescription || '',
      characterPersonality: '',
      characterDepthPrompt: '',
      scenario: '',
      creatorNotes: '',
      trigger: 'normal',
    };

    const maxContext = options.maxContext ?? (await getAutoWorldInfoMaxContext());
    const result = await fn(chatForWI, maxContext, true, globalScanData);
    return typeof result?.worldInfoString === 'string' ? result.worldInfoString.trim() : '';
  } catch (error) {
    console.debug('[auto-runtime] World info scan failed or unavailable:', error);
    return '';
  }
}

/**
 * 拼装自动人物与世界书上下文 XML 结构
 * 用户人设名字通过 <person name="..."> 标签属性注入，不污染描述正文
 * @param data 角色描述、用户人设（名字+描述）与世界书内容
 * @returns 拼装后的 participantContent（若均为空则返回空字符串）
 */
export function buildAutoParticipantContext(data: {
  characterDescription?: string;
  personaName?: string;
  personaDescription?: string;
  worldInfoString?: string;
}): string {
  const parts: string[] = [];

  const charDesc = data.characterDescription?.trim();
  if (charDesc) {
    parts.push(`<character_description>\n${charDesc}\n</character_description>`);
  }

  const personaName = data.personaName?.trim();
  const personaDesc = data.personaDescription?.trim();
  if (personaName || personaDesc) {
    const nameAttr = personaName ? ` name="${escapeXmlAttribute(personaName)}"` : '';
    const body = personaDesc ? `\n${personaDesc}\n` : '';
    parts.push(`<person${nameAttr}>${body}</person>`);
  }

  const wiDesc = data.worldInfoString?.trim();
  if (wiDesc) {
    parts.push(`<world_info>\n${wiDesc}\n</world_info>`);
  }

  return parts.join('\n\n');
}

/**
 * 转义 XML 属性值中的特殊字符
 * @param value 原始属性值
 * @returns 可安全写入双引号属性的文本
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 构建自动收集模式下的 Prompt LLM 运行时内容
 * @param context Prompt LLM 上下文
 * @param settings 包含 historyFloorCount 设置
 * @returns 组装好的 historyContent, participantContent, focusParagraphContent
 */
export async function buildAutoParticipantRuntimeContent(
  context: PromptLlmContext,
  settings: Pick<PromptLlmSettings, 'historyFloorCount'>,
): Promise<{
  historyContent: string;
  participantContent: string;
  focusParagraphContent: string;
}> {
  const historyContent = context.historyParagraphs.join('\n\n').trim();
  const focusParagraphContent = context.focusParagraph.trim();

  const [characterDescription, personaDescription, personaName, includeNames] = await Promise.all([
    getAutoCharacterDescription(),
    Promise.resolve(getAutoUserPersonaDescription()),
    Promise.resolve(getAutoUserPersonaName()),
    getAutoWorldInfoIncludeNames(),
  ]);

  const chatForWI = buildAutoWorldInfoChatMessages({
    historyFloorCount: settings.historyFloorCount,
    currentMessageIndex: context.messageIndex,
    includeNames,
  });

  const rawWorldInfoString = await scanAutoWorldInfo(chatForWI, {
    characterDescription,
    personaDescription,
  });

  const [renderedCharDesc, renderedPersonaDesc, renderedWorldInfo] = await Promise.all([
    safeRenderPromptTemplate(characterDescription),
    safeRenderPromptTemplate(personaDescription),
    safeRenderPromptTemplate(rawWorldInfoString),
  ]);

  const participantContent = buildAutoParticipantContext({
    characterDescription: renderedCharDesc,
    personaName,
    personaDescription: renderedPersonaDesc,
    worldInfoString: renderedWorldInfo,
  });

  return {
    historyContent,
    participantContent,
    focusParagraphContent,
  };
}
