import type { PromptLlmSettings, PromptLlmOutputFields } from '@/constants/prompt-llm';
import {
  extractOutputBlock,
  readPromptLlmOutputByRules,
} from '@/services/tavern-helper/prompt-llm';

/** LLM 提取失败的错误类型 */
export type PromptLlmExtractionErrorType =
  | 'empty_output'           // LLM 返回空内容
  | 'parse_failed'           // JSON 解析失败
  | 'regex_no_match'         // 正则表达式无匹配
  | 'missing_required_field' // 缺少必需字段
  | 'invalid_format';        // 格式不符合预期

/** LLM 提取错误详情 */
export interface PromptLlmExtractionError extends Error {
  type: PromptLlmExtractionErrorType;
  rawOutput: string;
  preview: string;
  suggestion?: string;
}

/** 原始输出预览长度限制 */
const MAX_PREVIEW_LENGTH = 200;

/** 错误消息模板 */
const ERROR_MESSAGES: Record<PromptLlmExtractionErrorType, string> = {
  empty_output: 'LLM 返回了空内容',
  parse_failed: 'LLM 返回的 JSON 格式无效',
  regex_no_match: '无法从 LLM 输出中提取到提示词',
  missing_required_field: 'LLM 返回的内容缺少必需字段',
  invalid_format: 'LLM 返回的格式不符合预期',
};

/** 错误建议模板 */
const ERROR_SUGGESTIONS: Record<PromptLlmExtractionErrorType, string> = {
  empty_output: '请检查 LLM 连接和配置',
  parse_failed: '请检查 JSON Schema 配置或提示词模板',
  regex_no_match: '请检查提取规则的正则表达式配置',
  missing_required_field: '请检查 JSON Schema 字段配置',
  invalid_format: '请检查提示词模板和 LLM 输出格式要求',
};

/**
 * 截断文本用于预览
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 检测提取失败的具体原因
 * @param rawText LLM 原始输出
 * @param settings LLM 提取设置
 * @param schemaFields JSON Schema 字段配置
 * @returns 错误类型
 */
export function detectExtractionFailureType(
  rawText: string,
  settings: PromptLlmSettings,
  schemaFields: PromptLlmOutputFields | null,
): PromptLlmExtractionErrorType {
  // 1. 无 Schema 配置时，检查正则或返回默认格式错误
  if (!schemaFields) {
    if (settings.positivePromptExtractPattern || settings.negativePromptExtractPattern) {
      return readPromptLlmOutputByRules(rawText, settings) ? 'invalid_format' : 'regex_no_match';
    }
    return 'invalid_format';
  }

  // 2. 有 Schema 时，尝试 JSON 解析
  try {
    JSON.parse(extractOutputBlock(rawText));
    return 'missing_required_field';
  } catch {
    return 'parse_failed';
  }
}

/**
 * 创建结构化提取错误
 * @param type 错误类型
 * @param rawOutput LLM 原始输出
 * @returns 结构化错误对象
 */
export function createExtractionError(
  type: PromptLlmExtractionErrorType,
  rawOutput: string,
): PromptLlmExtractionError {
  const preview = truncateText(rawOutput, MAX_PREVIEW_LENGTH);
  const message = ERROR_MESSAGES[type];
  const suggestion = ERROR_SUGGESTIONS[type];

  const error = new Error(message) as PromptLlmExtractionError;
  error.type = type;
  error.rawOutput = rawOutput;
  error.preview = preview;
  error.suggestion = suggestion;

  return error;
}
