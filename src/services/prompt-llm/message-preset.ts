import { DEFAULT_PROMPT_LLM_PRESET_ID, DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID } from '@/constants/default-prompt-llm-preset';
import {
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_MESSAGE_ID,
  PROMPT_LLM_HISTORY_MESSAGE_TITLE,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_MESSAGE_ID,
  PROMPT_LLM_PARTICIPANT_MESSAGE_TITLE,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
} from '@/constants/default-settings';
import type { PromptLlmMessage, PromptLlmMessagePreset, PromptLlmMessagePresetSettings } from '@/constants/prompt-llm';
import { resolvePromptLlmSourceMessage } from '@/services/prompt-llm/message-source';
import { withPromptLlmMessageTriggerDefaults } from '@/services/prompt-llm/message-trigger';

/** LLM 运行时替换内容 */
export interface PromptLlmRuntimeContent {
  historyContent: string;
  participantContent: string;
  focusParagraphContent: string;
  specialRequestContent: string;
}

/** 旧版运行时保留条目迁移配置 */
interface LegacyRuntimeMessageConfig {
  id: string;
  title: string;
  token: string;
}

const LEGACY_RUNTIME_MESSAGE_CONFIGS = [
  { id: PROMPT_LLM_HISTORY_MESSAGE_ID, title: PROMPT_LLM_HISTORY_MESSAGE_TITLE, token: PROMPT_LLM_HISTORY_TOKEN },
  { id: PROMPT_LLM_PARTICIPANT_MESSAGE_ID, title: PROMPT_LLM_PARTICIPANT_MESSAGE_TITLE, token: PROMPT_LLM_PARTICIPANT_TOKEN },
] as const satisfies readonly LegacyRuntimeMessageConfig[];

const PROMPT_LLM_CONTENT_TOKEN_PATTERN = /\{\{(?:history|participants|focus_paragraph|special_request)\}\}/g;

/**
 * 读取当前激活的提示词预设
 * @param presetSettings 消息预设集合
 * @returns 激活预设
 */
export function getActivePromptLlmPreset(presetSettings: PromptLlmMessagePresetSettings): PromptLlmMessagePreset {
  const preset = presetSettings.presets.find(item => item.id === presetSettings.activePresetId) ?? presetSettings.presets[0];
  if (!preset) throw new Error('未找到当前激活的提示词预设');
  return preset;
}

/**
 * 规范化 LLM 消息预设并迁移旧版运行时保留条目
 * @param presetSettings 预设集合
 * @returns 已规范化的预设集合
 */
export function normalizePromptLlmMessagePresets(
  presetSettings: PromptLlmMessagePresetSettings,
): PromptLlmMessagePresetSettings {
  return { ...presetSettings, presets: presetSettings.presets.map(normalizePromptLlmPreset) };
}

/**
 * 构建条目运行时文本
 * @param message 消息条目
 * @param runtimeContent 运行时内容
 * @returns 实际发送文本
 */
export async function resolvePromptLlmMessageContent(
  message: Pick<PromptLlmMessage, 'title' | 'content' | 'reference' | 'id'>,
  runtimeContent: PromptLlmRuntimeContent,
): Promise<string> {
  const sourceMessage = await resolvePromptLlmSourceMessage(message);
  const content = sourceMessage ? readPromptLlmSourceText(sourceMessage) : message.content;
  return replacePromptLlmContentTokens(content, runtimeContent);
}

/**
 * 替换自定义消息中的动态宏
 * @param content 原始消息内容
 * @param runtimeContent 运行时内容
 * @returns 宏替换后的消息内容
 */
function replacePromptLlmContentTokens(content: string, runtimeContent: PromptLlmRuntimeContent): string {
  const replacements: Record<string, string> = {
    [PROMPT_LLM_HISTORY_TOKEN]: runtimeContent.historyContent,
    [PROMPT_LLM_PARTICIPANT_TOKEN]: runtimeContent.participantContent,
    [PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN]: runtimeContent.focusParagraphContent,
    [PROMPT_LLM_SPECIAL_REQUEST_TOKEN]: runtimeContent.specialRequestContent,
  };
  return content.replace(PROMPT_LLM_CONTENT_TOKEN_PATTERN, token => replacements[token] ?? token);
}

/**
 * 读取来源条目的可发送文本
 * @param sourceMessage 来源条目解析结果
 * @returns 可发送内容
 */
function readPromptLlmSourceText(sourceMessage: Awaited<ReturnType<typeof resolvePromptLlmSourceMessage>>): string {
  if (!sourceMessage || sourceMessage.status !== 'ready') return '';
  return sourceMessage.content;
}

/**
 * 规范化单个预设
 * @param preset 原始消息预设
 * @returns 已规范化消息预设
 */
function normalizePromptLlmPreset(preset: PromptLlmMessagePreset): PromptLlmMessagePreset {
  const messages = preset.messages.map(normalizePromptLlmMessage);
  return { ...preset, messages: ensureDefaultSpecialRequestMessage(preset.id, messages) };
}

/**
 * 为默认内置预设补齐本次特别要求消息
 * @param presetId 预设 ID
 * @param messages 当前消息列表
 * @returns 补齐后的消息列表
 */
function ensureDefaultSpecialRequestMessage(presetId: string, messages: PromptLlmMessage[]): PromptLlmMessage[] {
  if (presetId !== DEFAULT_PROMPT_LLM_PRESET_ID) return messages;
  if (messages.some(message => message.id === DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID)) return messages;
  return [...messages, createSpecialRequestMessage()];
}

/**
 * 规范化单条消息
 * @param message 原始消息
 * @returns 带默认字段与迁移内容的消息
 */
function normalizePromptLlmMessage(message: PromptLlmMessage): PromptLlmMessage {
  return migrateLegacyRuntimeMessage(withPromptLlmMessageTriggerDefaults({ ...message }));
}

/**
 * 迁移旧版运行时保留消息为普通宏条目
 * @param message 原始消息
 * @returns 迁移后的普通消息
 */
function migrateLegacyRuntimeMessage(message: PromptLlmMessage): PromptLlmMessage {
  const config = LEGACY_RUNTIME_MESSAGE_CONFIGS.find(item => item.id === message.id);
  if (!config) return message;
  return { ...message, title: message.title.trim() || config.title, content: config.token };
}

/**
 * 创建默认预设中的本次特别要求消息
 * @returns 特别要求消息条目
 */
function createSpecialRequestMessage(): PromptLlmMessage {
  return withPromptLlmMessageTriggerDefaults({
    id: DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID,
    title: '本次临时追加要求',
    role: 'user',
    content: ['', '<special_request>', `    ${PROMPT_LLM_SPECIAL_REQUEST_TOKEN}`, '</special_request>', ''].join('\n'),
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  });
}
