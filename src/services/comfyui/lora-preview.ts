import { normalizeLoraManagerName } from '@/services/comfyui/lora-adapter';
import { readTrimmedString, requestLoraManagerPayload } from '@/services/comfyui/lora-manager-client';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';

/**
 * ComfyUI-Lora-Manager 预览图接口
 * 与触发词接口同源同端口，返回扫描 Civitai 时缓存在模型旁的预览图地址。
 * preview_url 为 ComfyUI 同源相对路径（/api/lm/previews?path=...），可直接拼到 <img src>。
 */
const LORA_MANAGER_PREVIEW_URL_PATH = '/api/lm/loras/preview-url';

/** 接口 404 时的提示（该 LoRA 没有预览图，或未装 / 未启用 ComfyUI-Lora-Manager，两者状态码相同无法区分） */
const LORA_MANAGER_MISSING_MESSAGE = '未找到预览图（该 LoRA 可能没有预览图，或未安装/未启用 ComfyUI-Lora-Manager）';

/**
 * 从 LoRA Manager 读取单个 LoRA 的预览图地址
 * @param comfyuiUrl ComfyUI 地址
 * @param loraName LoRA 名称（可带子目录与扩展名，内部会规范化）
 * @returns 可直接用于 <img src> 的完整地址；该 LoRA 没有预览图时为 null
 */
export async function fetchComfyUILoraPreviewUrl(comfyuiUrl: string, loraName: string): Promise<string | null> {
  const baseUrl = normalizeComfyUIUrl(comfyuiUrl);
  const name = normalizeLoraManagerName(loraName);
  if (!name) return null;

  const payload = await requestLoraManagerPayload(baseUrl, {
    path: LORA_MANAGER_PREVIEW_URL_PATH,
    featureLabel: '预览图接口',
    notFoundMessage: LORA_MANAGER_MISSING_MESSAGE,
    unavailableMessage: 'LoRA Manager 未能返回该 LoRA 的预览图',
    query: `?name=${encodeURIComponent(name)}`,
  });

  const previewUrl = readTrimmedString(payload.preview_url);
  return previewUrl ? `${baseUrl}${previewUrl}` : null;
}
