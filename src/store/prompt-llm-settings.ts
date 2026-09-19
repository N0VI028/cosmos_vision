import _ from 'lodash';
import { z } from 'zod';

import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { MAX_HISTORY_FLOOR_COUNT } from '@/constants/limits';
import type { PromptLlmAccount, PromptLlmSettings } from '@/constants/prompt-llm';
import {
  createPromptLlmAccount,
  PROMPT_LLM_DEFAULT_ACCOUNT_SOURCE,
  PROMPT_LLM_ROUTING_MODES,
} from '@/constants/prompt-llm';

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
      temperature: z.number(),
      maxTokens: z.number(),
      topP: z.number(),
      topK: z.number(),
      shouldStream: z.boolean(),
      enabled: z.boolean(),
    }),
  ),
  routingMode: z.enum(routingModeValues(PROMPT_LLM_ROUTING_MODES)),
  timeout: z.number().int().positive(),
  historyFloorCount: z.number().int().min(0).max(MAX_HISTORY_FLOOR_COUNT),
  ignoreUserMessagesInHistory: z.boolean(),
  autoCharacterInfo: z.boolean(),
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
    historyFloorCount: read('historyFloorCount', z.number().int().min(0).max(MAX_HISTORY_FLOOR_COUNT)),
    ignoreUserMessagesInHistory: read('ignoreUserMessagesInHistory', z.boolean()),
    autoCharacterInfo: read('autoCharacterInfo', z.boolean()),
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

/** 旧版单账号的顶层连接字段名 */
const PROMPT_LLM_LEGACY_CONNECTION_KEYS = [
  'proxyPreset',
  'apiUrl',
  'apiKey',
  'source',
  'model',
  'customIncludeBody',
  'customExcludeBody',
  'customIncludeHeaders',
] as const;

/** 旧版全局生成参数字段名 */
const PROMPT_LLM_LEGACY_PARAM_KEYS = ['temperature', 'maxTokens', 'topP', 'topK'] as const;

/** 账号生成参数字段集合（迁移与恢复共用） */
type AccountParamFields = Pick<
  PromptLlmAccount,
  'temperature' | 'maxTokens' | 'topP' | 'topK' | 'shouldStream'
>;

/**
 * 将旧顶层生成参数拷贝给缺少对应参数的账号
 * 仅拷贝确实存在的旧全局值，不把默认值提前写入原始记录
 * @param accounts 账号列表原始记录
 * @param record 顶层设置记录
 * @returns 是否发生了拷贝写入
 */
function applyLegacyParamsToAccounts(accounts: unknown[], record: PlainRecord): boolean {
  let applied = false;
  for (const item of accounts) {
    if (!item || typeof item !== 'object') continue;
    const account = item as PlainRecord;
    for (const key of PROMPT_LLM_LEGACY_PARAM_KEYS) {
      if (typeof account[key] !== 'number' && typeof record[key] === 'number') {
        account[key] = record[key];
        applied = true;
      }
    }
    if (typeof account.shouldStream !== 'boolean' && typeof record.shouldStream === 'boolean') {
      account.shouldStream = record.shouldStream;
      applied = true;
    }
  }
  return applied;
}

/**
 * 将旧版单账号连接字段与旧全局生成参数归一化为账号列表
 * 在 schema 校验前调用：存在旧顶层连接字段或旧生成参数且缺少 accounts 时，把旧字段迁移为单账号写入 record；
 * 若已有 accounts，且存在旧全局生成参数，则为缺少生成参数的账号补齐
 * @param record 提示词 LLM 原始设置记录
 * @returns 是否发生了迁移写入
 */
export function normalizeLegacyPromptLlmAccounts(record: PlainRecord): boolean {
  if (Array.isArray(record.accounts)) {
    return applyLegacyParamsToAccounts(record.accounts, record);
  }
  const hasLegacyConn = PROMPT_LLM_LEGACY_CONNECTION_KEYS.some(key => typeof record[key] === 'string');
  const hasLegacyParams =
    PROMPT_LLM_LEGACY_PARAM_KEYS.some(key => typeof record[key] === 'number') ||
    typeof record.shouldStream === 'boolean';
  if (!hasLegacyConn && !hasLegacyParams) return false;
  record.accounts = recoverPromptLlmAccounts(record);
  return true;
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
 * 无 accounts 时由旧顶层连接与生成参数迁移为单账号；
 * 有 accounts 时逐账号补齐缺失字段，旧全局生成参数作为每个账号的 fallback 拷贝
 * @param record 提示词 LLM 原始设置记录
 * @returns 可安全使用的账号列表
 */
function recoverPromptLlmAccounts(record: PlainRecord): PromptLlmAccount[] {
  const legacyConn = readLegacyConnectionFields(record);
  const legacyParams = readAccountParamFields(record, DEFAULT_SETTINGS.promptLlm.accounts[0]);
  if (!Array.isArray(record.accounts)) {
    const account = createPromptLlmAccount(
      DEFAULT_SETTINGS.promptLlm.accounts[0].id,
      typeof record.apiUrl === 'string' ? record.apiUrl : '',
      typeof record.apiKey === 'string' ? record.apiKey : '',
      '默认账号',
    );
    Object.assign(account, legacyConn, legacyParams);
    return [account];
  }
  return record.accounts.map((account, index) => recoverPromptLlmAccount(account, index, legacyConn, legacyParams));
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
 * 读取账号生成参数（账号自身值优先，缺失或类型不符时回退 fallback）
 * @param record 账号或顶层原始记录
 * @param fallback 回退值（来自旧全局参数或默认账号）
 * @returns 恢复后的生成参数
 */
function readAccountParamFields(record: PlainRecord, fallback: AccountParamFields): AccountParamFields {
  return {
    temperature: parseField(z.number(), record.temperature, fallback.temperature),
    maxTokens: parseField(z.number(), record.maxTokens, fallback.maxTokens),
    topP: parseField(z.number(), record.topP, fallback.topP),
    topK: parseField(z.number(), record.topK, fallback.topK),
    shouldStream: parseField(z.boolean(), record.shouldStream, fallback.shouldStream),
  };
}

/**
 * 从异常配置中恢复单个提示词 LLM 账号
 * @param value 账号原始数据
 * @param index 账号在列表中的索引
 * @param legacyConn 旧版顶层连接回退值
 * @param legacyParams 旧版顶层生成参数回退值
 * @returns 局部回退后的账号对象
 */
function recoverPromptLlmAccount(
  value: unknown,
  index: number,
  legacyConn: LegacyConnectionFields,
  legacyParams: AccountParamFields,
): PromptLlmAccount {
  const fallback = DEFAULT_SETTINGS.promptLlm.accounts[0];
  const record = toPlainRecord(value);
  const isFirst = index === 0;
  const params = readAccountParamFields(record, legacyParams);
  return {
    id: parseField(z.string().min(1), record.id, `prompt-llm-account-${index + 1}`),
    name: parseField(z.string(), record.name, fallback.name),
    proxyPreset: parseField(z.string(), record.proxyPreset, isFirst ? legacyConn.proxyPreset : fallback.proxyPreset),
    apiUrl: parseField(z.string(), record.apiUrl, fallback.apiUrl),
    apiKey: parseField(z.string(), record.apiKey, fallback.apiKey),
    source: parseField(z.string(), record.source, isFirst ? legacyConn.source : fallback.source),
    model: parseField(z.string(), record.model, isFirst ? legacyConn.model : fallback.model),
    customIncludeBody: parseField(
      z.string(),
      record.customIncludeBody,
      isFirst ? legacyConn.customIncludeBody : fallback.customIncludeBody,
    ),
    customExcludeBody: parseField(
      z.string(),
      record.customExcludeBody,
      isFirst ? legacyConn.customExcludeBody : fallback.customExcludeBody,
    ),
    customIncludeHeaders: parseField(
      z.string(),
      record.customIncludeHeaders,
      isFirst ? legacyConn.customIncludeHeaders : fallback.customIncludeHeaders,
    ),
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    topP: params.topP,
    topK: params.topK,
    shouldStream: params.shouldStream,
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
