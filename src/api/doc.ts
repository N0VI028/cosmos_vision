/**
 * CosmosVision 对外 API 文档常量
 *
 * 供教学引导（onboarding）与外部开发者查阅、一键复制。
 */
export const API_DOC_MARKDOWN = `CosmosVision 将核心能力暴露在 \`window.CosmosVision\` 上，供其他插件/脚本直接调用。所有接口均为异步 Promise，错误以 reject 抛出（中文 Error 消息）。

## 时序与获取

本插件加载完成后才会挂载 API。推荐写法：

\`\`\`js
async function getCosmosVision() {
  if (window.CosmosVision) return window.CosmosVision;
  return new Promise(resolve =>
    window.addEventListener('cosmos-vision:api-ready', () => resolve(window.CosmosVision), { once: true }),
  );
}
\`\`\`

\`window.CosmosVision.version\` 返回插件版本号字符串，可用于兼容性判断。

## TypeScript 类型声明

将以下内容保存为项目里的任意 \`.d.ts\` 文件（或追加到已有声明文件），即可获得 \`window.CosmosVision\` 的完整类型提示：

\`\`\`ts
/** 挂载在 window.CosmosVision 上的对外接口（插件加载完成后可用） */
interface CosmosVisionApi {
  /** 插件版本号 */
  version: string;
  /** 请求提示词：传入上下文，按插件 Prompt LLM 配置生成生图提示词原始回复 */
  requestPrompt(options: CosmosVisionRequestPromptOptions): Promise<CosmosVisionRequestPromptResult>;
  /** 请求生图：传入 LLM 原始回复或结构化核心提示词，按插件当前设置生成图片 */
  generateImage(options: CosmosVisionGenerateImageOptions): Promise<CosmosVisionGenerateImageResult>;
}

/** 接口一上下文（调用方自行收集，插件不读 DOM/楼层） */
interface CosmosVisionPromptContext {
  /** 按时间顺序排列的历史段落 */
  historyParagraphs: string[];
  /** 当前焦点段落文本，必填非空 */
  focusParagraph: string;
  /** 仅针对本次生图的特别要求 */
  specialRequest?: string;
}

interface CosmosVisionRequestPromptOptions {
  context: CosmosVisionPromptContext;
  /** 请求标识，缺省自动生成；同时作为 LLM 请求监视的 generation_id */
  requestId?: string;
  /** 取消信号，触发后终止底层 LLM 请求并 reject */
  signal?: AbortSignal;
}

interface CosmosVisionRequestPromptResult {
  requestId: string;
  /** AI 原始回复全文（未做提示词提取） */
  text: string;
  /** 推理模型返回的思考过程（如有） */
  reasoning?: string;
}

/** 接口二角色提示词条目 */
interface CosmosVisionCharacterPrompt {
  positivePrompt: string;
  negativePrompt?: string;
  /** 0–1 归一化坐标，缺省或非法回退 { x: 0.5, y: 0.5 } */
  position?: { x: number; y: number };
}

/** 接口二结构化核心提示词（会照常拼接用户预设、vibe 与 LoRA 触发词） */
interface CosmosVisionImagePrompts {
  positivePrompt: string;
  negativePrompt?: string;
  /** NovelAI V4/V4.5 角色提示词，其他图源忽略 */
  characterPrompts?: CosmosVisionCharacterPrompt[];
}

/** ComfyUI 步数进度回调参数 */
interface CosmosVisionGenerationProgress {
  requestId: string;
  value: number;
  max: number;
}

/** NovelAI 流式过程图回调参数 */
interface CosmosVisionStreamPreviewEvent {
  requestId: string;
  /** 中间帧预览图 */
  previewBlob: Blob;
  /** 第几张图 */
  imageIndex: number;
  /** 当前去噪步（1 基） */
  step: number;
  /** 总去噪步数 */
  totalSteps: number;
  /** 已完成的最终图数量 */
  completedCount: number;
  /** 本次请求图片总数 */
  imageCount: number;
  /** 是否为该图的最终帧 */
  isFinal: boolean;
}

interface CosmosVisionGenerateImageOptions {
  /** LLM 原始回复文本，由插件按当前设置提取提示词；与 prompts 同传时忽略 */
  rawText?: string;
  /** 结构化核心提示词 */
  prompts?: CosmosVisionImagePrompts;
  /** 请求标识，缺省自动生成；回显在返回结果与过程回调中 */
  requestId?: string;
  /** 取消信号 */
  signal?: AbortSignal;
  onProgress?: (progress: CosmosVisionGenerationProgress) => void;
  onStreamPreview?: (event: CosmosVisionStreamPreviewEvent) => void;
}

interface CosmosVisionGenerateImageResult {
  requestId: string;
  /** 生成的图片（png/jpeg/webp 自动识别，可能多张） */
  imageBlobs: Blob[];
  /** 实际使用的结构化提示词（rawText 提取产物或传入值） */
  prompts: CosmosVisionResolvedImagePrompts;
}

interface CosmosVisionResolvedImagePrompts {
  positivePrompt: string;
  negativePrompt: string;
  characterPrompts: Array<{
    positivePrompt: string;
    negativePrompt: string;
    position: { x: number; y: number };
  }>;
}

declare global {
  interface Window {
    CosmosVision?: CosmosVisionApi;
  }
}
\`\`\`

## 接口一：requestPrompt —— 请求提示词

传入上下文（历史楼层 + 焦点段落），由本插件的 Prompt LLM 配置（账号、模型、消息预设、人物配置）生成生图提示词原始文本。

\`\`\`js
const result = await window.CosmosVision.requestPrompt({
  context: {
    historyParagraphs: ['第 1 楼文本', '第 2 楼文本'], // 按时间顺序的历史段落
    focusParagraph: '要对齐生成图片的焦点段落文本', // 必填非空
    specialRequest: '本次临时追加要求，可省略',
  },
  requestId: 'my-plugin-req-1', // 可选，缺省自动生成；用于并发区分
  signal: controller.signal, // 可选，取消时真正终止底层 LLM 请求
});
// result: { requestId, text, reasoning? }
// - text: AI 原始回复全文（未做提示词提取）
// - reasoning: 推理模型返回的思考过程（如有）
\`\`\`

该请求会写入插件的LLM 请求监视弹窗（标签带外部调用），账号/耗时/token 等详情可在监视器查看。

## 接口二：generateImage —— 请求生图

传入 LLM 原始回复文本或结构化核心提示词，按插件当前设置（图源、账号、模型、预设、vibe、LoRA 等）直接生成图片。与接口一可无缝衔接（把 text 原样传回 rawText）。

\`\`\`js
const result = await window.CosmosVision.generateImage({
  rawText: result.text, // 方式A：接口一返回的原始文本，插件自行提取
  // 或
  prompts: {
    // 方式B：结构化核心提示词（与 rawText 同传时忽略 rawText）
    positivePrompt: '1girl, ...',
    negativePrompt: 'lowres, ...',
    characterPrompts: [
      // NovelAI 角色提示词，其他图源忽略
      { positivePrompt: '...', negativePrompt: '', position: { x: 0.5, y: 0.5 } },
    ],
  },
  requestId: 'my-plugin-req-2',
  signal: controller.signal,
  onProgress: p => {
    // ComfyUI 步数进度：p = { requestId, value, max }
  },
  onStreamPreview: e => {
    // NovelAI 流式过程图：e.previewBlob 为 Blob
    // 另含 imageIndex / step / totalSteps / completedCount / imageCount / isFinal
  },
});
// result: { requestId, imageBlobs: Blob[], prompts }
// - imageBlobs: 生成的图片（Blob，png/jpeg/webp 自动识别，可能多张）
// - prompts: 实际使用的结构化提示词（rawText 提取产物或传入值）
\`\`\`

说明：

- 图源由插件当前设置决定（NovelAI / ComfyUI），多账号自动故障转移，均不可由调用方覆盖。
- prompts 为核心提示词语义：会照常拼接用户配置的正负提示词预设、NovelAI vibe、ComfyUI LoRA 触发词，与插件内部生图行为完全一致。
- 中间回调按图源而异：NovelAI 非流式不触发任何回调；NovelAI 流式触发 onStreamPreview；ComfyUI 触发 onProgress。不关心过程可不传。
- 角色坐标为 0–1 归一化值，缺省或非法回退中心点 { x: 0.5, y: 0.5 }。

## 并发与取消

- 每次调用独立 Promise + 独立回调闭包，天然支持并发；requestId 唯一性由调用方负责（接口一重复的 requestId 会覆盖监视器中的同 ID 记录）。
- 回调参数均带 requestId，共享回调时可据此区分归属。
- AbortSignal 触发后 Promise 立即 reject（接口一会同步终止底层 LLM 请求；生图侧 NovelAI 中断 HTTP 流、ComfyUI 发送 /interrupt）。
`;
