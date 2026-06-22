/**
 * 停止指定 TavernHelper 生成请求
 * @param generationId 生成请求 ID
 */
export function stopTavernHelperGeneration(generationId: string): void {
  if (typeof TavernHelper === 'undefined') return;
  TavernHelper.stopGenerationById?.(generationId);
}
