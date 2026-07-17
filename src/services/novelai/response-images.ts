/**
 * 从 NovelAI JSON 响应中提取全部图片
 * @param response 官方 JSON 响应
 * @returns 按响应顺序排列的图片
 */
export async function extractNovelAIJsonImages(response: Response): Promise<Blob[]> {
  try {
    const json = await response.json() as { images?: Array<{ image?: string }> };
    const images: Blob[] = [];
    for (const item of json.images ?? []) {
      if (item.image) images.push(decodeBase64Image(item.image));
    }
    if (!images.length) throw new Error('JSON 响应中没有找到图片数据');
    return images;
  } catch (error) {
    throw new Error(`[JSON 解析] ${(error as Error).message}`);
  }
}

/**
 * 解码 NovelAI JSON 图片
 * @param base64 图片 Base64
 * @returns PNG Blob
 */
function decodeBase64Image(base64: string): Blob {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}
