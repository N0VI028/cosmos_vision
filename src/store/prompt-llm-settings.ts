import { z } from 'zod';

import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { PromptLlmSettings } from '@/constants/novelai';

type PlainRecord = Record<string, unknown>;

/**
 * Prompt LLM 设置的持久化校验器
 * 负责约束连接参数、提取规则与历史楼层设置
 */
export const promptLlmSettingsSchema = z.object({
  proxyPreset: z.string(),
  apiUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  source: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
  topK: z.number(),
  historyFloorCount: z.number().int().min(0),
  ignoreUserMessagesInHistory: z.boolean(),
  preferJsonSchemaExtraction: z.boolean(),
  positivePromptJsonField: z.string(),
  negativePromptJsonField: z.string(),
  characterPromptsJsonField: z.string(),
  characterPositivePromptJsonField: z.string(),
  characterNegativePromptJsonField: z.string(),
  characterPositionJsonField: z.string(),
  positivePromptExtractPattern: z.string(),
  negativePromptExtractPattern: z.string(),
  characterPositivePromptExtractPattern: z.string(),
  characterNegativePromptExtractPattern: z.string(),
  characterPositionXExtractPattern: z.string(),
  characterPositionYExtractPattern: z.string(),
  customIncludeBody: z.string(),
  customExcludeBody: z.string(),
  customIncludeHeaders: z.string(),
});

/**
 * 从异常配置中恢复提示词 LLM 设置
 * @param value 提示词 LLM 原始设置
 * @returns 局部回退后的提示词 LLM 设置
 */
export function recoverPromptLlmSettings(value: unknown): PromptLlmSettings {
  const fallback = DEFAULT_SETTINGS.promptLlm;
  const { read } = createRecoveryReader(value, fallback);
  return {
    proxyPreset: read('proxyPreset', z.string()),
    apiUrl: read('apiUrl', z.string()),
    apiKey: read('apiKey', z.string()),
    model: read('model', z.string()),
    source: read('source', z.string()),
    temperature: read('temperature', z.number()),
    maxTokens: read('maxTokens', z.number()),
    topP: read('topP', z.number()),
    topK: read('topK', z.number()),
    historyFloorCount: read('historyFloorCount', z.number().int().min(0)),
    ignoreUserMessagesInHistory: read('ignoreUserMessagesInHistory', z.boolean()),
    preferJsonSchemaExtraction: read('preferJsonSchemaExtraction', z.boolean()),
    positivePromptJsonField: read('positivePromptJsonField', z.string()),
    negativePromptJsonField: read('negativePromptJsonField', z.string()),
    characterPromptsJsonField: read('characterPromptsJsonField', z.string()),
    characterPositivePromptJsonField: read('characterPositivePromptJsonField', z.string()),
    characterNegativePromptJsonField: read('characterNegativePromptJsonField', z.string()),
    characterPositionJsonField: read('characterPositionJsonField', z.string()),
    positivePromptExtractPattern: read('positivePromptExtractPattern', z.string()),
    negativePromptExtractPattern: read('negativePromptExtractPattern', z.string()),
    characterPositivePromptExtractPattern: read('characterPositivePromptExtractPattern', z.string()),
    characterNegativePromptExtractPattern: read('characterNegativePromptExtractPattern', z.string()),
    characterPositionXExtractPattern: read('characterPositionXExtractPattern', z.string()),
    characterPositionYExtractPattern: read('characterPositionYExtractPattern', z.string()),
    customIncludeBody: read('customIncludeBody', z.string()),
    customExcludeBody: read('customExcludeBody', z.string()),
    customIncludeHeaders: read('customIncludeHeaders', z.string()),
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
