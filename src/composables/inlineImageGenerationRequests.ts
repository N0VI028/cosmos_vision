import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
import type { PromptLlmSettings } from '@/constants/prompt-llm';
import type { InlineGenerationBatchResult } from '@/composables/inlineGenerationInput';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { resolveEditedImagePrompt } from '@/composables/inlineEditablePromptSnapshot';
import { extractFrontendText } from '@/services/inline-image/frontend-text-extract';
import type { GalleryGenerationContext } from '@/store/gallery-runtimes';
import { getHostIframe } from '@/services/inline-image/iframe-utils';
import { generateComfyUIImagesFromPrompts } from '@/services/comfyui/api';
import { resolveComfyUILoraTriggerWords } from '@/services/comfyui/lora-trigger-words';
import { generateNovelAIImageFromPrompts } from '@/services/novelai/api';
import type { ImagePromptPair } from '@/services/image-prompt/presets';
import {
  buildPromptLlmHistoryExcludingFocusFloor,
  extractMessageParagraphsUntil,
} from '@/services/sillytavern/chat-dom';

/**
 * 使用快照记录的图像源重新请求图片
 * ComfyUI 分支：回放快照 loras，有 parts 按 parts+新触发词 重建串，无 parts 回退原样；
 * 成功后提交由请求实际快照 + 编辑 parts 构成的新快照；失败/中止不提交。
 * NovelAI 分支：保持现状回放。
 * @param settings 扩展设置
 * @param snapshot 提示词快照
 * @param signal 取消信号
 * @returns 图片与生成后的提示词快照
 */
export async function generateImagesFromSnapshot(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
  signal: AbortSignal,
): Promise<InlineGenerationBatchResult> {
  const imageSource = snapshot.imageSource ?? settings.imageSource;
  if (imageSource === 'comfyui') {
    return generateComfyUIImagesFromSnapshot(settings, snapshot, signal);
  }
  const prompts = snapshot.novelai ?? snapshot;
  const imageBlob = await generateNovelAIImageFromPrompts(settings.novelai, prompts, { signal });
  return { promptSnapshot: snapshot, imageBlobs: [imageBlob] };
}

/**
 * 按快照记录回放生成 ComfyUI 图片并构建新快照
 * @param settings 扩展设置
 * @param snapshot 提示词快照
 * @param signal 取消信号
 * @returns 图片与更新后的提示词快照
 */
async function generateComfyUIImagesFromSnapshot(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
  signal: AbortSignal,
): Promise<InlineGenerationBatchResult> {
  const snapshotLoras = snapshot.comfyui?.loras ?? [];
  const prompts = resolveComfyUIPlaybackPrompts(settings, snapshot);
  const loraTriggerWords = snapshot.promptParts
    ? await resolveComfyUILoraTriggerWords(settings.comfyui.url, snapshotLoras.map(l => l.name), signal)
    : [];

  const result = await generateComfyUIImagesFromPrompts(settings.comfyui, prompts, {
    signal,
    loras: snapshotLoras,
    loraTriggerWords,
  });

  const promptSnapshot: InlinePromptSnapshot = {
    imageSource: 'comfyui',
    positivePrompt: result.requestSnapshot.positivePrompt,
    negativePrompt: result.requestSnapshot.negativePrompt,
    comfyui: result.requestSnapshot,
    ...(snapshot.promptParts ? { promptParts: snapshot.promptParts } : {}),
  };
  return { promptSnapshot, imageBlobs: result.imageBlobs };
}

/**
 * 解析 ComfyUI 回放提示词
 * 有 parts 时按 parts 重建；无 parts 时回退为快照旧串
 * @param settings 扩展设置
 * @param snapshot 提示词快照
 * @returns 回放基础正负提示词
 */
function resolveComfyUIPlaybackPrompts(
  settings: CosmosVisionSettings,
  snapshot: InlinePromptSnapshot,
): ImagePromptPair {
  if (snapshot.promptParts) {
    return {
      positivePrompt: resolveEditedImagePrompt(
        settings.imagePromptPresets.positive,
        snapshot.promptParts.positive,
      ),
      negativePrompt: resolveEditedImagePrompt(
        settings.imagePromptPresets.negative,
        snapshot.promptParts.negative,
      ),
    };
  }
  // 旧快照原样回放：不做任何拼接，空白交给请求构建层统一 trim
  return {
    positivePrompt: snapshot.comfyui?.positivePrompt ?? snapshot.positivePrompt ?? '',
    negativePrompt: snapshot.comfyui?.negativePrompt ?? snapshot.negativePrompt ?? '',
  };
}

/**
 * 构建前端气泡的提示词上下文
 * @param bubbles 选中的气泡元素
 * @param promptSettings Prompt LLM 设置
 * @returns Prompt LLM 上下文
 */
export async function buildFrontendPromptContext(
  bubbles: HTMLElement[],
  promptSettings: PromptLlmSettings,
): Promise<PromptLlmContext> {
  const anchor = bubbles.at(-1);
  if (!anchor) throw new Error('未找到目标气泡文本');
  const focusParagraph = bubbles.map(extractFrontendText).filter(Boolean).join('\n');
  if (!focusParagraph) throw new Error('未找到目标气泡文本');
  const previousParagraphs = await buildPromptLlmHistoryExcludingFocusFloor(anchor, promptSettings);
  const currentFloorParagraphs = extractMessageParagraphsUntil(anchor);
  return { historyParagraphs: [...previousParagraphs, ...currentFloorParagraphs], focusParagraph, specialRequest: '' };
}

/**
 * 解析楼层尾渲染目标及 iframe 元数据
 * @param bubble 当前气泡
 * @param mesId 消息楼层 ID
 * @param context 已保存的楼层尾上下文
 * @returns 渲染上下文
 */
export function resolveFloorTailRenderContext(
  bubble: HTMLElement,
  mesId: number,
  context?: GalleryGenerationContext,
): { hostIframe: HTMLIFrameElement | null; targetIframeId?: string; targetIframeIndex?: number } {
  const hostIframe = getHostIframe(bubble);
  let targetIframeId = context?.targetIframeId;
  let targetIframeIndex = context?.targetIframeIndex;
  const message = document.querySelector<HTMLElement>(`#chat > .mes[mesid="${mesId}"]`);
  if (hostIframe?.id) targetIframeId = hostIframe.id;
  if (hostIframe && message) {
    const index = Array.from(message.querySelectorAll('iframe')).indexOf(hostIframe);
    if (index !== -1) targetIframeIndex = index;
  }
  return { hostIframe, targetIframeId, targetIframeIndex };
}

/**
 * 持久化楼层尾生成图片并返回有效引用
 * @param render 单图渲染回调
 * @param mesId 消息楼层 ID
 * @param swipeId swipe ID
 * @param slotId 位点 ID
 * @param result 生图结果
 * @param targetAnchor 渲染锚点
 * @returns 有效图片 ID
 */
export async function persistFloorTailImages(
  render: (mesId: number, swipeId: number, slotId: string, result: { imageBlob: Blob; promptSnapshot: InlinePromptSnapshot }, targetAnchor?: HTMLElement) => Promise<string | null>,
  mesId: number,
  swipeId: number,
  slotId: string,
  result: InlineGenerationBatchResult,
  targetAnchor?: HTMLElement,
): Promise<string[]> {
  const refs: string[] = [];
  for (const imageBlob of result.imageBlobs) {
    const id = await render(mesId, swipeId, slotId, { imageBlob, promptSnapshot: result.promptSnapshot }, targetAnchor);
    if (id) refs.push(id);
  }
  return refs;
}
