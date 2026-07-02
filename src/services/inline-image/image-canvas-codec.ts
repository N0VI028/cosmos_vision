interface CanvasEncodeOptions {
  mimeType: string;
  quality?: number;
}

interface CanvasSource {
  width: number;
  height: number;
  drawTo: (context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => void;
  dispose: () => void;
}

/**
 * 使用浏览器 Canvas 把图片 Blob 重新编码为目标格式
 * @param source 原始图片 Blob
 * @param options 输出编码配置
 * @returns 转码后的 Blob
 */
export async function encodeImageBlobWithCanvas(
  source: Blob,
  options: CanvasEncodeOptions,
): Promise<Blob> {
  const canvasSource = await createCanvasSource(source);
  try {
    return await renderCanvasSourceToBlob(canvasSource, options);
  } finally {
    canvasSource.dispose();
  }
}

/**
 * 创建可被 Canvas 绘制的图片源
 * @param source 原始图片 Blob
 * @returns 统一的绘制源
 */
async function createCanvasSource(source: Blob): Promise<CanvasSource> {
  const bitmap = await createImageBitmap(source);
  return {
    width: bitmap.width,
    height: bitmap.height,
    drawTo: context => context.drawImage(bitmap, 0, 0),
    dispose: () => bitmap.close(),
  };
}

/**
 * 绘制图片源并导出 Blob
 * @param source 绘制源
 * @param options 输出编码配置
 * @returns 导出的 Blob
 */
async function renderCanvasSourceToBlob(
  source: CanvasSource,
  options: CanvasEncodeOptions,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    return renderWithOffscreenCanvas(source, options);
  }
  return renderWithHtmlCanvas(source, options);
}

/**
 * 使用 OffscreenCanvas 导出 Blob
 * @param source 绘制源
 * @param options 输出编码配置
 * @returns 导出的 Blob
 */
async function renderWithOffscreenCanvas(
  source: CanvasSource,
  options: CanvasEncodeOptions,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('创建离屏画布失败');
  source.drawTo(context);
  return canvas.convertToBlob({ type: options.mimeType, quality: options.quality });
}

/**
 * 使用普通 Canvas 导出 Blob
 * @param source 绘制源
 * @param options 输出编码配置
 * @returns 导出的 Blob
 */
async function renderWithHtmlCanvas(
  source: CanvasSource,
  options: CanvasEncodeOptions,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('创建画布失败');
  source.drawTo(context);
  return canvasToBlob(canvas, options);
}

/**
 * 把 HTMLCanvasElement 转成 Blob
 * @param canvas 画布元素
 * @param options 输出编码配置
 * @returns 导出的 Blob
 */
function canvasToBlob(canvas: HTMLCanvasElement, options: CanvasEncodeOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('导出图片失败'));
    }, options.mimeType, options.quality);
  });
}
