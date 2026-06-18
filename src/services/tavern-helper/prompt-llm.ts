import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type { PromptLlmOutputFields, PromptLlmSettings } from '@/constants/novelai';
import { findProxyPreset } from '@/services/sillytavern/openai-config';
import { z } from 'zod';

export type { PromptLlmOutputFields } from '@/constants/novelai';

/**
 * 提示词 LLM 输出结构(JSON Schema 强制)
 * 仅包含正负提示词,其他 NovelAI 参数复用现有设置
 */
export interface PromptLlmOutput {
  positivePrompt: string;
  negativePrompt: string;
}

/** Prompt LLM 正则提取配置 */
export interface PromptLlmExtractSettings {
  positivePromptExtractPattern: string;
  positivePromptExtractReplacement: string;
  negativePromptExtractPattern: string;
  negativePromptExtractReplacement: string;
}

/** Prompt LLM 单侧提示词字段 */
export type PromptLlmPromptField = 'positive' | 'negative';

/** Prompt LLM 原始返回解析模式 */
export type PromptLlmPromptMode = 'extract' | 'direct';

/**
 * TavernHelper 原始提示词角色条目
 */
export interface TavernHelperRolePrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * TavernHelper custom_api 配置
 */
export interface TavernHelperCustomApiConfig {
  proxy_preset?: string;
  apiurl?: string;
  key?: string;
  model?: string;
  source?: string;
  max_tokens?: 'same_as_preset' | 'unset' | number;
  temperature?: 'same_as_preset' | 'unset' | number;
  top_p?: 'same_as_preset' | 'unset' | number;
  top_k?: 'same_as_preset' | 'unset' | number;
}

/**
 * TavernHelper.generateRaw 请求配置
 */
export interface TavernHelperGenerateRawConfig {
  user_input?: string;
  ordered_prompts?: Array<string | TavernHelperRolePrompt>;
  custom_api?: TavernHelperCustomApiConfig;
  json_schema?: TavernHelperJsonSchema;
  should_silence?: boolean;
}

/**
 * TavernHelper JSON Schema 输出约束
 */
export interface TavernHelperJsonSchema {
  name: string;
  description?: string;
  value: Record<string, unknown>;
  strict?: boolean;
}

const promptLlmRequestBaseSchema = z.object({
  proxyPreset: z.string().trim(),
  apiUrl: z.string().trim(),
  apiKey: z.string().trim(),
  model: z.string().trim().min(1, '请先选择或填写模型'),
  source: z.string().trim().min(1, '请先选择来源标识'),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
  topK: z.number(),
});

type PromptLlmRequestSettings = z.infer<typeof promptLlmRequestBaseSchema>;

const promptLlmRequestSchema = promptLlmRequestBaseSchema.superRefine(addConnectionIssues);
const PROMPT_LLM_JSON_SCHEMA_NAME = 'cosmos_vision_prompt_output';
const PROMPT_LLM_JSON_SCHEMA_DESCRIPTION = '文生图正负提示词输出';
const PROMPT_OUTPUT_LABELS = {
  positive: '(?:positive(?:Prompt| prompt)?|正[向面]提示词)',
  negative: '(?:negative(?:Prompt| prompt)?|负[向面]提示词)',
} as const;

const PROMPT_EXTRACT_FIELD_CONFIG = {
  positive: {
    patternKey: 'positivePromptExtractPattern',
    replacementKey: 'positivePromptExtractReplacement',
    label: '正面提示词',
  },
  negative: {
    patternKey: 'negativePromptExtractPattern',
    replacementKey: 'negativePromptExtractReplacement',
    label: '负面提示词',
  },
} as const satisfies Record<
  PromptLlmPromptField,
  {
    patternKey: keyof PromptLlmExtractSettings;
    replacementKey: keyof PromptLlmExtractSettings;
    label: string;
  }
>;

interface PromptExtractRule {
  pattern: string;
  flags: string;
  replacement: string;
}

/**
 * 格式化 generateRaw 返回值为可提取文本
 * @param rawResult generateRaw 原始返回
 * @returns 可用于正则提取的响应文本
 */
export function formatPromptLlmRawResult(rawResult: unknown): string {
  return typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
}

/**
 * 收集已填写字段名的有效侧
 * @param fields 字段名配置
 * @returns 有效字段名列表(按正面、负面顺序)
 */
function collectPromptOutputFields(fields: PromptLlmOutputFields | null): string[] {
  if (!fields) return [];
  return [fields.positive, fields.negative].filter((name): name is string => Boolean(name?.trim()));
}

/**
 * 构建 JSON Schema,强制 LLM 输出符合 PromptLlmOutput 结构
 * 逐侧:仅声明填写了字段名的那一侧,留空侧不在 schema 中要求
 */
export function buildJsonSchema(
  fields: PromptLlmOutputFields = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): TavernHelperJsonSchema {
  const fieldList = collectPromptOutputFields(fields);
  return {
    name: PROMPT_LLM_JSON_SCHEMA_NAME,
    description: PROMPT_LLM_JSON_SCHEMA_DESCRIPTION,
    strict: true,
    value: {
      type: 'object',
      properties: Object.fromEntries(
        fieldList.map(name => [
          name,
          {
            type: 'string',
            description:
              name === fields.positive
                ? '正向提示词,描述希望生成的视觉元素'
                : '负向提示词,描述不希望出现的元素',
          },
        ]),
      ),
      required: fieldList,
      additionalProperties: false,
    },
  };
}

/**
 * 校验提示词 LLM 请求配置是否完整
 * @param settings 提示词 LLM 配置
 * @returns 不可请求时返回提示文案
 */
export function getPromptLlmRequestError(settings: PromptLlmSettings): string | null {
  const result = promptLlmRequestSchema.safeParse(settings);
  return result.success ? null : getFirstIssueMessage(result.error);
}

/**
 * 构建 custom_api 配置对象
 * @param settings 提示词 LLM 配置
 * @returns TavernHelper custom_api 配置
 */
export function buildCustomApi(settings: PromptLlmSettings): TavernHelperCustomApiConfig {
  const parsedSettings = parsePromptLlmRequestSettings(settings);

  const proxyPreset = findProxyPreset(parsedSettings.proxyPreset);
  const api: TavernHelperCustomApiConfig = {
    model: parsedSettings.model,
    source: parsedSettings.source,
    temperature: parsedSettings.temperature,
    max_tokens: parsedSettings.maxTokens,
    top_p: parsedSettings.topP,
    top_k: parsedSettings.topK,
  };

  if (proxyPreset) {
    api.proxy_preset = proxyPreset.name;
  } else {
    api.apiurl = parsedSettings.apiUrl;
    api.key = parsedSettings.apiKey;
  }

  return api;
}

/**
 * 解析可发送的提示词 LLM 配置
 * @param settings 提示词 LLM 配置
 * @returns 已清理空白的配置
 */
function parsePromptLlmRequestSettings(settings: PromptLlmSettings): PromptLlmRequestSettings {
  const result = promptLlmRequestSchema.safeParse(settings);
  if (result.success) return result.data;
  throw new Error(getFirstIssueMessage(result.error));
}

/**
 * 添加连接方式校验问题
 * @param settings 已基础校验的请求配置
 * @param ctx Zod 校验上下文
 */
function addConnectionIssues(settings: PromptLlmRequestSettings, ctx: z.RefinementCtx): void {
  if (settings.proxyPreset && settings.proxyPreset !== 'None') {
    addProxyPresetIssue(settings.proxyPreset, ctx);
    return;
  }

  addManualConnectionIssues(settings, ctx);
}

/**
 * 添加代理预设校验问题
 * @param presetName 代理预设名称
 * @param ctx Zod 校验上下文
 */
function addProxyPresetIssue(presetName: string, ctx: z.RefinementCtx): void {
  const preset = findProxyPreset(presetName);
  if (!preset) return addCustomIssue(ctx, '所选代理预设不存在，请重新选择');
  if (!preset.url.trim()) addCustomIssue(ctx, '所选代理预设未配置接口地址');
}

/**
 * 添加手填接口校验问题
 * @param settings 已基础校验的请求配置
 * @param ctx Zod 校验上下文
 */
function addManualConnectionIssues(settings: PromptLlmRequestSettings, ctx: z.RefinementCtx): void {
  if (!settings.apiUrl) addCustomIssue(ctx, '请先填写接口地址');
  if (!settings.apiKey) addCustomIssue(ctx, '请先填写接口密钥');
}

/**
 * 添加自定义校验问题
 * @param ctx Zod 校验上下文
 * @param message 提示文案
 */
function addCustomIssue(ctx: z.RefinementCtx, message: string): void {
  ctx.addIssue({ code: 'custom', message });
}

/**
 * 读取首个 Zod 校验问题文案
 * @param error Zod 校验错误
 * @returns 首个错误文案
 */
function getFirstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'LLM 配置不完整';
}

/**
 * 构建显式消息列表 generateRaw 请求
 * @param orderedPrompts 按顺序发送的消息列表
 * @param customApi 自定义接口配置
 * @param jsonSchema 输出约束
 * @returns generateRaw 请求体
 */
export function buildGenerateRawMessagesRequest(
  orderedPrompts: TavernHelperRolePrompt[],
  customApi: TavernHelperCustomApiConfig,
  jsonSchema?: TavernHelperJsonSchema,
): TavernHelperGenerateRawConfig {
  return {
    ordered_prompts: orderedPrompts.filter(hasPromptContent),
    custom_api: customApi,
    json_schema: jsonSchema,
  };
}

/**
 * 判断消息是否包含有效内容
 * @param prompt 角色消息
 * @returns 是否包含可发送文本
 */
function hasPromptContent(prompt: TavernHelperRolePrompt): boolean {
  return Boolean(prompt.content.trim());
}

/**
 * 解析 generateRaw 返回值,提取正负提示词
 * @param rawResult generateRaw 原始返回
 * @param fields JSON 字段名
 * @returns 正负提示词对象
 */
export function parsePromptLlmOutput(
  rawResult: unknown,
  fields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): PromptLlmOutput {
  if (typeof rawResult !== 'string') {
    throw new Error('LLM 返回值不是字符串');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    throw new Error('LLM 返回值不是有效 JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM 返回值不是对象');
  }

  const output = fields ? normalizePromptLlmOutput(parsed, fields) : null;
  if (!output) throw new Error('LLM 返回值缺少正向或负向提示词字段');
  return output;
}

/**
 * 尝试从 LLM 原始文本读取正负提示词
 * @param rawText LLM 原始文本
 * @returns 可读取时返回正负提示词,否则返回 null
 */
export function readPromptLlmOutput(
  rawText: string,
  fields: PromptLlmOutputFields = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): PromptLlmOutput | null {
  return readPromptLlmJsonOutput(rawText, fields) ?? readLabeledPromptLlmOutput(rawText);
}

/**
 * 按公共 LLM 设置构建 JSON Schema 字段配置
 * 所有生图渠道共享:开启优先 JSON Schema 时返回逐侧字段配置(至少一侧填写),否则返回 null
 * @param settings 提示词 LLM 配置
 * @returns 字段配置或 null(两侧均空时降级为正则/标签提取)
 */
export function buildPromptLlmSchemaFields(settings: PromptLlmSettings): PromptLlmOutputFields | null {
  if (!settings.preferJsonSchemaExtraction) return null;
  return readPromptLlmOutputFields(settings);
}

/**
 * 从提示词 LLM 设置读取逐侧 JSON 输出字段名
 * @param settings 提示词 LLM 配置
 * @returns 逐侧字段名(空串表示该侧不参与);两侧均空返回 null 触发降级
 */
function readPromptLlmOutputFields(settings: PromptLlmSettings): PromptLlmOutputFields | null {
  const positive = settings.positivePromptJsonField.trim();
  const negative = settings.negativePromptJsonField.trim();
  if (!positive && !negative) return null;
  return { positive, negative };
}

/**
 * 按公共 LLM 设置读取优先 JSON 输出,失败回退到用户正则
 * 所有生图渠道共享的优先 JSON Schema 提取入口
 * @param rawText LLM 原始返回
 * @param settings 提示词 LLM 配置
 * @returns 正负提示词或 null
 */
export function readPreferredPromptLlmOutput(rawText: string, settings: PromptLlmSettings): PromptLlmOutput | null {
  const fields = settings.preferJsonSchemaExtraction ? readPromptLlmOutputFields(settings) : null;
  if (fields) {
    const jsonOutput = readPromptLlmJsonOutput(rawText, fields);
    if (jsonOutput) return jsonOutput;
  }
  return readPromptLlmOutputByRules(rawText, settings);
}

/**
 * 按 JSON、用户正则、标签兜底顺序读取正负提示词
 * @param rawText LLM 原始文本
 * @param settings 正则提取设置
 * @param fields JSON 字段名
 * @returns 可读取时返回正负提示词,否则返回 null
 */
export function readPromptLlmOutputWithRules(
  rawText: string,
  settings: PromptLlmExtractSettings,
  fields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): PromptLlmOutput | null {
  const jsonOutput = fields ? readPromptLlmJsonOutput(rawText, fields) : null;
  return jsonOutput ?? readPromptLlmOutputByRules(rawText, settings) ?? readLabeledPromptLlmOutput(rawText);
}

/**
 * 按用户正则提取 LLM 正负提示词
 * @param rawText LLM 原始文本
 * @param settings 正则提取设置
 * @returns 正负提示词或 null
 */
export function readPromptLlmOutputByRules(
  rawText: string,
  settings: PromptLlmExtractSettings,
): PromptLlmOutput | null {
  const positivePrompt = resolvePromptLlmSource(rawText, 'extract', settings, 'positive');
  const negativePrompt = resolvePromptLlmSource(rawText, 'extract', settings, 'negative');
  if (!positivePrompt && !negativePrompt) return null;
  return { positivePrompt, negativePrompt };
}

/**
 * 根据模式解析 LLM 原始输入
 * @param prompt 原始输入
 * @param mode 提示词解析模式
 * @param settings 正则提取设置
 * @param field 提示词字段
 * @returns 解析后的提示词
 */
export function resolvePromptLlmSource(
  prompt: string,
  mode: PromptLlmPromptMode,
  settings: PromptLlmExtractSettings,
  field: PromptLlmPromptField,
): string {
  const source = prompt.trim();
  if (!source) return '';
  if (mode === 'direct') return source;
  return extractPromptByRule(source, settings, field);
}

/**
 * 从 JSON 文本读取正负提示词
 * @param rawText LLM 原始文本
 * @param fields JSON 字段名
 * @returns 可读取时返回正负提示词,否则返回 null
 */
export function readPromptLlmJsonOutput(rawText: string, fields: PromptLlmOutputFields): PromptLlmOutput | null {
  try {
    return normalizePromptLlmOutput(JSON.parse(rawText), fields);
  } catch {
    return null;
  }
}

/**
 * 从带标签文本读取正负提示词
 * @param rawText LLM 原始文本
 * @returns 可读取时返回正负提示词,否则返回 null
 */
function readLabeledPromptLlmOutput(rawText: string): PromptLlmOutput | null {
  const positivePrompt = readLabeledPrompt(rawText, 'positive');
  const negativePrompt = readLabeledPrompt(rawText, 'negative');
  if (positivePrompt === null || negativePrompt === null) return null;
  return { positivePrompt, negativePrompt };
}

/**
 * 读取单个标签提示词字段
 * @param rawText LLM 原始文本
 * @param field 字段类型
 * @returns 字段文本或 null
 */
function readLabeledPrompt(rawText: string, field: 'positive' | 'negative'): string | null {
  const opposite = field === 'positive' ? 'negative' : 'positive';
  const label = PROMPT_OUTPUT_LABELS[field];
  const nextLabel = PROMPT_OUTPUT_LABELS[opposite];
  const regex = new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*${nextLabel}\\s*[:：]|$)`, 'i');
  const value = regex.exec(rawText)?.[1]?.trim();
  return value || null;
}

/**
 * 按用户规则提取单侧 LLM 提示词
 * @param prompt LLM 原始提示词
 * @param settings 正则提取设置
 * @param field 提示词字段
 * @returns 提取后的提示词
 */
function extractPromptByRule(prompt: string, settings: PromptLlmExtractSettings, field: PromptLlmPromptField): string {
  const source = prompt.trim();
  if (!source) return '';
  const config = PROMPT_EXTRACT_FIELD_CONFIG[field];
  const pattern = settings[config.patternKey].trim();
  if (!pattern) return '';
  const replacement = settings[config.replacementKey].trim();
  return applyPromptExtractRule(source, buildPromptExtractRule(pattern, replacement), config.label);
}

/**
 * 应用提示词提取规则
 * @param source LLM 原始响应文本
 * @param rule 提取规则
 * @param label 提示词标签
 * @returns 提取结果
 */
function applyPromptExtractRule(source: string, rule: PromptExtractRule, label: string): string {
  const regex = createPromptExtractRegex(rule, label);
  const match = regex.exec(source);
  if (!match) return '';
  if (!rule.replacement) return match[0].trim();
  regex.lastIndex = 0;
  return match[0].replace(regex, rule.replacement).trim();
}

/**
 * 构建规则对象
 * @param patternText 正则文本
 * @param replacement 替换模板
 * @returns 规则对象
 */
function buildPromptExtractRule(patternText: string, replacement: string): PromptExtractRule {
  const literal = parseRegexLiteral(patternText);
  if (literal) return { ...literal, replacement };
  return { pattern: patternText, flags: '', replacement };
}

/**
 * 解析 /pattern/flags 形式的正则文本
 * @param value 正则文本
 * @returns 解析结果
 */
function parseRegexLiteral(value: string): Pick<PromptExtractRule, 'pattern' | 'flags'> | null {
  if (!value.startsWith('/')) return null;
  const endIndex = value.lastIndexOf('/');
  if (endIndex <= 0) return null;
  return {
    pattern: value.slice(1, endIndex),
    flags: value.slice(endIndex + 1),
  };
}

/**
 * 创建提取规则对应的正则对象
 * @param rule 提取规则
 * @param label 提示词标签
 * @returns 正则对象
 */
function createPromptExtractRegex(rule: PromptExtractRule, label: string): RegExp {
  try {
    return new RegExp(rule.pattern, rule.flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`${label}提取规则无效: ${message}`);
  }
}

/**
 * 归一化提示词 LLM 输出对象
 * @param value 待归一化值
 * @returns 正负提示词对象或 null
 */
function normalizePromptLlmOutput(value: unknown, fields: PromptLlmOutputFields): PromptLlmOutput | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  // 逐侧读取:有键名则必须读到字符串否则整体失败触发降级,无键名则该侧置空交给固定预设
  const positivePrompt = resolvePromptOutputField(obj, fields.positive);
  const negativePrompt = resolvePromptOutputField(obj, fields.negative);
  if (positivePrompt === null || negativePrompt === null) return null;
  return { positivePrompt, negativePrompt };
}

/**
 * 读取单侧 JSON 提示词字段
 * @param obj LLM 返回对象
 * @param key 字段名,空表示该侧不参与 JSON 提取
 * @returns 字段文本;无键名返回空串,有键名读不到返回 null
 */
function resolvePromptOutputField(obj: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return '';
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}
