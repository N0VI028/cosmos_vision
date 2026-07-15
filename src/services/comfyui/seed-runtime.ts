import { COMFYUI_MAX_SEED } from '@/constants/comfyui';
import type { ComfyUISeedModeTarget, ComfyUIWorkflow, SeedMode } from '@/services/comfyui/types';
import { readNumberInput, readSeedModes } from '@/services/comfyui/meta';
import { serializeComfyUIWorkflow } from '@/services/comfyui/parse';

/** seed 运行计数器，键为 workflow 指纹 + 节点 + 输入 */
const seedRuntimeCounters = new Map<string, number>();

/**
 * 解析工作流中全部 seed 模式并写回请求副本
 * @param workflow 请求用工作流副本
 * @param fingerprint 工作流指纹（通常为设置中的 workflowJson）
 * @returns 解析后的 seed 目标列表
 */
export function applySeedModes(workflow: ComfyUIWorkflow, fingerprint?: string): ComfyUISeedModeTarget[] {
  const print = fingerprint ?? buildSeedModesFingerprint(workflow);
  const targets = readSeedModes(workflow);
  const resolved: ComfyUISeedModeTarget[] = [];

  for (const target of targets) {
    const node = workflow[target.nodeId];
    if (!node) continue;
    const baseValue = readNumberInput(node, target.inputName, 0);
    const value = resolveSeedValue(print, target, baseValue);
    node.inputs[target.inputName] = value;
    resolved.push({ ...target, value });
  }

  return resolved;
}

/**
 * 清空全部 seed 运行计数器
 */
export function clearSeedRuntimeCounters(): void {
  seedRuntimeCounters.clear();
}

/**
 * 按模式解析最终 seed
 * @param fingerprint 工作流指纹
 * @param target seed 目标
 * @param baseValue 工作流当前值
 * @returns 最终 seed
 */
function resolveSeedValue(
  fingerprint: string,
  target: Pick<ComfyUISeedModeTarget, 'nodeId' | 'inputName' | 'mode'>,
  baseValue: number,
): number {
  const key = `${fingerprint}:${target.nodeId}:${target.inputName}:${target.mode}`;
  if (target.mode === 'fixed') return clampSeed(baseValue);
  if (target.mode === 'randomize') return randomSeed();
  return resolveCounterSeed(key, target.mode, baseValue);
}

/**
 * 解析递增/递减 seed
 * @param key 计数器键
 * @param mode 模式
 * @param baseValue 工作流基值
 * @returns 最终 seed
 */
function resolveCounterSeed(key: string, mode: Extract<SeedMode, 'increment' | 'decrement'>, baseValue: number): number {
  const start = clampSeed(baseValue);
  const previous = seedRuntimeCounters.get(key);
  if (previous === undefined) {
    seedRuntimeCounters.set(key, start);
    return start;
  }
  const next = mode === 'increment' ? wrapIncrement(previous) : wrapDecrement(previous);
  seedRuntimeCounters.set(key, next);
  return next;
}

/**
 * 仅基于 seed 模式元数据与基值构建指纹
 * 避免每次提示词变化导致计数器重置
 * @param workflow 工作流
 * @returns 指纹字符串
 */
function buildSeedModesFingerprint(workflow: ComfyUIWorkflow): string {
  return serializeComfyUIWorkflow(
    Object.fromEntries(
      readSeedModes(workflow).map(target => [
        `${target.nodeId}:${target.inputName}`,
        { mode: target.mode, value: target.value },
      ]),
    ) as unknown as ComfyUIWorkflow,
  );
}

/**
 * 生成安全范围内随机 seed
 * @returns 随机 seed
 */
function randomSeed(): number {
  return Math.floor(Math.random() * (COMFYUI_MAX_SEED + 1));
}

/**
 * 将 seed 限制在合法范围
 * @param value 原始值
 * @returns 合法 seed
 */
function clampSeed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), COMFYUI_MAX_SEED);
}

/**
 * 递增并处理上界回绕
 * @param value 当前值
 * @returns 下一个 seed
 */
function wrapIncrement(value: number): number {
  return value >= COMFYUI_MAX_SEED ? 0 : value + 1;
}

/**
 * 递减并处理下界回绕
 * @param value 当前值
 * @returns 下一个 seed
 */
function wrapDecrement(value: number): number {
  return value <= 0 ? COMFYUI_MAX_SEED : value - 1;
}
