import type { ComfyUILoraPreset, ComfyUILoraSetting } from '@/constants/comfyui';
import type { ComfyUILoraSnapshot, ComfyUIWorkflow, ComfyUIWorkflowNode } from '@/services/comfyui/types';

/** LoRA 节点适配器 */
export interface ComfyUILoraNodeAdapter {
  classType: string;
  writePreset(node: ComfyUIWorkflowNode, preset: ComfyUILoraPreset): void;
  readSnapshot(node: ComfyUIWorkflowNode): ComfyUILoraSnapshot[];
}

interface LoraManagerEntry {
  name: string;
  strength: number;
  active: boolean;
  expanded: boolean;
  clipStrength: number;
}

const LORA_MANAGER_LOADER_CLASS = 'Lora Loader (LoraManager)';
const LORA_MANAGER_CLIP_STRENGTH = 1;

/**
 * 按 class_type 查找 LoRA 适配器
 * @param classType 节点类型
 * @returns 适配器或 null
 */
export function findLoraNodeAdapter(classType: string): ComfyUILoraNodeAdapter | null {
  return LORA_NODE_ADAPTERS.find(adapter => adapter.classType === classType) ?? null;
}

/**
 * 判断节点是否支持 LoRA 预设面板
 * @param node 工作流节点
 * @returns 是否支持
 */
export function isSupportedLoraNode(node: ComfyUIWorkflowNode | undefined): boolean {
  return Boolean(node && findLoraNodeAdapter(node.class_type));
}

/**
 * 判断输入是否由 LoRA 预设面板托管（应隐藏默认 text/loras 控件）
 * @param node 工作流节点
 * @param inputName 输入名
 * @returns 是否托管
 */
export function isLoraPanelManagedInput(
  node: ComfyUIWorkflowNode | undefined,
  inputName: string,
): boolean {
  return isSupportedLoraNode(node) && (inputName === 'text' || inputName === 'loras');
}

/**
 * 将当前预设写入指定节点
 * @param node 工作流节点
 * @param preset LoRA 预设组
 */
export function writeLoraPresetToNode(node: ComfyUIWorkflowNode, preset: ComfyUILoraPreset): void {
  findLoraNodeAdapter(node.class_type)?.writePreset(node, preset);
}

/**
 * 从工作流中只读汇总已启用的 LoRA 快照
 * @param workflow 工作流
 * @returns LoRA 快照列表
 */
export function readLoraSnapshotsFromWorkflow(workflow: ComfyUIWorkflow): ComfyUILoraSnapshot[] {
  for (const node of Object.values(workflow)) {
    const adapter = findLoraNodeAdapter(node.class_type);
    if (!adapter) continue;
    return adapter.readSnapshot(node);
  }
  return [];
}

/**
 * LoraManager 适配器：写入 text 与 loras.__value__
 */
const loraManagerAdapter: ComfyUILoraNodeAdapter = {
  classType: LORA_MANAGER_LOADER_CLASS,
  writePreset(node, preset) {
    const entries = buildLoraManagerEntries(preset.loras);
    node.inputs.text = entries
      .filter(entry => entry.active)
      .map(formatLoraManagerTag)
      .join(' ');
    node.inputs.loras = { __value__: entries };
  },
  readSnapshot(node) {
    const raw = node.inputs.loras;
    const list = isRecord(raw) && Array.isArray(raw.__value__) ? raw.__value__ : [];
    return list
      .map(readLoraManagerSnapshotEntry)
      .filter((entry): entry is ComfyUILoraSnapshot => Boolean(entry));
  },
};

const LORA_NODE_ADAPTERS: ComfyUILoraNodeAdapter[] = [loraManagerAdapter];

/**
 * 构建 LoraManager 节点条目
 * @param loras LoRA 设置列表
 * @returns LoraManager 可识别的条目
 */
function buildLoraManagerEntries(loras: readonly ComfyUILoraSetting[]): LoraManagerEntry[] {
  return loras
    .map(lora => ({
      name: lora.name.trim(),
      strength: Number.isFinite(lora.strength) ? lora.strength : 1,
      active: lora.enabled,
      expanded: false,
      clipStrength: LORA_MANAGER_CLIP_STRENGTH,
    }))
    .filter(entry => entry.name.length > 0);
}

/**
 * 格式化 LoraManager 提示词标签
 * @param entry LoraManager 条目
 * @returns LoRA 提示词标签
 */
function formatLoraManagerTag(entry: LoraManagerEntry): string {
  return `<lora:${entry.name}:${formatLoraStrength(entry.strength)}>`;
}

/**
 * 格式化 LoRA 强度文本
 * @param value LoRA 强度
 * @returns 简洁数值文本
 */
function formatLoraStrength(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * 读取 LoraManager 条目为快照
 * @param value 原始条目
 * @returns 启用且有名称的快照或 null
 */
function readLoraManagerSnapshotEntry(value: unknown): ComfyUILoraSnapshot | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name || value.active === false) return null;
  const strength = typeof value.strength === 'number' && Number.isFinite(value.strength) ? value.strength : 1;
  return { name, strength };
}

/**
 * 判断值是否为普通对象
 * @param value 待判断值
 * @returns 是否为对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
