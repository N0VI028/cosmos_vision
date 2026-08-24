import { extension_settings } from '@sillytavern/scripts/extensions';
import { saveSettingsDebounced } from '@sillytavern/script';
import { useLocalStorage } from '@vueuse/core';
import { z } from 'zod';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import {
  DEFAULT_DARK_MODE,
  DEFAULT_PRESET_NAME,
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
  DEFAULT_SETTINGS,
} from '@/constants/default-settings';
import { type ImagePromptPreset, type ImagePromptPresetSettings } from '@/constants/image-prompt';
import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
  MAX_NOVELAI_VIBES_PER_PRESET,
  type ImagePromptVibeRef,
  type NovelAIVibePreset,
  type NovelAIVibePresetSettings,
} from '@/constants/novelai-vibe';
import {
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
  NOVELAI_IMAGE_COUNT_LIMITS,
  NOVELAI_IMAGE_SIZE_LIMITS,
  NOVELAI_MAX_SEED,
  NOVELAI_MODELS,
  NOVELAI_QUALITY_PRESETS,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_ROUTING_MODES,
  NOVELAI_SAMPLERS,
  NOVELAI_UC_PRESETS,
  NOVELAI_V3_NOISE_SCHEDULES,
  type CosmosVisionSettings,
  type NovelAIAccount,
  type NovelAIQualityPreset,
  type NovelAISettings,
  PROMPT_LLM_MESSAGE_ROLES,
  PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES,
  PROMPT_PERSON_INSERT_MODES,
  PROMPT_PERSON_KINDS,
  type PromptLlmMessagePresetSettings,
  type PromptProfilesSettings,
} from '@/constants/novelai';
import { normalizePromptLlmMessagePresets } from '@/services/prompt-llm/message-preset';
import {
  normalizePromptLlmMessageImageSources,
  normalizePromptLlmMessageKeywordGroups,
  normalizePromptLlmMessageModels,
} from '@/services/prompt-llm/message-trigger';
import {
  normalizeLegacyPromptLlmAccounts,
  promptLlmSettingsSchema,
  recoverPromptLlmSettings,
} from '@/store/prompt-llm-settings';
/** ST extension_settings 中本扩展的 key */
const SETTINGS_KEY = 'cosmos_vision';
const DARK_MODE_STORAGE_KEY = 'cosmos-vision-dark-mode';
type PlainRecord = Record<string, unknown>;
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
const novelAINoiseScheduleSchema = z.enum(optionValues(NOVELAI_V3_NOISE_SCHEDULES));
const novelAIUcPresetSchema = z.enum(optionValues(NOVELAI_UC_PRESETS));
const novelAIQualityPresetSchema = z.enum(optionValues(NOVELAI_QUALITY_PRESETS));
const novelAIRoutingModeSchema = z.enum(optionValues(NOVELAI_ROUTING_MODES));
const imageSourceSchema = z.enum(optionValues(IMAGE_SOURCES));
const novelAIResolutionPresetSchema = z.union([
  z.enum(optionValues(NOVELAI_RESOLUTION_PRESETS)),
  z.literal(NOVELAI_CUSTOM_RESOLUTION_PRESET),
]);
const novelAIImageSizeSchema = z.number().int().min(NOVELAI_IMAGE_SIZE_LIMITS.min).max(NOVELAI_IMAGE_SIZE_LIMITS.max);
const novelAIImageCountSchema = z.number().int().min(NOVELAI_IMAGE_COUNT_LIMITS.min).max(NOVELAI_IMAGE_COUNT_LIMITS.max);
const novelAISeedSchema = z.number().int().min(0).max(NOVELAI_MAX_SEED).nullable();
const novelAIAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  url: z.string(),
  apiKey: z.string(),
  enabled: z.boolean().default(true),
});
const comfyUILoraPresetSettingsSchema = createPresetSettingsSchema(
  z.object({
    id: z.string().min(1),
    name: z.string().default(DEFAULT_PRESET_NAME),
    loras: z.array(z.object({ id: z.string().min(1), name: z.string(), strength: z.number(), enabled: z.boolean() })),
  }),
  'activePresetId 必须指向已有 ComfyUI LoRA 预设',
);
const comfyUIWorkflowPresetSettingsSchema = createPresetSettingsSchema(
  z.object({
    id: z.string().min(1),
    name: z.string().default(DEFAULT_PRESET_NAME),
    workflowJson: z.string(),
    favoriteNodeIds: z.array(z.string()).default([]),
  }),
  'activePresetId 必须指向已有 ComfyUI 工作流预设',
);
const imagePromptPresetIdSchema = z.string().min(1);
const imagePromptVibeRefSchema = z.object({
  id: z.string().min(1),
  sourceHash: z.string().min(1),
  enabled: z.boolean().default(true),
  referenceStrength: z.number().min(0).max(1).default(DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH),
  informationExtracted: z.number().min(0).max(1).default(DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED),
  temporary: z.boolean().optional().default(false),
});
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

const novelAIVibePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(DEFAULT_PRESET_NAME),
  vibes: z.array(imagePromptVibeRefSchema).max(MAX_NOVELAI_VIBES_PER_PRESET),
});
const novelAIVibePresetSettingsBaseSchema = z.object({
  activePresetId: z.string().min(1),
  presets: z.array(novelAIVibePresetSchema).min(1),
});
const novelAIVibePresetSettingsSchema = novelAIVibePresetSettingsBaseSchema.refine(
  value => value.presets.some(preset => preset.id === value.activePresetId),
  'activePresetId 必须指向已有 NovelAI vibe 预设',
);

const novelAISettingsSchema = z.object({
  accounts: z.array(novelAIAccountSchema),
  routingMode: novelAIRoutingModeSchema,
  timeout: z.number().int().positive(),
  corsProxy: z.string(),
  novelAIVibePresets: novelAIVibePresetSettingsSchema,
  model: novelAIModelSchema,
  resolutionPreset: novelAIResolutionPresetSchema,
  width: novelAIImageSizeSchema,
  height: novelAIImageSizeSchema,
  steps: z.number(),
  imageCount: novelAIImageCountSchema,
  guidance: z.number(),
  sampler: novelAISamplerSchema,
  seed: novelAISeedSchema,
  autoSampler: z.boolean(),
  varietyPlus: z.boolean(),
  smea: z.boolean(),
  smeaDyn: z.boolean(),
  decrisp: z.boolean(),
  legacyPromptMode: z.boolean(),
  promptGuidanceRescale: z.number(),
  noiseSchedule: novelAINoiseScheduleSchema,
  positivePromptPresetId: imagePromptPresetIdSchema,
  negativePromptPresetId: imagePromptPresetIdSchema,
  qualityPreset: novelAIQualityPresetSchema,
  ucPreset: novelAIUcPresetSchema,
  autoCharacterCoords: z.boolean(),
});

const comfyUISettingsSchema = z.object({
  url: z.string(),
  timeout: z.number().int().positive(),
  workflowPresets: comfyUIWorkflowPresetSettingsSchema,
  loraPresets: comfyUILoraPresetSettingsSchema,
  positivePromptPresetId: imagePromptPresetIdSchema,
  negativePromptPresetId: imagePromptPresetIdSchema,
});

const promptLlmMessageTriggerMatchModeSchema = z.enum(PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES);

const promptWorldbookSourceReferenceSchema = z.object({
  worldbookName: z.string().optional(),
  entryUid: z.number().int().optional(),
});

const promptPersonSourceReferenceSchema = promptWorldbookSourceReferenceSchema.extend({
  characterName: z.string().optional(),
  personaId: z.string().optional(),
  personaName: z.string().optional(),
});

const promptPersonTemplateEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  enabled: z.boolean(),
  content: z.string(),
  reference: promptPersonSourceReferenceSchema.catch({}).optional(),
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
  enabled: z.boolean().default(DEFAULT_PROMPT_LLM_MESSAGE_ENABLED),
  // 未知枚举降级为 undefined，由 withPromptLlmMessageTriggerDefaults 归一，避免拖垮整表
  triggerMatchMode: promptLlmMessageTriggerMatchModeSchema.optional().catch(undefined),
  triggerKeywordGroups: z.array(z.array(z.string())).default([]).transform(normalizePromptLlmMessageKeywordGroups),
  triggerModels: z.array(z.string()).default([]).transform(normalizePromptLlmMessageModels),
  triggerImageSources: z.array(z.string()).default([]).transform(normalizePromptLlmMessageImageSources),
  reference: promptWorldbookSourceReferenceSchema.catch({}).optional(),
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
  temporaryImageLimit: z.number().int().positive(),
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
      promptLlmMessagePresets: normalizePromptLlmMessagePresets(result.data.promptLlmMessagePresets),
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
  const record = _.cloneDeep(toPlainRecord(value)) as PlainRecord;
  normalizeLegacyNovelAIGuidance(record);
  normalizeLegacyPromptLlmConnection(record);
  return _.defaultsDeep({}, record, DEFAULT_SETTINGS);
}

/**
 * 兼容旧版提示词 LLM 单账号字段
 * 旧字段只用于迁移，迁移必须在 defaultsDeep 补默认账号之前完成，
 * 否则 schema 会带着默认空账号直接通过，旧连接信息被静默剥离
 * @param settings 原始设置记录
 */
function normalizeLegacyPromptLlmConnection(settings: PlainRecord): void {
  const promptLlm = toPlainRecord(settings.promptLlm);
  if (normalizeLegacyPromptLlmAccounts(promptLlm)) {
    settings.promptLlm = promptLlm;
  }
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
 * 兼容旧版 NovelAI 提示词引导字段
 * 旧字段名 cfgScale 只用于迁移，运行时统一使用 guidance
 * @param settings 原始设置记录
 */
function normalizeLegacyNovelAIGuidance(settings: PlainRecord): void {
  const novelai = toPlainRecord(settings.novelai);
  if ('guidance' in novelai || !('cfgScale' in novelai)) return;
  novelai.guidance = novelai.cfgScale;
  settings.novelai = novelai;
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
 * 创建带当前 ID 约束的预设集合校验器
 * @param presetSchema 单个预设校验器
 * @param message 当前 ID 无效时的错误信息
 * @returns 预设集合校验器
 */
function createPresetSettingsSchema<T extends { id: string }>(presetSchema: z.ZodType<T>, message: string) {
  return z
    .object({ activePresetId: z.string().min(1), presets: z.array(presetSchema).min(1) })
    .refine(value => value.presets.some(preset => preset.id === value.activePresetId), message);
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
    temporaryImageLimit: parseField(
      z.number().int().positive(),
      record.temporaryImageLimit,
      DEFAULT_SETTINGS.temporaryImageLimit,
    ),
    imageSource: parseField(imageSourceSchema, record.imageSource, DEFAULT_SETTINGS.imageSource),
    imagePromptPresets: recoverImagePromptPresets(record.imagePromptPresets),
    novelai: recoverNovelAISettings(record.novelai),
    comfyui: parseField(comfyUISettingsSchema, record.comfyui, DEFAULT_SETTINGS.comfyui),
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
  if (!Array.isArray(value)) return _.cloneDeep(fallback);
  const presets = value.map((preset, index) => recoverImagePromptPreset(preset, fallback[index] ?? fallback[0]));
  return presets.length ? presets : _.cloneDeep(fallback);
}

/**
 * 从异常配置中恢复单个生图提示词预设
 * @param value 原始预设
 * @param fallback 默认预设
 * @returns 可安全使用的预设
 */
function recoverImagePromptPreset(value: unknown, fallback: ImagePromptPreset | undefined): ImagePromptPreset {
  const source = toPlainRecord(value);
  const preset = {
    id: parseField(z.string().min(1), source.id, fallback?.id ?? ''),
    name: parseField(z.string(), source.name, fallback?.name ?? DEFAULT_PRESET_NAME),
    text: parseField(z.string(), source.text, fallback?.text ?? ''),
    placeholderOffset: parseField(z.number().int().min(0), source.placeholderOffset, fallback?.placeholderOffset ?? 0),
  };
  return parseField(imagePromptPresetSchema, preset, fallback ?? DEFAULT_SETTINGS.imagePromptPresets.positive[0]);
}

/**
 * 从异常配置中恢复 NovelAI vibe 预设集合
 * @param value 原始 vibe 预设集合
 * @returns 可安全使用的预设集合
 */
function recoverNovelAIVibePresetSettings(value: unknown): NovelAIVibePresetSettings {
  return recoverPresetSettings(novelAIVibePresetSettingsBaseSchema, value, DEFAULT_SETTINGS.novelai.novelAIVibePresets);
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
    accounts: recoverNovelAIAccounts(record.accounts), routingMode: read('routingMode', novelAIRoutingModeSchema),
    timeout: read('timeout', z.number().int().positive()),
    corsProxy: read('corsProxy', z.string()), novelAIVibePresets: recoverNovelAIVibePresetSettings(record.novelAIVibePresets),
    model: read('model', novelAIModelSchema),
    resolutionPreset: read('resolutionPreset', novelAIResolutionPresetSchema),
    width: read('width', novelAIImageSizeSchema),
    height: read('height', novelAIImageSizeSchema),
    steps: read('steps', z.number()),
    imageCount: read('imageCount', novelAIImageCountSchema),
    guidance: readNovelAIGuidance(record, fallback.guidance),
    sampler: read('sampler', novelAISamplerSchema),
    seed: read('seed', novelAISeedSchema),
    autoSampler: read('autoSampler', z.boolean()),
    varietyPlus: read('varietyPlus', z.boolean()),
    smea: read('smea', z.boolean()),
    smeaDyn: read('smeaDyn', z.boolean()),
    decrisp: read('decrisp', z.boolean()),
    legacyPromptMode: read('legacyPromptMode', z.boolean()),
    promptGuidanceRescale: read('promptGuidanceRescale', z.number()),
    noiseSchedule: read('noiseSchedule', novelAINoiseScheduleSchema),
    positivePromptPresetId: read('positivePromptPresetId', imagePromptPresetIdSchema),
    negativePromptPresetId: read('negativePromptPresetId', imagePromptPresetIdSchema),
    qualityPreset: readNovelAIQualityPreset(record, fallback.qualityPreset),
    ucPreset: read('ucPreset', novelAIUcPresetSchema),
    autoCharacterCoords: read('autoCharacterCoords', z.boolean()),
  };
}

/**
 * 读取 NovelAI 质量词预设并平滑迁移旧布尔值 addQualityTags
 * @param record NovelAI 设置记录
 * @param fallback 默认质量词预设
 * @returns 质量词预设
 */
function readNovelAIQualityPreset(record: PlainRecord, fallback: NovelAIQualityPreset): NovelAIQualityPreset {
  if (typeof record.qualityPreset === 'string') {
    return parseField(novelAIQualityPresetSchema, record.qualityPreset, fallback);
  }
  if (typeof record.addQualityTags === 'boolean') {
    return record.addQualityTags ? 'Standard' : 'None';
  }
  return fallback;
}

/**
 * 读取 NovelAI 提示词引导并兼容旧字段
 * @param record NovelAI 设置记录
 * @param fallback 默认提示词引导值
 * @returns 可安全使用的提示词引导值
 */
function readNovelAIGuidance(record: PlainRecord, fallback: number): number {
  return parseField(z.number(), record.guidance ?? record.cfgScale, fallback);
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
    name: parseField(z.string(), record.name, fallback.name),
    url: parseField(z.string(), record.url, fallback.url),
    apiKey: parseField(z.string(), record.apiKey, fallback.apiKey),
    enabled: parseField(z.boolean(), record.enabled, fallback.enabled),
  };
}

/**
 * 从异常配置中恢复提示词消息预设
 * @param value 原始预设集合
 * @returns 可安全使用的预设集合
 */
function recoverPromptLlmMessagePresets(value: unknown): PromptLlmMessagePresetSettings {
  return normalizePromptLlmMessagePresets(
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
 * darkMode 不进入 ST 持久化,由 localStorage 单独管理,这里不参与读取
 * Zod 校验负责拦截异常持久化数据
 */
function loadFromExtensionSettings(): CosmosVisionSettings {
  const stored = (extension_settings as Record<string, unknown>)[SETTINGS_KEY] ?? {};
  return parseSettings(stored);
}

/**
 * 将当前 store 内容写回 ST 全局并触发持久化
 * darkMode 仅保存在浏览器 localStorage,不写入 extension_settings
 * @param settings 当前运行设置
 */
function persist(settings: CosmosVisionSettings): void {
  (extension_settings as Record<string, unknown>)[SETTINGS_KEY] = sanitizeSettingsForPersist(settings);
  saveSettingsDebounced();
}

/**
 * 清理不应进入持久化的数据
 * @param settings 当前运行设置
 * @returns 可写入 ST 的设置快照
 */
function sanitizeSettingsForPersist(settings: CosmosVisionSettings): CosmosVisionSettings {
  const snapshot = _.cloneDeep(settings);
  return {
    ...snapshot,
    novelai: sanitizeNovelAISettings(snapshot.novelai),
  };
}

/**
 * 清理 NovelAI 设置中的临时字段
 * @param settings 原始 NovelAI 设置
 * @returns 可持久化 NovelAI 设置
 */
function sanitizeNovelAISettings(settings: NovelAISettings): NovelAISettings {
  return {
    ...settings,
    novelAIVibePresets: sanitizeNovelAIVibePresetSettings(settings.novelAIVibePresets),
  };
}

/**
 * 清理 NovelAI vibe 预设集合中的临时 vibe
 * @param settings 原始 vibe 预设集合
 * @returns 可持久化预设集合
 */
function sanitizeNovelAIVibePresetSettings(settings: NovelAIVibePresetSettings): NovelAIVibePresetSettings {
  return {
    ...settings,
    presets: settings.presets.map(sanitizeNovelAIVibePreset),
  };
}

/**
 * 清理单个 NovelAI vibe 预设中的临时 vibe
 * @param preset 原始 vibe 预设
 * @returns 可持久化预设
 */
function sanitizeNovelAIVibePreset(preset: NovelAIVibePreset): NovelAIVibePreset {
  return {
    ...preset,
    vibes: preset.vibes.map(sanitizeImagePromptVibe),
  };
}

/**
 * 清理单个生图 vibe 引用
 * @param vibe 原始 vibe 引用
 * @returns 可持久化引用
 */
function sanitizeImagePromptVibe(vibe: ImagePromptVibeRef): ImagePromptVibeRef {
  return {
    id: vibe.id,
    sourceHash: vibe.sourceHash,
    enabled: vibe.enabled,
    referenceStrength: vibe.referenceStrength,
    informationExtracted: vibe.informationExtracted,
  };
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
 * darkMode 独立于 ST 设置,仅走 localStorage,不进入 savedSettings/persist
 */
export const useSettingsStore = defineStore('cosmos_vision_settings', () => {
  const darkMode = useLocalStorage<boolean>(DARK_MODE_STORAGE_KEY, DEFAULT_DARK_MODE);
  const savedSettings = reactive<CosmosVisionSettings>(loadFromExtensionSettings());
  const settings = reactive<CosmosVisionSettings>(_.cloneDeep(savedSettings));

  const isDirty = computed(() => !_.isEqual(settings, savedSettings));

  /**
   * 应用草稿设置并写回 ST 数据库
   * darkMode 已通过 useLocalStorage 双向绑定即时落盘,无需在此处理
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
    const storedSettings = loadFromExtensionSettings();
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

  /**
   * 导入外部设置快照并通过现有 schema 边界恢复
   * @param candidate 外部构建的候选设置
   */
  function applyImportedSettings(candidate: unknown): void {
    const importedSettings = parseSettings(candidate);
    syncReactiveObject(settings, importedSettings);
    syncReactiveObject(savedSettings, importedSettings);
    persist(savedSettings);
  }

  /**
   * 导入外部设置快照到当前草稿,不立即持久化
   * @param candidate 外部构建的候选设置
   */
  function stageImportedSettings(candidate: unknown): void {
    syncReactiveObject(settings, parseSettings(candidate));
  }

  /**
   * 将当前运行配置重新写回 ST 持久化
   */
  function persistSavedSettings(): void {
    persist(savedSettings);
  }

  return {
    settings,
    savedSettings,
    darkMode,
    isDirty,
    applySettings,
    discardSettings,
    resetDraftSettings,
    resetToDefaults,
    applyImportedSettings,
    stageImportedSettings,
    persistSavedSettings,
  };
});
