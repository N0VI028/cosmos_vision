import { extension_settings } from '@sillytavern/scripts/extensions';
import { saveSettingsDebounced } from '@sillytavern/script';
import { syncRef, useLocalStorage } from '@vueuse/core';
import { z } from 'zod';

import {
  COMFYUI_CUSTOM_RESOLUTION_PRESET,
  COMFYUI_IMAGE_SIZE_LIMITS,
  COMFYUI_MAX_SEED,
  COMFYUI_RESOLUTION_PRESETS,
  COMFYUI_SAMPLERS,
  COMFYUI_SEED_MODES,
  IMAGE_SOURCES,
  createComfyUILoraSetting,
  type ComfyUILoraSetting,
  type ComfyUISettings,
} from '@/constants/comfyui';
import {
  DEFAULT_PRESET_NAME,
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  DEFAULT_PROMPT_LLM_MESSAGE_SOURCE,
  DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
  DEFAULT_SETTINGS,
} from '@/constants/default-settings';
import type { ImagePromptPreset, ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
  NOVELAI_IMAGE_SIZE_LIMITS,
  NOVELAI_MODELS,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_ROUTING_MODES,
  NOVELAI_SAMPLERS,
  NOVELAI_UC_PRESETS,
  type CosmosVisionSettings,
  type NovelAIAccount,
  type NovelAISettings,
  PROMPT_LLM_MESSAGE_ROLES,
  PROMPT_LLM_MESSAGE_SOURCES,
  PROMPT_PERSON_INSERT_MODES,
  PROMPT_PERSON_KINDS,
  PROMPT_PERSON_TEMPLATE_ENTRY_SOURCES,
  type PromptLlmMessagePresetSettings,
  type PromptLlmSettings,
  type PromptProfilesSettings,
} from '@/constants/novelai';
import { ensurePromptLlmReservedMessages } from '@/services/prompt-llm/message-preset';

/** ST extension_settings 中本扩展的 key */
const SETTINGS_KEY = 'cosmos_vision';
const DARK_MODE_STORAGE_KEY = 'cosmos-vision-dark-mode';
type PlainRecord = Record<string, unknown>;
type PersistedCosmosVisionSettings = Omit<CosmosVisionSettings, 'darkMode'>;

/**
 * 提取下拉常量中的 value 作为 Zod 枚举
 * @param options 至少包含一个 value 的只读选项数组
 * @returns 可传给 z.enum 的非空 value 元组
 */
function optionValues<T extends readonly [{ value: string }, ...{ value: string }[]]>(
  options: T,
): [T[number]['value'], ...T[number]['value'][]] {
  return options.map(option => option.value) as [T[number]['value'], ...T[number]['value'][]];
}

const novelAIModelSchema = z.enum(optionValues(NOVELAI_MODELS));
const novelAISamplerSchema = z.enum(optionValues(NOVELAI_SAMPLERS));
const novelAIUcPresetSchema = z.enum(optionValues(NOVELAI_UC_PRESETS));
const novelAIRoutingModeSchema = z.enum(optionValues(NOVELAI_ROUTING_MODES));
const imageSourceSchema = z.enum(optionValues(IMAGE_SOURCES));
const novelAIResolutionPresetSchema = z.union([
  z.enum(optionValues(NOVELAI_RESOLUTION_PRESETS)),
  z.literal(NOVELAI_CUSTOM_RESOLUTION_PRESET),
]);
const novelAIImageSizeSchema = z.number().int().min(NOVELAI_IMAGE_SIZE_LIMITS.min).max(NOVELAI_IMAGE_SIZE_LIMITS.max);
const novelAIAccountSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  apiKey: z.string(),
});
const comfyUISeedModeSchema = z.enum(optionValues(COMFYUI_SEED_MODES));
const comfyUISamplerSchema = z.enum(optionValues(COMFYUI_SAMPLERS));
const comfyUIResolutionPresetSchema = z.union([
  z.enum(optionValues(COMFYUI_RESOLUTION_PRESETS)),
  z.literal(COMFYUI_CUSTOM_RESOLUTION_PRESET),
]);
const comfyUIImageSizeSchema = z.number().int().min(COMFYUI_IMAGE_SIZE_LIMITS.min).max(COMFYUI_IMAGE_SIZE_LIMITS.max);
const comfyUISeedSchema = z.number().int().min(0).max(COMFYUI_MAX_SEED);
const comfyUILoraSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  strength: z.number(),
  enabled: z.boolean(),
});

const imagePromptPresetIdSchema = z.string().min(1);
const imagePromptPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(DEFAULT_PRESET_NAME),
  text: z.string(),
  placeholderOffset: z.number().int().min(0),
});

const imagePromptPresetSettingsSchema = z.object({
  positive: z.array(imagePromptPresetSchema).min(1),
  negative: z.array(imagePromptPresetSchema).min(1),
});

const novelAISettingsSchema = z.object({
  accounts: z.array(novelAIAccountSchema),
  routingMode: novelAIRoutingModeSchema,
  corsProxy: z.string(),
  model: novelAIModelSchema,
  resolutionPreset: novelAIResolutionPresetSchema,
  width: novelAIImageSizeSchema,
  height: novelAIImageSizeSchema,
  steps: z.number(),
  cfgScale: z.number(),
  sampler: novelAISamplerSchema,
  positivePromptPresetId: imagePromptPresetIdSchema,
  negativePromptPresetId: imagePromptPresetIdSchema,
  addQualityTags: z.boolean(),
  ucPreset: novelAIUcPresetSchema,
});

const comfyUISettingsSchema = z.object({
  url: z.string(),
  workflowJson: z.string(),
  checkpointName: z.string(),
  loras: z.array(comfyUILoraSchema),
  positivePromptPresetId: imagePromptPresetIdSchema,
  negativePromptPresetId: imagePromptPresetIdSchema,
  resolutionPreset: comfyUIResolutionPresetSchema,
  width: comfyUIImageSizeSchema,
  height: comfyUIImageSizeSchema,
  steps: z.number(),
  cfgScale: z.number(),
  sampler: comfyUISamplerSchema,
  seedMode: comfyUISeedModeSchema,
  seed: comfyUISeedSchema,
});

const promptLlmSettingsSchema = z.object({
  proxyPreset: z.string(),
  apiUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  source: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
  topK: z.number(),
  contextParagraphCount: z.number().min(0).int(),
  preferJsonSchemaExtraction: z.boolean(),
  positivePromptJsonField: z.string(),
  negativePromptJsonField: z.string(),
  positivePromptExtractPattern: z.string(),
  positivePromptExtractReplacement: z.string(),
  negativePromptExtractPattern: z.string(),
  negativePromptExtractReplacement: z.string(),
});

const promptPersonSourceReferenceSchema = z.object({
  characterName: z.string().optional(),
  personaId: z.string().optional(),
  personaName: z.string().optional(),
  worldbookName: z.string().optional(),
  entryUid: z.number().int().optional(),
});

const promptPersonTemplateEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  enabled: z.boolean(),
  source: z.enum(PROMPT_PERSON_TEMPLATE_ENTRY_SOURCES),
  content: z.string(),
  reference: promptPersonSourceReferenceSchema.optional(),
});

const promptPersonSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(PROMPT_PERSON_KINDS),
  enabled: z.boolean(),
  insertMode: z.enum(PROMPT_PERSON_INSERT_MODES),
  triggerKeywords: z.array(z.string()),
  staticTags: z.string(),
  templateEntries: z.array(promptPersonTemplateEntrySchema),
});

const promptProfilesSettingsSchema = z.object({
  profiles: z.array(promptPersonSchema),
});

const promptLlmMessageSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(DEFAULT_PROMPT_LLM_MESSAGE_TITLE),
  role: z.enum(PROMPT_LLM_MESSAGE_ROLES),
  content: z.string(),
  source: z.enum(PROMPT_LLM_MESSAGE_SOURCES).default(DEFAULT_PROMPT_LLM_MESSAGE_SOURCE),
  enabled: z.boolean().default(DEFAULT_PROMPT_LLM_MESSAGE_ENABLED),
});

const promptLlmMessagePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(DEFAULT_PRESET_NAME),
  messages: z.array(promptLlmMessageSchema),
});

const promptLlmMessagePresetSettingsBaseSchema = z.object({
  activePresetId: z.string().min(1),
  presets: z.array(promptLlmMessagePresetSchema).min(1),
});

const promptLlmMessagePresetSettingsSchema = promptLlmMessagePresetSettingsBaseSchema.refine(
  value => value.presets.some(preset => preset.id === value.activePresetId),
  'activePresetId 必须指向已有提示词消息预设',
);

const cosmosVisionSettingsSchema = z.object({
  enabled: z.boolean(),
  darkMode: z.boolean(),
  imageSource: imageSourceSchema,
  imagePromptPresets: imagePromptPresetSettingsSchema,
  novelai: novelAISettingsSchema,
  comfyui: comfyUISettingsSchema,
  promptLlm: promptLlmSettingsSchema,
  promptLlmMessagePresets: promptLlmMessagePresetSettingsSchema,
  promptProfiles: promptProfilesSettingsSchema,
});

/**
 * 校验 CosmosVision 设置数据
 * @param value 待校验数据
 * @returns 可安全进入 Pinia 的设置对象
 */
function parseSettings(value: unknown): CosmosVisionSettings {
  const normalized = normalizeSettings(value);
  const result = cosmosVisionSettingsSchema.safeParse(normalized);
  if (result.success) {
    return {
      ...result.data,
      promptLlmMessagePresets: ensurePromptLlmReservedMessages(result.data.promptLlmMessagePresets),
    };
  }
  console.warn('[CosmosVision] 设置数据异常，已局部回退默认值', result.error);
  return recoverSettings(normalized);
}

/**
 * 归一化外部设置数据
 * @param value ST 持久化原始值
 * @returns 带默认字段的普通对象
 */
function normalizeSettings(value: unknown): PlainRecord {
  return _.defaultsDeep({}, toPlainRecord(value), DEFAULT_SETTINGS);
}

/**
 * 转换普通对象
 * @param value 待转换值
 * @returns 普通对象或空对象
 */
function toPlainRecord(value: unknown): PlainRecord {
  return _.isPlainObject(value) ? (value as PlainRecord) : {};
}

/**
 * 兼容旧版生图提示词预设集合结构
 * @param value 已补齐默认字段的设置对象
 * @returns 生图提示词预设已扁平化的设置对象
 */
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
 * 为设置恢复流程创建字段读取器
 * @param value 原始设置值
 * @param fallback 默认设置
 * @returns 原始记录与按字段回退的读取方法
 */
function createRecoveryReader<T extends object>(
  value: unknown,
  fallback: T,
): { record: PlainRecord; read: <K extends keyof T>(key: K, schema: z.ZodType<T[K]>) => T[K] } {
  const record = toPlainRecord(value);
  return {
    record,
    read<K extends keyof T>(key: K, schema: z.ZodType<T[K]>): T[K] {
      return parseField(schema, record[key as string], fallback[key]);
    },
  };
}

/**
 * 从异常配置中恢复可用设置
 * @param value 已补齐默认值的设置对象
 * @returns 局部回退后的设置对象
 */
function recoverSettings(value: unknown): CosmosVisionSettings {
  const record = toPlainRecord(value);
  return {
    enabled: parseField(z.boolean(), record.enabled, DEFAULT_SETTINGS.enabled),
    darkMode: parseField(z.boolean(), record.darkMode, DEFAULT_SETTINGS.darkMode),
    imageSource: parseField(imageSourceSchema, record.imageSource, DEFAULT_SETTINGS.imageSource),
    imagePromptPresets: recoverImagePromptPresets(record.imagePromptPresets),
    novelai: recoverNovelAISettings(record.novelai),
    comfyui: recoverComfyUISettings(record.comfyui),
    promptLlm: recoverPromptLlmSettings(record.promptLlm),
    promptLlmMessagePresets: recoverPromptLlmMessagePresets(record.promptLlmMessagePresets),
    promptProfiles: recoverPromptProfilesSettings(record.promptProfiles),
  };
}

/**
 * 从异常配置中恢复共享生图提示词预设
 * @param value 原始共享预设
 * @returns 局部回退后的共享预设
 */
function recoverImagePromptPresets(value: unknown): ImagePromptPresetSettings {
  const fallback = DEFAULT_SETTINGS.imagePromptPresets;
  const record = toPlainRecord(value);
  return {
    positive: recoverImagePromptCollection(record.positive, fallback.positive),
    negative: recoverImagePromptCollection(record.negative, fallback.negative),
  };
}

/**
 * 从异常配置中恢复单侧生图提示词预设
 * @param value 原始单侧预设
 * @param fallback 默认单侧预设
 * @returns 可安全使用的单侧预设
 */
function recoverImagePromptCollection(value: unknown, fallback: ImagePromptPreset[]): ImagePromptPreset[] {
  return parseField(z.array(imagePromptPresetSchema).min(1), value, fallback);
}

/**
 * 从异常配置中恢复 NovelAI 设置
 * @param value NovelAI 原始设置
 * @returns 局部回退后的 NovelAI 设置
 */
function recoverNovelAISettings(value: unknown): NovelAISettings {
  const fallback = DEFAULT_SETTINGS.novelai;
  const { record, read } = createRecoveryReader(value, fallback);
  return {
    accounts: recoverNovelAIAccounts(record.accounts),
    routingMode: read('routingMode', novelAIRoutingModeSchema),
    corsProxy: read('corsProxy', z.string()),
    model: read('model', novelAIModelSchema),
    resolutionPreset: read('resolutionPreset', novelAIResolutionPresetSchema),
    width: read('width', novelAIImageSizeSchema),
    height: read('height', novelAIImageSizeSchema),
    steps: read('steps', z.number()),
    cfgScale: read('cfgScale', z.number()),
    sampler: read('sampler', novelAISamplerSchema),
    positivePromptPresetId: read('positivePromptPresetId', imagePromptPresetIdSchema),
    negativePromptPresetId: read('negativePromptPresetId', imagePromptPresetIdSchema),
    addQualityTags: read('addQualityTags', z.boolean()),
    ucPreset: read('ucPreset', novelAIUcPresetSchema),
  };
}

/**
 * 从异常配置中恢复 NovelAI 账号列表
 * @param value 原始账号列表
 * @returns 可安全使用的账号列表
 */
function recoverNovelAIAccounts(value: unknown): NovelAIAccount[] {
  if (!Array.isArray(value)) return _.cloneDeep(DEFAULT_SETTINGS.novelai.accounts);
  return value.map((account, index) => recoverNovelAIAccount(account, index));
}

/**
 * 从异常配置中恢复单个 NovelAI 账号
 * @param value 原始账号
 * @param index 账号序号
 * @returns 可安全使用的账号
 */
function recoverNovelAIAccount(value: unknown, index: number): NovelAIAccount {
  const fallback = DEFAULT_SETTINGS.novelai.accounts[0];
  const record = toPlainRecord(value);
  return {
    id: parseField(z.string().min(1), record.id, `novelai-account-${index + 1}`),
    url: parseField(z.string(), record.url, fallback.url),
    apiKey: parseField(z.string(), record.apiKey, fallback.apiKey),
  };
}

/**
 * 从异常配置中恢复 ComfyUI 设置
 * @param value ComfyUI 原始设置
 * @returns 局部回退后的 ComfyUI 设置
 */
function recoverComfyUISettings(value: unknown): ComfyUISettings {
  const fallback = DEFAULT_SETTINGS.comfyui;
  const { record, read } = createRecoveryReader(value, fallback);
  return {
    url: read('url', z.string()),
    workflowJson: read('workflowJson', z.string()),
    checkpointName: read('checkpointName', z.string()),
    loras: recoverComfyUILoras(record.loras),
    positivePromptPresetId: read('positivePromptPresetId', imagePromptPresetIdSchema),
    negativePromptPresetId: read('negativePromptPresetId', imagePromptPresetIdSchema),
    resolutionPreset: read('resolutionPreset', comfyUIResolutionPresetSchema),
    width: read('width', comfyUIImageSizeSchema),
    height: read('height', comfyUIImageSizeSchema),
    steps: read('steps', z.number()),
    cfgScale: read('cfgScale', z.number()),
    sampler: read('sampler', comfyUISamplerSchema),
    seedMode: read('seedMode', comfyUISeedModeSchema),
    seed: read('seed', comfyUISeedSchema),
  };
}

/**
 * 从异常配置中恢复 ComfyUI LoRA 列表
 * @param value 原始 LoRA 列表
 * @returns 可安全使用的 LoRA 列表
 */
function recoverComfyUILoras(value: unknown): ComfyUILoraSetting[] {
  if (!Array.isArray(value)) return _.cloneDeep(DEFAULT_SETTINGS.comfyui.loras);
  return value.map((lora, index) => recoverComfyUILora(lora, index));
}

/**
 * 从异常配置中恢复单个 ComfyUI LoRA
 * @param value 原始 LoRA 条目
 * @param index LoRA 序号
 * @returns 可安全使用的 LoRA 条目
 */
function recoverComfyUILora(value: unknown, index: number): ComfyUILoraSetting {
  const fallback = DEFAULT_SETTINGS.comfyui.loras[index] ?? createComfyUILoraSetting(`comfyui-lora-${index + 1}`);
  const record = toPlainRecord(value);
  return {
    id: parseField(z.string().min(1), record.id, fallback.id),
    name: parseField(z.string(), record.name, fallback.name),
    strength: parseField(z.number(), record.strength, fallback.strength),
    enabled: parseField(z.boolean(), record.enabled, fallback.enabled),
  };
}

/**
 * 从异常配置中恢复提示词 LLM 设置
 * @param value 提示词 LLM 原始设置
 * @returns 局部回退后的提示词 LLM 设置
 */
function recoverPromptLlmSettings(value: unknown): PromptLlmSettings {
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
    contextParagraphCount: read('contextParagraphCount', z.number().min(0).int()),
    preferJsonSchemaExtraction: read('preferJsonSchemaExtraction', z.boolean()),
    positivePromptJsonField: read('positivePromptJsonField', z.string()),
    negativePromptJsonField: read('negativePromptJsonField', z.string()),
    positivePromptExtractPattern: read('positivePromptExtractPattern', z.string()),
    positivePromptExtractReplacement: read('positivePromptExtractReplacement', z.string()),
    negativePromptExtractPattern: read('negativePromptExtractPattern', z.string()),
    negativePromptExtractReplacement: read('negativePromptExtractReplacement', z.string()),
  };
}

/**
 * 从异常配置中恢复提示词消息预设
 * @param value 原始预设集合
 * @returns 可安全使用的预设集合
 */
function recoverPromptLlmMessagePresets(value: unknown): PromptLlmMessagePresetSettings {
  return ensurePromptLlmReservedMessages(
    recoverPresetSettings(promptLlmMessagePresetSettingsBaseSchema, value, DEFAULT_SETTINGS.promptLlmMessagePresets),
  );
}

/**
 * 从异常配置中恢复人物设置
 * @param value 原始人物设置
 * @returns 可安全使用的人物设置
 */
function recoverPromptProfilesSettings(value: unknown): PromptProfilesSettings {
  return parseField(promptProfilesSettingsSchema, value, DEFAULT_SETTINGS.promptProfiles);
}

/**
 * 修复 activePresetId 指向异常的预设集合
 * @param schema 预设集合基础校验器
 * @param value 原始预设集合
 * @param fallback 默认预设集合
 * @returns 可安全使用的预设集合
 */
function recoverPresetSettings<T extends { id: string }, TSettings extends { activePresetId: string; presets: T[] }>(
  schema: z.ZodType<TSettings>,
  value: unknown,
  fallback: TSettings,
): TSettings {
  const result = schema.safeParse(value);
  if (!result.success) return _.cloneDeep(fallback);
  const fallbackId = result.data.presets.some(preset => preset.id === fallback.activePresetId)
    ? fallback.activePresetId
    : result.data.presets[0].id;
  const activePresetId = result.data.presets.some(preset => preset.id === result.data.activePresetId)
    ? result.data.activePresetId
    : fallbackId;
  return { ...result.data, activePresetId };
}

/**
 * 从 extension_settings 读取并以默认值补齐缺失字段
 * Zod 校验负责拦截异常持久化数据
 */
function loadFromExtensionSettings(darkMode: boolean): CosmosVisionSettings {
  const stored = (extension_settings as Record<string, unknown>)[SETTINGS_KEY] ?? {};
  return { ...parseSettings(stored), darkMode };
}

/**
 * 生成写入 ST 的设置对象
 * darkMode 仅保存在浏览器 localStorage,不写入 extension_settings
 * @param settings 当前运行设置
 * @returns 去除 darkMode 的持久化对象
 */
function toPersistedSettings(settings: CosmosVisionSettings): PersistedCosmosVisionSettings {
  const cloned = _.cloneDeep(settings);
  const { darkMode: _darkMode, ...persisted } = cloned;
  return persisted;
}

/** 将当前 store 内容写回 ST 全局并触发持久化 */
function persist(settings: CosmosVisionSettings): void {
  (extension_settings as Record<string, unknown>)[SETTINGS_KEY] = toPersistedSettings(settings);
  saveSettingsDebounced();
}

/**
 * 原地同步响应式对象,保留嵌套引用
 * @param target 被 Vue 追踪的目标对象
 * @param source 已校验的数据源对象
 */
function syncReactiveObject<T extends object>(target: T, source: T): void {
  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;

  Object.keys(targetRecord).forEach(key => {
    if (!(key in sourceRecord)) delete targetRecord[key];
  });

  Object.entries(sourceRecord).forEach(([key, value]) => {
    const current = targetRecord[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      current.splice(0, current.length, ...value.map(item => _.cloneDeep(item)));
      return;
    }
    if (_.isPlainObject(current) && _.isPlainObject(value)) {
      syncReactiveObject(current as object, value as object);
      return;
    }
    targetRecord[key] = _.cloneDeep(value);
  });
}

/**
 * CosmosVision 全局设置 store
 * settings 是设置弹窗草稿,savedSettings 是已应用运行配置
 */
export const useSettingsStore = defineStore('cosmos_vision_settings', () => {
  const darkMode = useLocalStorage<boolean>(DARK_MODE_STORAGE_KEY, DEFAULT_SETTINGS.darkMode);
  const savedSettings = reactive<CosmosVisionSettings>(loadFromExtensionSettings(darkMode.value));
  const settings = reactive<CosmosVisionSettings>(_.cloneDeep(savedSettings));
  const savedDarkMode = toRef(savedSettings, 'darkMode');
  const draftDarkMode = toRef(settings, 'darkMode');

  syncRef(darkMode, savedDarkMode, {
    direction: 'both',
    transform: {
      ltr: value => value ?? DEFAULT_SETTINGS.darkMode,
      rtl: value => value,
    },
  });
  syncRef(savedDarkMode, draftDarkMode, { direction: 'both' });

  const isDirty = computed(() => !_.isEqual(settings, savedSettings));

  /**
   * 应用草稿设置并写回 ST 数据库
   */
  function applySettings(): void {
    syncReactiveObject(savedSettings, settings);
    persist(savedSettings);
  }

  /**
   * 从已应用设置重置弹窗草稿
   */
  function resetDraftSettings(): void {
    syncReactiveObject(settings, savedSettings);
  }

  /**
   * 丢弃草稿并恢复为 ST 数据库中的最后保存状态
   */
  function discardSettings(): void {
    const storedSettings = loadFromExtensionSettings(darkMode.value);
    syncReactiveObject(savedSettings, storedSettings);
    syncReactiveObject(settings, storedSettings);
  }

  /**
   * 重置所有设置为默认值并立即应用
   */
  function resetToDefaults(): void {
    const defaultSettings = _.cloneDeep(DEFAULT_SETTINGS);
    syncReactiveObject(settings, defaultSettings);
    syncReactiveObject(savedSettings, defaultSettings);
    persist(savedSettings);
  }

  return { settings, savedSettings, isDirty, applySettings, discardSettings, resetDraftSettings, resetToDefaults };
});
