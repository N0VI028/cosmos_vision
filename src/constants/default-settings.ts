import defaultPromptLlmPresetSettings, {
  DEFAULT_PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_HISTORY_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_PARTICIPANT_MESSAGE_ID,
} from '@/constants/default-prompt-llm-preset';
import { COMFYUI_CUSTOM_RESOLUTION_PRESET, COMFYUI_DEFAULT_SAMPLER, createDefaultComfyUILoraSettings, DEFAULT_COMFYUI_WORKFLOW_JSON, type ImageSource } from '@/constants/comfyui';
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
  type CosmosVisionSettings,
  type PromptLlmMessageTriggerMode,
  type PromptLlmOutputFields,
} from '@/constants/novelai';

const defaultPromptLlmPreset = defaultPromptLlmPresetSettings.presets[0];

export const DEFAULT_NOVELAI_RESOLUTION_PRESET = 'normal-portrait';
export const DEFAULT_PRESET_NAME = '';
export const DEFAULT_PROMPT_LLM_MESSAGE_PRESET_ID = defaultPromptLlmPresetSettings.activePresetId;
export const DEFAULT_PROMPT_LLM_MESSAGE_PRESET_NAME = defaultPromptLlmPreset.name;
export const DEFAULT_PROMPT_LLM_MESSAGE_TITLE = '';
export const DEFAULT_PROMPT_LLM_MESSAGE_ENABLED = true;
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODE: PromptLlmMessageTriggerMode = 'always';
export const DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORDS: string[] = [];
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
export {
  DEFAULT_NOVELAI_VIBE_PRESET_ID,
  DEFAULT_NOVELAI_VIBE_PRESET_NAME,
};
export const DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN = '/"positivePrompt"\\s*:\\s*"([^"]*)"/i';
export const DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN = '/"negativePrompt"\\s*:\\s*"([^"]*)"/i';
export const DEFAULT_PROMPT_EXTRACT_REPLACEMENT = '$1';

/** 提示词 LLM JSON 输出默认字段(双侧齐全,作为占位与回退默认值) */
export const DEFAULT_PROMPT_LLM_OUTPUT_FIELDS = {
  positive: 'positivePrompt',
  negative: 'negativePrompt',
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
    addQualityTags: true,
    ucPreset: 'Heavy',
  },
  comfyui: {
    url: 'http://127.0.0.1:8188',
    workflowJson: DEFAULT_COMFYUI_WORKFLOW_JSON,
    checkpointName: '',
    loras: createDefaultComfyUILoraSettings(),
    positivePromptPresetId: DEFAULT_POSITIVE_PROMPT_PRESET_ID,
    negativePromptPresetId: DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
    resolutionPreset: COMFYUI_CUSTOM_RESOLUTION_PRESET,
    width: 832,
    height: 1216,
    steps: 23,
    cfgScale: 5,
    sampler: COMFYUI_DEFAULT_SAMPLER,
    seed: null,
  },
  promptLlm: {
    proxyPreset: '',
    apiUrl: '',
    apiKey: '',
    model: '',
    source: 'openai',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 1.0,
    topK: 0,
    historyFloorCount: 0,
    ignoreUserMessagesInHistory: false,
    preferJsonSchemaExtraction: true,
    positivePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.positive,
    negativePromptJsonField: DEFAULT_PROMPT_LLM_OUTPUT_FIELDS.negative,
    positivePromptExtractPattern: DEFAULT_POSITIVE_PROMPT_EXTRACT_PATTERN,
    positivePromptExtractReplacement: DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
    negativePromptExtractPattern: DEFAULT_NEGATIVE_PROMPT_EXTRACT_PATTERN,
    negativePromptExtractReplacement: DEFAULT_PROMPT_EXTRACT_REPLACEMENT,
    customIncludeBody: '',
    customExcludeBody: '',
    customIncludeHeaders: '',
  },
  promptLlmMessagePresets: defaultPromptLlmPresetSettings,
  promptProfiles: {
    profiles: [],
  },
};
