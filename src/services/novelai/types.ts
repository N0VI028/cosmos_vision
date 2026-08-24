import type { ImagePromptVibeRef } from '@/constants/novelai-vibe';
import type {
  NovelAIAccount,
  CharacterPromptItem,
  NovelAIModel,
  NovelAINoiseSchedule,
  NovelAIQualityPreset,
  NovelAISampler,
  NovelAISettings,
  NovelAIUcPreset,
} from '@/constants/novelai';
import type { NovelAIPromptMode } from '@/services/novelai/prompt-presets';
import type { NovelAIVibeParameters, NovelAIVibeSnapshot } from '@/services/novelai/vibe-types';

export interface NovelAIPromptOverrides {
  positiveLLMPrompt?: string;
  negativeLLMPrompt?: string;
  positivePromptMode?: NovelAIPromptMode;
  negativePromptMode?: NovelAIPromptMode;
  characterPrompts?: CharacterPromptItem[];
}

export interface NovelAIFinalPrompts {
  positivePrompt: string;
  negativePrompt: string;
  useCharacterCoords?: boolean;
  vibeReferences?: ImagePromptVibeRef[];
  vibeParameters?: NovelAIVibeParameters;
  characterPrompts?: CharacterPromptItem[];
}

export interface NovelAIRequestSnapshot {
  endpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  /** 从 LLM 解析并发送给 NovelAI 的角色提示词 */
  characterPrompts: CharacterPromptItem[];
  model: NovelAIModel;
  width: number;
  height: number;
  sampler: NovelAISampler;
  seed: number;
  steps: number;
  guidance: number;
  autoSampler: boolean;
  varietyPlus: boolean;
  smea: boolean;
  smeaDyn: boolean;
  decrisp: boolean;
  legacyPromptMode: boolean;
  promptGuidanceRescale: number;
  noiseSchedule: NovelAINoiseSchedule;
  ucPreset: NovelAIUcPreset;
  qualityPreset: NovelAIQualityPreset;
  imageCount: number;
  vibes: NovelAIVibeSnapshot;
}

export interface NovelAIResolvedRequest {
  settings: NovelAISettings;
  prompts: NovelAIFinalPrompts;
  accounts: NovelAIAccount[];
  seed: number;
  snapshot: NovelAIRequestSnapshot;
}

export interface NovelAIImageResult {
  imageBlob: Blob;
  snapshot: NovelAIRequestSnapshot;
  prompts: NovelAIFinalPrompts;
}

export interface NovelAIImagesResult {
  imageBlobs: Blob[];
  snapshot: NovelAIRequestSnapshot;
  prompts: NovelAIFinalPrompts;
}

/** NovelAI 请求控制选项 */
export interface NovelAIRequestOptions {
  signal?: AbortSignal;
}
