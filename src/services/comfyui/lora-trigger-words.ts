import { normalizeLoraManagerName } from '@/services/comfyui/lora-adapter';
import { requestLoraManagerPayload } from '@/services/comfyui/lora-manager-client';
import { getActiveComfyUILoras, dedupeTriggerWords } from '@/services/comfyui/lora-presets';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';
import type { ComfyUISettings } from '@/constants/comfyui';

/**
 * ComfyUI-Lora-Manager 触发词接口
 * 该插件的路由挂在 ComfyUI 自身的 aiohttp 服务上，与生图接口同源同端口。
 * 触发词来自模型旁 `<model>.metadata.json` 的 `civitai.trainedWords`（Civitai 元数据或用户在管理器内手填）。
 */
const LORA_MANAGER_TRIGGER_WORDS_PATH = '/api/lm/loras/get-trigger-words';

/** 接口 404 时的提示（未装 / 未启用 ComfyUI-Lora-Manager） */
const LORA_MANAGER_MISSING_MESSAGE =
  'ComfyUI 未提供 LoRA Manager 触发词接口（404），请确认已安装并启用 ComfyUI-Lora-Manager';

/** 批量拉取的并发上限，避免一次性打满 ComfyUI */
const TRIGGER_WORDS_FETCH_CONCURRENCY = 6;

/** 单个 LoRA 拉取失败的原因 */
export interface ComfyUILoraTriggerWordsFailure {
  name: string;
  message: string;
}

/** 批量拉取触发词的结果 */
export interface ComfyUILoraTriggerWordsBatchResult {
  /** LoRA 名称（与传入值一致）→ 触发词列表，仅含拉取成功的条目 */
  triggerWords: Map<string, string[]>;
  /** 拉取失败的条目 */
  failures: ComfyUILoraTriggerWordsFailure[];
}

/**
 * 从 LoRA Manager 读取单个 LoRA 的触发词
 * @param comfyuiUrl ComfyUI 地址
 * @param loraName LoRA 名称（可带子目录与扩展名，内部会规范化）
 * @returns 触发词列表；该 LoRA 没有记录触发词时为空数组
 */
export async function fetchComfyUILoraTriggerWords(comfyuiUrl: string, loraName: string): Promise<string[]> {
  const baseUrl = normalizeComfyUIUrl(comfyuiUrl);
  const name = normalizeLoraManagerName(loraName);
  if (!name) return [];

  const payload = await requestLoraManagerPayload(baseUrl, {
    path: LORA_MANAGER_TRIGGER_WORDS_PATH,
    featureLabel: '触发词接口',
    notFoundMessage: LORA_MANAGER_MISSING_MESSAGE,
    unavailableMessage: 'LoRA Manager 未能返回该 LoRA 的触发词',
    query: `?name=${encodeURIComponent(name)}`,
  });
  return parseLoraManagerTriggerWords(payload.trigger_words);
}

/**
 * 并发拉取多个 LoRA 的触发词，单条失败不影响其余条目
 * @param comfyuiUrl ComfyUI 地址
 * @param loraNames LoRA 名称列表（自动去重、忽略空名）
 * @returns 成功的触发词映射与失败明细
 */
export async function fetchComfyUILoraTriggerWordsBatch(
  comfyuiUrl: string,
  loraNames: readonly string[],
): Promise<ComfyUILoraTriggerWordsBatchResult> {
  // 提前校验地址，避免每个条目各抛一次「请先填写 ComfyUI URL」
  const baseUrl = normalizeComfyUIUrl(comfyuiUrl);
  // 名称按原样区分大小写去重（Linux 下同名不同大小写是两个文件），便于调用方按 name 回查
  const targets = Array.from(new Set(loraNames.map(name => name.trim()).filter(Boolean)));
  const triggerWords = new Map<string, string[]>();
  const failures: ComfyUILoraTriggerWordsFailure[] = [];

  let cursor = 0;
  const workerCount = Math.min(TRIGGER_WORDS_FETCH_CONCURRENCY, targets.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < targets.length) {
        const name = targets[cursor++]!;
        try {
          triggerWords.set(name, await fetchComfyUILoraTriggerWords(baseUrl, name));
        } catch (error) {
          failures.push({ name, message: error instanceof Error ? error.message : '获取触发词失败' });
        }
      }
    }),
  );

  return { triggerWords, failures };
}

/** 会话级触发词缓存：规范化 LoRA 名称 → 触发词（失败也缓存为空数组，避免重复请求） */
const triggerWordsCache = new Map<string, string[]>();

/**
 * 解析当前激活 LoRA 预设组的触发词（生图时调用）
 * 对已启用的 LoRA 自动从 LoRA Manager 拉取触发词，会话内缓存；
 * 任何失败都静默降级为空词表，绝不阻断生图。
 * @param settings ComfyUI 设置
 * @returns 去重合并后的触发词列表
 */
export async function resolveActiveComfyUILoraTriggerWords(
  settings: Pick<ComfyUISettings, 'url' | 'loraPresets'>,
): Promise<string[]> {
  const names = getActiveComfyUILoras(settings.loraPresets)
    .filter(lora => lora.enabled && lora.name.trim())
    .map(lora => lora.name.trim());
  if (!names.length) return [];

  const missing = names.filter(name => !triggerWordsCache.has(name));
  if (missing.length) {
    try {
      const result = await fetchComfyUILoraTriggerWordsBatch(settings.url, missing);
      for (const name of missing) triggerWordsCache.set(name, result.triggerWords.get(name) ?? []);
      for (const failure of result.failures) {
        triggerWordsCache.set(failure.name, []);
        console.warn('[ComfyUILoraTriggerWords]', failure.name, failure.message);
      }
    } catch (error) {
      // 整批失败（如地址不可达）：静默降级，只用已缓存的结果
      console.warn('[ComfyUILoraTriggerWords]', error);
    }
  }
  return dedupeTriggerWords(names.flatMap(name => triggerWordsCache.get(name) ?? []));
}

/**
 * 解析接口返回的 trigger_words 字段
 * 兼容字符串数组与单一字符串；Civitai 的 trainedWords 常把多个词写在同一项里，
 * 且 LoRA Manager 内部用 `,, ` 连接，故统一按逗号/换行拆分（与手填输入框一致）。
 * @param value 原始 trigger_words 值
 * @returns 规范化后的触发词列表
 */
export function parseLoraManagerTriggerWords(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  const words: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    words.push(...item.split(/[,\n]+/));
  }
  return dedupeTriggerWords(words);
}
