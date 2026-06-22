import type { ComfyUISettings, ImageSource } from '@/constants/comfyui';
import type { ImagePromptPresetReferences, ImagePromptPresetSettings } from '@/constants/image-prompt';

/**
 * NovelAI 设置静态枚举与默认值
 * 集中维护模型列表与默认设置,供 store 初始化与 UI 下拉使用
 */

/** NovelAI 模型固定列表(本期不开放自定义) */
export const NOVELAI_MODELS = [
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion v4.5 Full' },
  { value: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion v4.5 Curated' },
  { value: 'nai-diffusion-4-full', label: 'NAI Diffusion v4 Full' },
  { value: 'nai-diffusion-3', label: 'NAI Diffusion v3' },
] as const;

/** NovelAI 采样器固定列表 */
export const NOVELAI_SAMPLERS = [
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim', label: 'DDIM' },
] as const;

/** NovelAI 负向提示词程度固定列表 */
export const NOVELAI_UC_PRESETS = [
  { value: 'Heavy', label: '重度' },
  { value: 'Light', label: '轻度' },
  { value: 'None', label: '无' },
] as const;

/** NovelAI 图像尺寸预设(对齐 nai-webui) */
export const NOVELAI_RESOLUTION_PRESETS = [
  { value: 'normal-portrait', label: 'Normal Portrait (832x1216)', width: 832, height: 1216 },
  { value: 'normal-landscape', label: 'Normal Landscape (1216x832)', width: 1216, height: 832 },
  { value: 'normal-square', label: 'Normal Square (1024x1024)', width: 1024, height: 1024 },
  { value: 'large-portrait', label: 'Large Portrait (1024x1536)', width: 1024, height: 1536 },
  { value: 'large-landscape', label: 'Large Landscape (1536x1024)', width: 1536, height: 1024 },
  { value: 'large-square', label: 'Large Square (1472x1472)', width: 1472, height: 1472 },
  { value: 'wallpaper-portrait', label: 'Wallpaper Portrait (1088x1920)', width: 1088, height: 1920 },
  { value: 'wallpaper-landscape', label: 'Wallpaper Landscape (1920x1088)', width: 1920, height: 1088 },
  { value: 'small-portrait', label: 'Small Portrait (512x768)', width: 512, height: 768 },
  { value: 'small-landscape', label: 'Small Landscape (768x512)', width: 768, height: 512 },
  { value: 'small-square', label: 'Small Square (640x640)', width: 640, height: 640 },
] as const;

export const NOVELAI_CUSTOM_RESOLUTION_PRESET = 'custom';
export const NOVELAI_IMAGE_SIZE_LIMITS = { min: 64, max: 2048, step: 64 } as const;
export const NOVELAI_DEFAULT_URL = 'https://image.novelai.net';
export const NOVELAI_DEFAULT_ACCOUNT_ID = 'novelai-account-1';

/** NovelAI 路由模式固定列表 */
export const NOVELAI_ROUTING_MODES = [
  { value: 'sequential', label: '顺序使用' },
  { value: 'load_balance', label: '负载均衡' },
] as const;

/** NovelAI 模型 value 联合类型 */
export type NovelAIModel = (typeof NOVELAI_MODELS)[number]['value'];

/** NovelAI 采样器 value 联合类型 */
export type NovelAISampler = (typeof NOVELAI_SAMPLERS)[number]['value'];

/** NovelAI 负向提示词程度 value 联合类型 */
export type NovelAIUcPreset = (typeof NOVELAI_UC_PRESETS)[number]['value'];

/** NovelAI 图像尺寸预设 value 联合类型 */
export type NovelAIResolutionPreset =
  | (typeof NOVELAI_RESOLUTION_PRESETS)[number]['value']
  | typeof NOVELAI_CUSTOM_RESOLUTION_PRESET;

/** NovelAI 路由模式 value 联合类型 */
export type NovelAIRoutingMode = (typeof NOVELAI_ROUTING_MODES)[number]['value'];

/**
 * NovelAI 订阅档位映射
 * tier 数字 → 档位标签 + 主题强调色,供订阅卡片展示
 */
export const NOVELAI_TIERS = [
  { tier: 0, label: '纸张', accent: '#c9d1e0' },
  { tier: 1, label: '石板', accent: '#60a5fa' },
  { tier: 2, label: '卷轴', accent: '#a78bfa' },
  { tier: 3, label: '巨著', accent: '#f5b942' },
] as const;

/** NovelAI 订阅档位标签联合类型 */
export type NovelAITierLabel = (typeof NOVELAI_TIERS)[number]['label'];

/** NovelAI 账号条目 */
export interface NovelAIAccount {
  id: string;
  url: string;
  apiKey: string;
}

/** NovelAI 子设置 */
export interface NovelAISettings extends ImagePromptPresetReferences {
  accounts: NovelAIAccount[];
  routingMode: NovelAIRoutingMode;
  corsProxy: string;
  model: NovelAIModel;
  resolutionPreset: NovelAIResolutionPreset;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: NovelAISampler;
  addQualityTags: boolean;
  ucPreset: NovelAIUcPreset;
}

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
  /** 是否优先 JSON Schema 解析(公共:所有生图渠道共享) */
  preferJsonSchemaExtraction: boolean;
  /** 正面提示词 JSON 字段名 */
  positivePromptJsonField: string;
  /** 负面提示词 JSON 字段名 */
  negativePromptJsonField: string;
  /** 正面提示词正则提取规则 */
  positivePromptExtractPattern: string;
  /** 正面提示词正则替换模板 */
  positivePromptExtractReplacement: string;
  /** 负面提示词正则提取规则 */
  negativePromptExtractPattern: string;
  /** 负面提示词正则替换模板 */
  negativePromptExtractReplacement: string;
}

/** 提示词 LLM 运行时上下文 */
export interface PromptLlmContext {
  /** 焦点段落所属整条 mes 的全部历史段落 */
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
}

/** 提示词 LLM 消息角色 */
export const PROMPT_LLM_MESSAGE_ROLES = ['system', 'user', 'assistant'] as const;

/** 提示词 LLM 消息角色 */
export type PromptLlmMessageRole = (typeof PROMPT_LLM_MESSAGE_ROLES)[number];

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

const PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES: Record<
  Exclude<PromptPersonTemplateEntryKind, 'custom'>,
  string
> = {
  character_description: 'character-description',
  character_worldbook_entry: 'character-worldbook-entry',
  user_persona: 'user-persona',
};

/** 人物模板条目来源引用 */
export interface PromptPersonSourceReference {
  characterName?: string;
  personaId?: string;
  personaName?: string;
  worldbookName?: string;
  entryUid?: number;
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
 * 按条目 id 前缀读取人物模板条目类型
 * @param id 条目 id
 * @returns 外部条目类型或 null
 */
function readPromptPersonTemplateEntryKindFromId(
  id: string,
): Exclude<PromptPersonTemplateEntryKind, 'custom'> | null {
  for (const [kind, prefix] of Object.entries(PROMPT_PERSON_TEMPLATE_ENTRY_ID_PREFIXES)) {
    if (id === prefix || id.startsWith(`${prefix}:`)) {
      return kind as Exclude<PromptPersonTemplateEntryKind, 'custom'>;
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
 * 创建 NovelAI 账号条目
 * @param id 账号 id
 * @param url NovelAI URL
 * @param apiKey NovelAI API Key
 * @returns 账号条目
 */
export function createNovelAIAccount(id: string, url = NOVELAI_DEFAULT_URL, apiKey = ''): NovelAIAccount {
  return { id, url, apiKey };
}

/** CosmosVision 顶层设置 */
export interface CosmosVisionSettings {
  enabled: boolean;
  darkMode: boolean;
  imageSource: ImageSource;
  imagePromptPresets: ImagePromptPresetSettings;
  novelai: NovelAISettings;
  comfyui: ComfyUISettings;
  promptLlm: PromptLlmSettings;
  promptLlmMessagePresets: PromptLlmMessagePresetSettings;
  promptProfiles: PromptProfilesSettings;
}
