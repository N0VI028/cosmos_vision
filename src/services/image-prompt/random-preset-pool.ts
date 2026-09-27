import type { CosmosVisionSettings, NovelAIModel } from '@/constants/novelai';
import type { RandomPresetPool, RandomPresetPoolSide } from '@/constants/random-preset-pool';

/** 随机池触发上下文 */
export interface RandomPoolContext {
  imageSource: 'novelai' | 'comfyui';
  side: RandomPresetPoolSide;
  novelaiModel?: NovelAIModel;
  comfyuiWorkflowPresetId?: string;
}

/** 新鲜生图随机池抽中的预设 ID 覆写 */
export interface RandomPresetIdOverrides {
  positive?: string;
  negative?: string;
  /** 随机抽中的 LoRA 预设组 ID（仅 ComfyUI 生效） */
  lora?: string;
}

/**
 * 解析随机预设池抽中的预设 ID
 * 命中池合并去重 → 过滤悬挂 ID → 均匀随机抽一个；无候选返回 null（回退面板当前预设）
 * @param pools 全部随机预设池
 * @param presets 当前侧的预设列表（用于过滤悬挂引用）
 * @param ctx 触发上下文
 * @returns 抽中的预设 ID 或 null
 */
export function resolveRandomPresetId(
  pools: readonly RandomPresetPool[],
  presets: readonly { id: string }[],
  ctx: RandomPoolContext,
): string | null {
  const candidates = new Set<string>();
  pools.forEach(pool => {
    if (shouldMatchRandomPresetPool(pool, ctx)) pool.presetIds.forEach(id => candidates.add(id));
  });
  const available = [...candidates].filter(id => presets.some(preset => preset.id === id));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)]!;
}

/**
 * 级联删除：从所有同侧池中移除对指定预设的引用
 * @param pools 原随机预设池列表
 * @param side 预设所属范围
 * @param presetId 被删除的预设 ID
 * @returns 清理后的新池列表（不改原数组）
 */
export function removePresetReferences(
  pools: readonly RandomPresetPool[],
  side: RandomPresetPoolSide,
  presetId: string,
): RandomPresetPool[] {
  return pools.map(pool =>
    pool.side !== side || !pool.presetIds.includes(presetId)
      ? pool
      : { ...pool, presetIds: pool.presetIds.filter(id => id !== presetId) },
  );
}

/**
 * 解析新鲜生图随机池抽中的预设覆写
 * 仅新鲜生图链路调用；编辑再生链路不重掷（弹窗所见即所得）
 * @param settings 扩展设置
 * @param imageSource 本次生图图像源
 * @returns 抽中的预设 ID；未命中的侧为 undefined（回退面板当前预设）
 */
export function resolveFreshPresetIdOverrides(
  settings: CosmosVisionSettings,
  imageSource: 'novelai' | 'comfyui',
): RandomPresetIdOverrides {
  // 总开关关闭时所有预设池停止生效
  if (!settings.randomPresetPools.enabled) return {};
  const pools = settings.randomPresetPools.pools;
  const base =
    imageSource === 'novelai'
      ? { imageSource, novelaiModel: settings.novelai.model }
      : { imageSource, comfyuiWorkflowPresetId: settings.comfyui.workflowPresets.activePresetId };
  const overrides: RandomPresetIdOverrides = {
    positive:
      resolveRandomPresetId(pools, settings.imagePromptPresets.positive, { ...base, side: 'positive' }) ?? undefined,
    negative:
      resolveRandomPresetId(pools, settings.imagePromptPresets.negative, { ...base, side: 'negative' }) ?? undefined,
  };
  if (imageSource === 'comfyui') {
    overrides.lora =
      resolveRandomPresetId(pools, settings.comfyui.loraPresets.presets, {
        ...base,
        side: 'lora',
      }) ?? undefined;
  }
  return overrides;
}

/**
 * 过滤对指定图像源可能生效的随机预设池（面板按 Tab 展示用）
 * novelai：side 为正/负且模式为全部生效/按模型；comfyui：模式为全部生效/按工作流（side 含 lora）
 * @param pools 全部随机预设池
 * @param source 图像源
 * @returns 对该源可能生效的池列表
 */
export function getPoolsForSource(
  pools: readonly RandomPresetPool[],
  source: 'novelai' | 'comfyui',
): RandomPresetPool[] {
  return pools.filter(pool => isPoolForSource(pool, source));
}

/**
 * 判断单个池对指定图像源是否可能生效（展示过滤矩阵）
 * @param pool 随机预设池
 * @param source 图像源
 * @returns 是否可能生效
 */
function isPoolForSource(pool: RandomPresetPool, source: 'novelai' | 'comfyui'): boolean {
  if (source === 'comfyui') return pool.triggerMode !== 'model';
  return pool.side !== 'lora' && pool.triggerMode !== 'workflow';
}

/**
 * 判断随机池是否命中当前生图上下文（触发矩阵）
 * @param pool 随机预设池
 * @param ctx 触发上下文
 * @returns 是否命中
 */
function shouldMatchRandomPresetPool(pool: RandomPresetPool, ctx: RandomPoolContext): boolean {
  if (!pool.enabled || pool.side !== ctx.side) return false;
  if (pool.triggerMode === 'always') return true;
  if (pool.triggerMode === 'model') {
    return (
      ctx.imageSource === 'novelai' && ctx.novelaiModel !== undefined && pool.triggerModels.includes(ctx.novelaiModel)
    );
  }
  return (
    ctx.imageSource === 'comfyui' &&
    ctx.comfyuiWorkflowPresetId !== undefined &&
    pool.triggerWorkflowIds.includes(ctx.comfyuiWorkflowPresetId)
  );
}
