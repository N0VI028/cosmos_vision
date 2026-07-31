/**
 * 提示词 LLM 相关的常量与类型定义
 */

/** 提示词 LLM 子设置(用于段落生图时生成正负提示词) */
export interface PromptLlmSettings {
  /** 代理预设名(可选,与手填字段互斥) */
  proxyPreset: string;
  /** API URL */
  apiUrl: string;
  /** API Key */
  apiKey: string;
  /** 模型名 */
  model: string;
  /** 超时时间 */
  timeout: number;
  /** 来源标识(如 openai/anthropic/custom) */
  source: string;
  /** 温度(可选) */
  temperature: number;
  /** 最大 token(可选) */
  maxTokens: number;
  /** top_p(可选) */
  topP: number;
  /** top_k(可选) */
  topK: number;
  /** 是否启用流式请求 */
  shouldStream: boolean;
  /** 向前追溯的历史楼层数，不含当前焦点楼层 */
  historyFloorCount: number;
  /** 追溯历史时是否忽略 user 楼层 */
  ignoreUserMessagesInHistory: boolean;
  /** 是否优先 JSON Schema 解析(公共:所有生图渠道共享) */
  preferJsonSchemaExtraction: boolean;
  /** 正面提示词 JSON 字段名 */
  positivePromptJsonField: string;
  /** 负面提示词 JSON 字段名 */
  negativePromptJsonField: string;
  /** 角色数组 JSON 字段名 */
  characterPromptsJsonField: string;
  /** 角色正面提示词字段名 */
  characterPositivePromptJsonField: string;
  /** 角色负面提示词字段名 */
  characterNegativePromptJsonField: string;
  /** 角色位置字段名 */
  characterPositionJsonField: string;
  /** 角色 X 坐标字段名 */
  characterPositionXJsonField: string;
  /** 角色 Y 坐标字段名 */
  characterPositionYJsonField: string;
  /** 正面提示词正则提取规则 */
  positivePromptExtractPattern: string;
  /** 负面提示词正则提取规则 */
  negativePromptExtractPattern: string;
  /** 角色正面提示词正则 */
  characterPositivePromptExtractPattern: string;
  /** 角色负面提示词正则 */
  characterNegativePromptExtractPattern: string;
  /** 角色 X 坐标正则 */
  characterPositionXExtractPattern: string;
  /** 角色 Y 坐标正则 */
  characterPositionYExtractPattern: string;
  /** 自定义源附加请求体参数(YAML 文本) */
  customIncludeBody: string;
  /** 自定义源排除请求体参数(YAML 文本) */
  customExcludeBody: string;
  /** 自定义源附加请求头(YAML 文本) */
  customIncludeHeaders: string;
}

/** 提示词 LLM 运行时上下文 */
export interface PromptLlmContext {
  /** 按时间顺序拼装的历史上下文，末尾包含当前焦点楼层文本 */
  historyParagraphs: string[];
  /** 当前选中的高光段落 */
  focusParagraph: string;
  /** 用户仅针对本次生图的特别要求 */
  specialRequest: string;
}

/** 提示词 LLM 输出字段名(单侧留空表示该侧不参与 JSON 提取,交给固定预设) */
export interface PromptLlmOutputFields {
  positive?: string;
  negative?: string;
  characterPrompts?: string;
  characterPositivePrompt?: string;
  characterNegativePrompt?: string;
  characterPosition?: string;
  characterPositionX?: string;
  characterPositionY?: string;
}

/** 提示词 LLM 消息角色 */
export const PROMPT_LLM_MESSAGE_ROLES = ['system', 'user', 'assistant'] as const;

/** 提示词 LLM 消息角色 */
export type PromptLlmMessageRole = (typeof PROMPT_LLM_MESSAGE_ROLES)[number];

/** 提示词 LLM 消息触发匹配模式 */
export const PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES = [
  'always',
  'all_match',
  'any_match',
  'all_mismatch',
  'any_mismatch',
] as const;

/** 提示词 LLM 消息触发匹配模式 */
export type PromptLlmMessageTriggerMatchMode = (typeof PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES)[number];

/** 提示词 LLM 条目可配置的生图来源触发值 */
export const PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES = ['novelai', 'comfyui'] as const;

/** 提示词 LLM 条目可配置的生图来源触发值 */
export type PromptLlmMessageTriggerImageSource = (typeof PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES)[number];

/** 人物类型 */
export const PROMPT_PERSON_KINDS = ['user', 'character'] as const;

/** 人物类型 */
export type PromptPersonKind = (typeof PROMPT_PERSON_KINDS)[number];

/** 人物触发模式 */
export const PROMPT_PERSON_INSERT_MODES = ['always', 'keyword'] as const;

/** 人物触发模式 */
export type PromptPersonInsertMode = (typeof PROMPT_PERSON_INSERT_MODES)[number];

/** 人物模板条目类型 */
export const PROMPT_PERSON_TEMPLATE_ENTRY_KINDS = [
  'custom',
  'character_description',
  'character_worldbook_entry',
  'user_persona',
] as const;

/** 人物模板条目类型 */
export type PromptPersonTemplateEntryKind = (typeof PROMPT_PERSON_TEMPLATE_ENTRY_KINDS)[number];

/** 人物模板条目类型 → 指示灯右侧中文显示标签 */
export const PROMPT_PERSON_TEMPLATE_ENTRY_KIND_LABELS: Record<PromptPersonTemplateEntryKind, string> = {
  custom: '自定义',
  character_description: '角色描述',
  character_worldbook_entry: '世界书',
  user_persona: '用户人设',
};

/** LLM 普通条目类型 */
export const PROMPT_LLM_MESSAGE_ENTRY_KINDS = ['custom', 'worldbook_entry'] as const;

/** LLM 普通条目类型 */
export type PromptLlmMessageEntryKind = (typeof PROMPT_LLM_MESSAGE_ENTRY_KINDS)[number];

/** LLM 普通条目类型 → 中文显示标签 */
export const PROMPT_LLM_MESSAGE_ENTRY_KIND_LABELS: Record<PromptLlmMessageEntryKind, string> = {
  custom: '自定义',
  worldbook_entry: '世界书',
};

const PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES: Record<Exclude<PromptPersonTemplateEntryKind, 'custom'>, string> = {
  character_description: 'character-description',
  character_worldbook_entry: 'character-worldbook-entry',
  user_persona: 'user-persona',
};

const PROMPT_LLM_MESSAGE_ENTRY_ID_PREFIXES: Record<Exclude<PromptLlmMessageEntryKind, 'custom'>, string> = {
  worldbook_entry: 'worldbook-entry',
};

/** 世界书来源引用 */
export interface PromptWorldbookSourceReference {
  worldbookName?: string;
  entryUid?: number;
}

/** 人物模板条目来源引用 */
export interface PromptPersonSourceReference extends PromptWorldbookSourceReference {
  characterName?: string;
  personaId?: string;
  personaName?: string;
}

/** 人物模板条目 */
export interface PromptPersonTemplateEntry {
  id: string;
  title: string;
  enabled: boolean;
  content: string;
  reference?: PromptPersonSourceReference;
}

/** 人物配置 */
export interface PromptPerson {
  id: string;
  name: string;
  kind: PromptPersonKind;
  enabled: boolean;
  insertMode: PromptPersonInsertMode;
  triggerKeywords: string[];
  staticTags: string;
  templateEntries: PromptPersonTemplateEntry[];
}

/** 人物设置集合 */
export interface PromptProfilesSettings {
  profiles: PromptPerson[];
}

/** 提示词 LLM 消息项 */
export interface PromptLlmMessage {
  id: string;
  /** 条目名称,仅用于界面标题显示 */
  title: string;
  role: PromptLlmMessageRole;
  content: string;
  /** 是否启用该条目 */
  enabled?: boolean;
  /** 运行时触发匹配模式 */
  triggerMatchMode?: PromptLlmMessageTriggerMatchMode;
  /** 关键词触发组列表；每组内部任一命中，空组不参与 */
  triggerKeywordGroups?: string[][];
  /** 模型 ID 触发列表,空列表表示该维度不参与 */
  triggerModels?: string[];
  /** 生图来源触发列表,空列表表示该维度不参与 */
  triggerImageSources?: PromptLlmMessageTriggerImageSource[];
  /** 外部来源引用,仅来源型条目使用 */
  reference?: PromptWorldbookSourceReference;
}

/** 提示词 LLM 消息预设 */
export interface PromptLlmMessagePreset {
  id: string;
  name: string;
  messages: PromptLlmMessage[];
}

/** 提示词 LLM 消息预设集合 */
export interface PromptLlmMessagePresetSettings {
  activePresetId: string;
  presets: PromptLlmMessagePreset[];
}

/**
 * 读取人物模板条目类型
 * 外部资料条目使用固定英文 id 前缀，自定义条目使用裸 uuid
 * @param entry 模板条目
 * @returns 条目类型
 */
export function getPromptPersonTemplateEntryKind(
  entry: Pick<PromptPersonTemplateEntry, 'id'>,
): PromptPersonTemplateEntryKind {
  return readPromptPersonTemplateEntryKindFromId(entry.id) ?? 'custom';
}

/**
 * 读取 LLM 普通条目类型
 * 外部来源条目使用固定英文 id 前缀，自定义条目使用裸 uuid
 * @param message LLM 条目
 * @returns 条目类型
 */
export function getPromptLlmMessageEntryKind(message: Pick<PromptLlmMessage, 'id'>): PromptLlmMessageEntryKind {
  return readPromptLlmMessageEntryKindFromId(message.id) ?? 'custom';
}

/**
 * 规范化人物模板条目 id
 * 自定义条目保留裸 id，外部条目统一写成固定英文前缀
 * @param id 原始条目 id
 * @param kind 条目类型
 * @returns 新结构下的条目 id
 */
export function normalizePromptPersonTemplateEntryId(id: string, kind: PromptPersonTemplateEntryKind): string {
  const baseId = stripPromptPersonTemplateEntryIdPrefix(id);
  if (kind === 'custom') return baseId;
  return `${PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES[kind]}:${baseId}`;
}

/**
 * 规范化 LLM 条目 id
 * 自定义条目保留裸 id，世界书条目统一写成固定英文前缀
 * @param id 原始条目 id
 * @param kind 条目类型
 * @returns 新结构下的条目 id
 */
export function normalizePromptLlmMessageId(id: string, kind: PromptLlmMessageEntryKind): string {
  const baseId = stripPromptLlmMessageIdPrefix(id);
  if (kind === 'custom') return baseId;
  return `${PROMPT_LLM_MESSAGE_ENTRY_ID_PREFIXES[kind]}:${baseId}`;
}

/**
 * 按条目 id 前缀读取人物模板条目类型
 * @param id 条目 id
 * @returns 外部条目类型或 null
 */
function readPromptPersonTemplateEntryKindFromId(id: string): Exclude<PromptPersonTemplateEntryKind, 'custom'> | null {
  for (const [kind, prefix] of Object.entries(PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES)) {
    if (id === prefix || id.startsWith(`${prefix}:`)) {
      return kind as Exclude<PromptPersonTemplateEntryKind, 'custom'>;
    }
  }
  return null;
}

/**
 * 按条目 id 前缀读取 LLM 条目类型
 * @param id 条目 id
 * @returns 外部条目类型或 null
 */
function readPromptLlmMessageEntryKindFromId(id: string): Exclude<PromptLlmMessageEntryKind, 'custom'> | null {
  for (const [kind, prefix] of Object.entries(PROMPT_LLM_MESSAGE_ENTRY_ID_PREFIXES)) {
    if (id === prefix || id.startsWith(`${prefix}:`)) {
      return kind as Exclude<PromptLlmMessageEntryKind, 'custom'>;
    }
  }
  return null;
}

/**
 * 去掉人物模板条目 id 上的固定前缀
 * @param id 条目 id
 * @returns 不带类型前缀的基础 id
 */
function stripPromptPersonTemplateEntryIdPrefix(id: string): string {
  const kind = readPromptPersonTemplateEntryKindFromId(id);
  if (!kind) return id;
  const prefix = `${PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES[kind]}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) || id : id;
}

/**
 * 去掉 LLM 条目 id 上的固定前缀
 * @param id 条目 id
 * @returns 不带类型前缀的基础 id
 */
function stripPromptLlmMessageIdPrefix(id: string): string {
  const kind = readPromptLlmMessageEntryKindFromId(id);
  if (!kind) return id;
  const prefix = `${PROMPT_LLM_MESSAGE_ENTRY_ID_PREFIXES[kind]}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) || id : id;
}
