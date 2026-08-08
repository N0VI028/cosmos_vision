import { z } from 'zod';

import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { MAX_HISTORY_FLOOR_COUNT } from '@/constants/limits';
import type { PromptLlmAccount, PromptLlmSettings } from '@/constants/prompt-llm';
import { createPromptLlmAccount, PROMPT_LLM_DEFAULT_ACCOUNT_SOURCE, PROMPT_LLM_ROUTING_MODES } from '@/constants/prompt-llm';

type PlainRecord = Record<string, unknown>;

/**
 * 读取路由模式选项的 value 元组
 * @param options 路由模式固定列表
 * @returns z.enum 可用的 value 元组
 */
function routingModeValues<T extends readonly [{ value: string }, ...{ value: string }[]]>(
  options: T,
): [T[number]['value'], ...T[number]['value'][]] {
  return options.map(option => option.value) as [T[number]['value'], ...T[number]['value'][]];
}

/**
 * Prompt LLM 设置的持久化校验器
 * 负责约束账号列表、提取规则与历史楼层设置
 */
export const promptLlmSettingsSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      proxyPreset: z.string(),
      apiUrl: z.string(),
      apiKey: z.string(),
      source: z.string(),
      model: z.string(),
      customIncludeBody: z.string(),
      customExcludeBody: z.string(),
      customIncludeHeaders: z.string(),
      enabled: z.boolean(),
    }),
  ),
  routingMode: z.enum(routingModeValues(PROMPT_LLM_ROUTING_MODES)),
  timeout: z.number().int().positive(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
  topK: z.number(),
  shouldStream: z.boolean(),
  historyFloorCount: z.number().int().min(0).max(MAX_HISTORY_FLOOR_COUNT),
  ignoreUserMessagesInHistory: z.boolean(),
  preferJsonSchemaExtraction: z.boolean(),
  positivePromptJsonField: z.string(),
  negativePromptJsonField: z.string(),
  characterPromptsJsonField: z.string(),
  characterPositivePromptJsonField: z.string(),
  characterNegativePromptJsonField: z.string(),
  characterPositionJsonField: z.string(),
  characterPositionXJsonField: z.string(),
  characterPositionYJsonField: z.string(),
  positivePromptExtractPattern: z.string(),
  negativePromptExtractPattern: z.string(),
  characterPositivePromptExtractPattern: z.string(),
  characterNegativePromptExtractPattern: z.string(),
  characterPositionXExtractPattern: z.string(),
  characterPositionYExtractPattern: z.string(),
});

/**
 * 从异常配置中恢复提示词 LLM 设置
 * @param value 提示词 LLM 原始设置
 * @returns 局部回退后的提示词 LLM 设置
 */
export function recoverPromptLlmSettings(value: unknown): PromptLlmSettings {
  const fallback = DEFAULT_SETTINGS.promptLlm;
  const { read } = createRecoveryReader(value, fallback);
  const record = toPlainRecord(value);
  return {
    accounts: recoverPromptLlmAccounts(record),
    routingMode: read('routingMode', z.enum(routingModeValues(PROMPT_LLM_ROUTING_MODES))),
    timeout: read('timeout', z.number().int().positive()),
    temperature: read('temperature', z.number()),
    maxTokens: read('maxTokens', z.number()),
    topP: read('topP', z.number()),
    topK: read('topK', z.number()),
    shouldStream: read('shouldStream', z.boolean()),
    historyFloorCount: read('historyFloorCount', z.number().int().min(0).max(MAX_HISTORY_FLOOR_COUNT)),
    ignoreUserMessagesInHistory: read('ignoreUserMessagesInHistory', z.boolean()),
    preferJsonSchemaExtraction: read('preferJsonSchemaExtraction', z.boolean()),
    positivePromptJsonField: read('positivePromptJsonField', z.string()),
    negativePromptJsonField: read('negativePromptJsonField', z.string()),
    characterPromptsJsonField: read('characterPromptsJsonField', z.string()),
    characterPositivePromptJsonField: read('characterPositivePromptJsonField', z.string()),
    characterNegativePromptJsonField: read('characterNegativePromptJsonField', z.string()),
    characterPositionJsonField: read('characterPositionJsonField', z.string()),
    characterPositionXJsonField: read('characterPositionXJsonField', z.string()),
    characterPositionYJsonField: read('characterPositionYJsonField', z.string()),
    positivePromptExtractPattern: read('positivePromptExtractPattern', z.string()),
    negativePromptExtractPattern: read('negativePromptExtractPattern', z.string()),
    characterPositivePromptExtractPattern: read('characterPositivePromptExtractPattern', z.string()),
    characterNegativePromptExtractPattern: read('characterNegativePromptExtractPattern', z.string()),
    characterPositionXExtractPattern: read('characterPositionXExtractPattern', z.string()),
    characterPositionYExtractPattern: read('characterPositionYExtractPattern', z.string()),
  };
}

/** 旧版全局连接字段，迁移时写入首个账号的缺省字段 */
interface LegacyConnectionFields {
  proxyPreset: string;
  source: string;
  model: string;
  customIncludeBody: string;
  customExcludeBody: string;
  customIncludeHeaders: string;
}

/**
 * 恢复提示词 LLM 账号列表，兼容旧版配置
 * 无 accounts 时由旧顶层 apiUrl/apiKey/proxyPreset/source/model 迁移为单账号；
 * 有 accounts 时逐账号补齐缺失字段，旧全局连接字段写入首个账号
 * @param record 提示词 LLM 原始设置记录
 * @returns 可安全使用的账号列表
 */
function recoverPromptLlmAccounts(record: PlainRecord): PromptLlmAccount[] {
  const legacy = readLegacyConnectionFields(record);
  if (!Array.isArray(record.accounts)) {
    const account = createPromptLlmAccount(
      DEFAULT_SETTINGS.promptLlm.accounts[0].id,
      typeof record.apiUrl === 'string' ? record.apiUrl : '',
      typeof record.apiKey === 'string' ? record.apiKey : '',
      '默认账号',
    );
    account.proxyPreset = legacy.proxyPreset;
    account.source = legacy.source;
    account.model = legacy.model;
    account.customIncludeBody = legacy.customIncludeBody;
    account.customExcludeBody = legacy.customExcludeBody;
    account.customIncludeHeaders = legacy.customIncludeHeaders;
    return [account];
  }
  return record.accounts.map((account, index) => recoverPromptLlmAccount(account, index, legacy));
}

/**
 * 读取旧版全局连接字段
 * @param record 提示词 LLM 原始设置记录
 * @returns 旧版全局代理预设/来源/模型名
 */
function readLegacyConnectionFields(record: PlainRecord): LegacyConnectionFields {
  return {
    proxyPreset: typeof record.proxyPreset === 'string' ? record.proxyPreset : '',
    source: typeof record.source === 'string' ? record.source : PROMPT_LLM_DEFAULT_ACCOUNT_SOURCE,
    model: typeof record.model === 'string' ? record.model : '',
    customIncludeBody: typeof record.customIncludeBody === 'string' ? record.customIncludeBody : '',
    customExcludeBody: typeof record.customExcludeBody === 'string' ? record.customExcludeBody : '',
    customIncludeHeaders: typeof record.customIncludeHeaders === 'string' ? record.customIncludeHeaders : '',
  };
}

/**
 * 从异常配置中恢复单个提示词 LLM 账号
 * @param value 原始账号
 * @param index 账号序号
 * @param legacy 旧版全局连接字段，仅首个账号缺字段时继承
 * @returns 可安全使用的账号
 */
function recoverPromptLlmAccount(value: unknown, index: number, legacy: LegacyConnectionFields): PromptLlmAccount {
  const fallback = DEFAULT_SETTINGS.promptLlm.accounts[0];
  const record = toPlainRecord(value);
  return {
    id: parseField(z.string().min(1), record.id, `prompt-llm-account-${index + 1}`),
    name: parseField(z.string(), record.name, fallback.name),
    proxyPreset: parseField(z.string(), record.proxyPreset, index === 0 ? legacy.proxyPreset : fallback.proxyPreset),
    apiUrl: parseField(z.string(), record.apiUrl, fallback.apiUrl),
    apiKey: parseField(z.string(), record.apiKey, fallback.apiKey),
    source: parseField(z.string(), record.source, index === 0 ? legacy.source : fallback.source),
    model: parseField(z.string(), record.model, index === 0 ? legacy.model : fallback.model),
    customIncludeBody: parseField(
      z.string(),
      record.customIncludeBody,
      index === 0 ? legacy.customIncludeBody : fallback.customIncludeBody,
    ),
    customExcludeBody: parseField(
      z.string(),
      record.customExcludeBody,
      index === 0 ? legacy.customExcludeBody : fallback.customExcludeBody,
    ),
    customIncludeHeaders: parseField(
      z.string(),
      record.customIncludeHeaders,
      index === 0 ? legacy.customIncludeHeaders : fallback.customIncludeHeaders,
    ),
    enabled: parseField(z.boolean(), record.enabled, fallback.enabled),
  };
}

/**
 * 为设置恢复流程创建字段读取器
 * @param value 原始设置值
 * @param fallback 默认设置
 * @returns 原始记录与按字段回退的读取方法
 */
function createRecoveryReader<T extends object>(
  value: unknown,
  fallback: T,
): { read: <K extends keyof T>(key: K, schema: z.ZodType<T[K]>) => T[K] } {
  const record = toPlainRecord(value);
  return {
    read<K extends keyof T>(key: K, schema: z.ZodType<T[K]>): T[K] {
      return parseField(schema, record[key as string], fallback[key]);
    },
  };
}

/**
 * 解析字段并在失败时回退
 * @param schema 字段校验器
 * @param value 字段值
 * @param fallback 默认值
 * @returns 可安全使用的字段值
 */
function parseField<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : _.cloneDeep(fallback);
}

/**
 * 转换普通对象
 * @param value 待转换值
 * @returns 普通对象或空对象
 */
function toPlainRecord(value: unknown): PlainRecord {
  return _.isPlainObject(value) ? (value as PlainRecord) : {};
}
