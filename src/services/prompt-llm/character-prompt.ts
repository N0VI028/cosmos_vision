import type { CharacterPromptItem, PromptLlmSettings } from '@/constants/novelai';
import { extractOutputBlock } from '@/services/tavern-helper/prompt-llm';

type CharacterRecord = Record<string, unknown>;

/**
 * 从 LLM 原文提取 NovelAI 角色提示词
 * @param rawText LLM 原始响应
 * @param settings 提取设置
 * @returns 已归一化的角色提示词列表
 */
export function readCharacterPrompts(rawText: string, settings: PromptLlmSettings): CharacterPromptItem[] {
  const cleanText = extractOutputBlock(rawText);
  const jsonPrompts = settings.preferJsonSchemaExtraction ? readJsonCharacterPrompts(cleanText, settings) : null;
  return jsonPrompts ?? readRegexCharacterPrompts(rawText, settings);
}

/**
 * 从 JSON 响应读取角色数组
 * @param rawText LLM 原始响应
 * @param settings 提取设置
 * @returns 角色列表，非 JSON 时返回 null 以便回退正则
 */
function readJsonCharacterPrompts(rawText: string, settings: PromptLlmSettings): CharacterPromptItem[] | null {
  try {
    const value = JSON.parse(rawText);
    if (!isRecord(value)) return [];
    const entries = value[settings.characterPromptsJsonField.trim()];
    return Array.isArray(entries) ? entries.flatMap(entry => normalizeJsonCharacter(entry, settings)) : [];
  } catch {
    return null;
  }
}

/**
 * 归一化单个 JSON 角色条目
 * @param value 原始角色条目
 * @param settings 提取设置
 * @returns 合法角色条目数组
 */
function normalizeJsonCharacter(value: unknown, settings: PromptLlmSettings): CharacterPromptItem[] {
  if (!isRecord(value)) {
    console.warn('[CosmosVision] 忽略非对象角色提示词条目');
    return [];
  }
  const positivePrompt = readString(value, settings.characterPositivePromptJsonField);
  const negativePrompt = readString(value, settings.characterNegativePromptJsonField);
  return [
    {
      positivePrompt,
      negativePrompt,
      position: normalizePosition(
        value[settings.characterPositionJsonField.trim()],
        settings.characterPositionXJsonField.trim() || 'x',
        settings.characterPositionYJsonField.trim() || 'y',
      ),
    },
  ];
}

/**
 * 按四组全局正则提取角色提示词
 * @param rawText LLM 原始响应
 * @param settings 提取设置
 * @returns 以正面命中为主的角色列表
 */
function readRegexCharacterPrompts(rawText: string, settings: PromptLlmSettings): CharacterPromptItem[] {
  const prompts = readRegexValues(rawText, settings.characterPositivePromptExtractPattern);
  const negatives = readRegexValues(rawText, settings.characterNegativePromptExtractPattern);
  const positions = readRegexPositions(rawText, settings);
  warnUnusedMatches(negatives, positions, prompts.length);
  return prompts.map((positivePrompt, index) => ({
    positivePrompt,
    negativePrompt: negatives[index] ?? '',
    position: positions[index] ?? defaultPosition(),
  }));
}

/**
 * 读取正则的全部文本匹配
 * @param source 原始文本
 * @param patternText 正则文本
 * @returns 匹配后的文本列表
 */
function readRegexValues(source: string, patternText: string): string[] {
  const regex = createGlobalRegex(patternText, '角色提示词');
  if (!regex) return [];
  return [...source.matchAll(regex)].map(match => match[1]?.trim() ?? '');
}

/**
 * 读取位置正则的全部匹配
 * @param source 原始文本
 * @param patternText 正则文本
 * @returns 坐标列表
 */
function readRegexPositions(source: string, settings: PromptLlmSettings): CharacterPromptItem['position'][] {
  const xValues = readRegexValues(source, settings.characterPositionXExtractPattern);
  const yValues = readRegexValues(source, settings.characterPositionYExtractPattern);
  const count = Math.max(xValues.length, yValues.length);
  return Array.from({ length: count }, (_, index) => normalizePosition({ x: Number(xValues[index]), y: Number(yValues[index]) }));
}

/**
 * 创建全局正则
 * @param patternText 用户填写的正则
 * @param label 配置标签
 * @returns 可用正则或 null
 */
function createGlobalRegex(patternText: string, label: string): RegExp | null {
  const value = patternText.trim();
  if (!value) return null;
  const literal = parseRegexLiteral(value) ?? { pattern: value, flags: '' };
  try {
    return new RegExp(literal.pattern, literal.flags.includes('g') ? literal.flags : `${literal.flags}g`);
  } catch (error) {
    throw new Error(`${label}提取规则无效: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 解析 /pattern/flags 格式的正则
 * @param value 用户输入
 * @returns 模式与 flags
 */
function parseRegexLiteral(value: string): { pattern: string; flags: string } | null {
  const end = value.lastIndexOf('/');
  return value.startsWith('/') && end > 0 ? { pattern: value.slice(1, end), flags: value.slice(end + 1) } : null;
}

/**
 * 规范化坐标，不合法时回退中心点
 * @param value 原始位置
 * @returns 0–1 范围内的坐标
 */
function normalizePosition(value: unknown, xKey = 'x', yKey = 'y'): CharacterPromptItem['position'] {
  if (isRecord(value)) {
    const xVal = value[xKey];
    const yVal = value[yKey];
    if (isCoordinate(xVal) && isCoordinate(yVal)) {
      return { x: xVal, y: yVal };
    }
  }
  console.warn('[CosmosVision] 角色坐标无效，已回退到中心点');
  return defaultPosition();
}

/**
 * 提示多余的负面或坐标匹配
 * @param negatives 负面匹配
 * @param positions 坐标匹配
 * @param promptCount 正面匹配数
 */
function warnUnusedMatches(
  negatives: string[],
  positions: CharacterPromptItem['position'][],
  promptCount: number,
): void {
  if (negatives.length > promptCount) console.warn('[CosmosVision] 已忽略多余的角色负面提示词匹配');
  if (positions.length > promptCount) console.warn('[CosmosVision] 已忽略多余的角色坐标匹配');
}

/**
 * 判断坐标数值是否合法
 * @param value 待判断值
 * @returns 是否为 0–1 数值
 */
function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * 判断普通对象
 * @param value 待判断值
 * @returns 是否为记录对象
 */
function isRecord(value: unknown): value is CharacterRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读取字符串字段
 * @param value 角色对象
 * @param key 字段名
 * @returns 字符串或空串
 */
function readString(value: CharacterRecord, key: string): string {
  const item = value[key.trim()];
  return typeof item === 'string' ? item : '';
}

/**
 * 创建默认中心点
 * @returns 中心坐标
 */
function defaultPosition(): CharacterPromptItem['position'] {
  return { x: 0.5, y: 0.5 };
}
