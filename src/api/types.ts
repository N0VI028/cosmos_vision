import type { CharacterPromptItem } from '@/constants/novelai';
import type { NovelAIStreamPreviewEvent } from '@/services/novelai/stream-api';

/** 接口一上下文（调用方自行收集，插件不读 DOM/楼层） */
export interface ApiPromptContext {
  /** 按时间顺序排列的历史段落，末尾可含当前焦点楼层文本 */
  historyParagraphs: string[];
  /** 当前焦点段落文本，必填非空 */
  focusParagraph: string;
  /** 仅针对本次生图的特别要求 */
  specialRequest?: string;
}

/** 接口一入参 */
export interface RequestPromptOptions {
  context: ApiPromptContext;
  /** 请求标识，缺省自动生成；同时作为 LLM 请求监视的 generation_id */
  requestId?: string;
  /** 取消信号，触发后终止底层 LLM 请求并 reject */
  signal?: AbortSignal;
}

/** 接口一返回：LLM 原始回复全文 */
export interface RequestPromptResult {
  requestId: string;
  text: string;
  /** 推理模型返回的思考过程 */
  reasoning?: string;
}

/** 接口二角色提示词条目（坐标为 0–1 归一化值） */
export interface ApiCharacterPrompt {
  positivePrompt: string;
  negativePrompt?: string;
  position?: { x: number; y: number };
}

/** 接口二结构化核心提示词（会照常拼接用户预设、vibe 与 LoRA 触发词） */
export interface ApiImagePrompts {
  positivePrompt: string;
  negativePrompt?: string;
  characterPrompts?: ApiCharacterPrompt[];
}

/** ComfyUI 生图进度（附加 requestId 便于共享回调区分归属） */
export interface ApiGenerationProgress {
  requestId: string;
  value: number;
  max: number;
}

/** NovelAI 流式过程图事件（全字段透传并附加 requestId） */
export type ApiStreamPreviewEvent = NovelAIStreamPreviewEvent & { requestId: string };

/** 接口二入参 */
export interface GenerateImageOptions {
  /** LLM 原始回复文本，由插件按当前设置提取提示词 */
  rawText?: string;
  /** 结构化核心提示词；与 rawText 同传时忽略 rawText */
  prompts?: ApiImagePrompts;
  /** 请求标识，缺省自动生成；回显在返回结果与过程回调中 */
  requestId?: string;
  /** 取消信号，触发后中断 HTTP 流或发送 ComfyUI /interrupt */
  signal?: AbortSignal;
  /** ComfyUI 步数进度回调 */
  onProgress?: (progress: ApiGenerationProgress) => void;
  /** NovelAI 流式中间帧回调 */
  onStreamPreview?: (event: ApiStreamPreviewEvent) => void;
}

/** 接口二返回的实际使用结构化提示词 */
export interface ApiResolvedImagePrompts {
  positivePrompt: string;
  negativePrompt: string;
  characterPrompts: CharacterPromptItem[];
}

/** 接口二返回 */
export interface GenerateImageResult {
  requestId: string;
  imageBlobs: Blob[];
  prompts: ApiResolvedImagePrompts;
}

/** 挂载在 window.CosmosVision 上的对外接口 */
export interface CosmosVisionApi {
  version: string;
  requestPrompt(options: RequestPromptOptions): Promise<RequestPromptResult>;
  generateImage(options: GenerateImageOptions): Promise<GenerateImageResult>;
}
