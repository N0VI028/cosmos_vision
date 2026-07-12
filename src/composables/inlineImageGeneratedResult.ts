import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';

/**
 * 内联生图结果（runtime / generation 共用）
 */
export interface InlineGeneratedImageResult {
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
}
