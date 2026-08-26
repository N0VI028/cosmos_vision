import defaultPromptLlmPresetSettings, {
  DEFAULT_PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_HISTORY_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_PARTICIPANT_MESSAGE_ID,
} from '@/constants/default-prompt-llm-preset';
import {
  COMFYUI_DEFAULT_TIMEOUT,
  createComfyUILoraPresetSettings,
  createComfyUIWorkflowPresetSettings,
  type ImageSource,
} from '@/constants/comfyui';
import { createImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  createNovelAIVibePresetSettings,
  DEFAULT_NOVELAI_VIBE_PRESET_ID,
  DEFAULT_NOVELAI_VIBE_PRESET_NAME,
} from '@/constants/novelai-vibe';
import {
  PROMPT_LLM_FIXED_TAGS_TOKEN,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
  PROMPT_LLM_TRIGGER_NAMES_TOKEN,
} from '@/constants/prompt-llm-tokens';
import {
  createNovelAIAccount,
  NOVELAI_DEFAULT_ACCOUNT_ID,
  NOVELAI_DEFAULT_TIMEOUT,
  type CosmosVisionSettings,
  type PromptLlmMessageTriggerImageSource,
  type PromptLlmMessageTriggerMatchMode,
  type PromptLlmOutputFields,
} from '@/constants/novelai';
import { createPromptLlmAccount, PROMPT_LLM_DEFAULT_ACCOUNT_ID } from '@/constants/prompt-llm';

const defaultPromptLlmPreset = defaultPromptLlmPresetSettings.presets[0];

export const DEFAULT_NOVELAI_RESOLUTION_PRESET = 'normal-portrait';
export const DEFAULT_PRESET_NAME = '';
export const DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID = defaultPromptLlmPresetSettings.activePresetId;
export const DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME = defaultPromptLlmPreset.name;
export const DEFAULT_PROMPT_LLM_MESSAGE_TITLE = '';
export const DEFAULT_PROMPT_LLM_MESSAGE_ENABLED = true;
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODE: PromptLlmMessageTriggerMatchMode = 'always';
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORD_GROUPS: string[][] = [];
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODELS: string[] = [];
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES: PromptLlmMessageTriggerImageSource[] = [];
export const PROMPT_LLM_HISTORY_MESSAGE_ID = DEFAULT_PROMPT_LLM_HISTORY_MESSAGE_ID;
export const PROMPT_LLM_HISTORY_MESSAGE_TITLE = '历史消息';
export const PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID = DEFAULT_PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID;
export const PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID = DEFAULT_PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID;
export const PROMPT_LLM_PARTICIPANT_MESSAGE_ID = DEFAULT_PROMPT_LLM_PARTICIPANT_MESSAGE_ID;
export const PROMPT_LLM_PARTICIPANT_MESSAGE_TITLE = '人物总体信息';
export {
  PROMPT_LLM_FIXED_TAGS_TOKEN,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_TOKEN,
  PROMPT_LLM_PARTICIPANT_TOKEN,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
  PROMPT_LLM_TRIGGER_NAMES_TOKEN,
};
export const PROMPT_LLM_HISTORY_PREVIEW_TEXT = '历史消息';
export const PROMPT_LLM_PARTICIPANT_PREVIEW_TEXT = '人物总体信息';
export const DEFAULT_POSITIVE_PROMPT_PRESET_ID = 'novelai-positive-current-preset';
export const DEFAULT_NEGATIVE_PROMPT_PRESET_ID = 'novelai-negative-current-preset';
export const DEFAULT_POSITIVE_PROMPT_PRESET_NAME = '默认正面预设';
export const DEFAULT_NEGATIVE_PROMPT_PRESET_NAME = '默认负面预设';
export { DEFAULT_NOVELAI_VIBE_PRESET_ID, DEFAULT_NOVELAI_VIBE_PRESET_NAME };
export const DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN =
  '/<output>\\s*\\{[\\s\\S]*?"positivePrompt"\\s*:\\s*"([^"]*)"[\\s\\S]*?<\\/output>/i';
export const DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN =
  '/<output>\\s*\\{[\\s\\S]*?"negativePrompt"\\s*:\\s*"([^"]*)"[\\s\\S]*?<\\/output>/i';
/** 角色对象片段可全局重复匹配，避免 <output>… </output> 一次吞掉整块导致只命中第一个角色 */
export const DEFAULT_CHARACTER_POSITIVE_PROMPT_EXTRACT_PATTERN =
  '/\\{\\s*"positivePrompt"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"\\s*,\\s*"negativePrompt"\\s*:\\s*"(?:\\\\.|[^"\\\\])*"\\s*,\\s*"position"\\s*:/g';
export const DEFAULT_CHARACTER_NEGATIVE_PROMPT_EXTRACT_PATTERN =
  '/\\{\\s*"positivePrompt"\\s*:\\s*"(?:\\\\.|[^"\\\\])*"\\s*,\\s*"negativePrompt"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"\\s*,\\s*"position"\\s*:/g';
export const DEFAULT_CHARACTER_POSITION_X_EXTRACT_PATTERN =
  '/"position"\\s*:\\s*\\{\\s*"x"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)/g';
export const DEFAULT_CHARACTER_POSITION_Y_EXTRACT_PATTERN =
  '/"position"\\s*:\\s*\\{\\s*"x"\\s*:\\s*-?\\d+(?:\\.\\d+)?\\s*,\\s*"y"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)/g';

/** 提示词 LLM JSON 输出默认字段(双侧齐全,作为占位与回退默认值) */
export const DEFAULT_PROMPT_LLM_OUTPUT_FIELDS = {
  positive: 'positivePrompt',
  negative: 'negativePrompt',
  characterPrompts: 'characterPrompts',
  characterPositivePrompt: 'positivePrompt',
  characterNegativePrompt: 'negativePrompt',
  characterPosition: 'position',
  characterPositionX: 'x',
  characterPositionY: 'y',
} as const satisfies PromptLlmOutputFields;

/** 图像生成来源默认值 */
export const DEFAULT_IMAGE_SOURCE: ImageSource = 'novelai';

/** 设置窗口深色模式触发 class
 * 仅挂在 CosmosVision Dialog 根节点,避免污染 ST 全局主题
 */
export const DARK_CLASS = 'cosmos-vision-app-dark';

/** 暗色模式默认值,仅用于 localStorage 初始化与回退,不进入 ST extension_settings */
export const DEFAULT_DARK_MODE = true;

/** 插件默认设置,缺字段时由 _.defaultsDeep 补齐(darkMode 不走 ST,由 localStorage 单独管理) */
export const DEFAULT_SETTINGS: CosmosVisionSettings = {
  enabled: true,
  temporaryImageLimit: 50,
  imageSource: DEFAULT_IMAGE_SOURCE,
  imagePromptPresets: createImagePromptPresetSettings(
    DEFAULT_POSITIVE_PROMPT_PRESET_ID,
    DEFAULT_POSITIVE_PROMPT_PRESET_NAME,
    DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
    DEFAULT_NEGATIVE_PROMPT_PRESET_NAME,
  ),
  novelai: {
    accounts: [createNovelAIAccount(NOVELAI_DEFAULT_ACCOUNT_ID)],
    routingMode: 'sequential',
    timeout: NOVELAI_DEFAULT_TIMEOUT,
    corsProxy: '',
    novelAIVibePresets: createNovelAIVibePresetSettings(
      DEFAULT_NOVELAI_VIBE_PRESET_ID,
      DEFAULT_NOVELAI_VIBE_PRESET_NAME,
    ),
    model: 'nai-diffusion-4-5-curated',
    resolutionPreset: DEFAULT_NOVELAI_RESOLUTION_PRESET,
    width: 832,
    height: 1216,
    steps: 28,
    imageCount: 1,
    guidance: 5.5,
    sampler: 'k_euler_ancestral',
    seed: null,
    autoSampler: false,
    varietyPlus: false,
    smea: false,
    smeaDyn: false,
    decrisp: false,
    legacyPromptMode: false,
    promptGuidanceRescale: 0,
    noiseSchedule: 'karras',
    positivePromptPresetId: DEFAULT_POSITIVE_PROMPT_PRESET_ID,
    negativePromptPresetId: DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
    qualityPreset: 'Standard',
    ucPreset: 'Heavy',
    autoCharacterCoords: true,
  },
  comfyui: {
    url: 'http://127.0.0.1:8188',
    timeout: COMFYUI_DEFAULT_TIMEOUT,
    workflowPresets: createComfyUIWorkflowPresetSettings(),
    loraPresets: createComfyUILoraPresetSettings(),
    positivePromptPresetId: DEFAULT_POSITIVE_PROMPT_PRESET_ID,
    negativePromptPresetId: DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
  },
  promptLlm: {
    accounts: [createPromptLlmAccount(PROMPT_LLM_DEFAULT_ACCOUNT_ID)],
    routingMode: 'sequential',
    timeout: 60,
    temperature: 0.7,
    maxTokens: 32000,
    topP: 1.0,
    topK: 0,
    shouldStream: false,
    historyFloorCount: 2,
    ignoreUserMessagesInHistory: false,
    autoCharacterInfo: false,
    preferJsonSchemaExtraction: false,
    positivePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.positive,
    negativePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.negative,
    characterPromptsJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterPrompts,
    characterPositivePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterPositivePrompt,
    characterNegativePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterNegativePrompt,
    characterPositionJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterPosition,
    characterPositionXJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterPositionX,
    characterPositionYJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.characterPositionY,
    positivePromptExtractPattern: DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
    negativePromptExtractPattern: DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
    characterPositivePromptExtractPattern: DEFAULT_CHARACTER_POSITIVE_PROMPT_EXTRACT_PATTERN,
    characterNegativePromptExtractPattern: DEFAULT_CHARACTER_NEGATIVE_PROMPT_EXTRACT_PATTERN,
    characterPositionXExtractPattern: DEFAULT_CHARACTER_POSITION_X_EXTRACT_PATTERN,
    characterPositionYExtractPattern: DEFAULT_CHARACTER_POSITION_Y_EXTRACT_PATTERN,
  },
  promptLlmMessagePresets: defaultPromptLlmPresetSettings,
  promptProfiles: {
    profiles: [],
  },
};
