import { createComfyUIWorkflowPreset, type ComfyUIWorkflowPreset, type ComfyUIWorkflowPresetSettings } from '@/constants/comfyui';
import { readNodeDisplayName } from '@/services/comfyui/layout';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

/**
 * 查找指定 ComfyUI 工作流预设
 * @param settings 工作流预设集合
 * @param presetId 预设 ID
 * @returns 命中的预设或首个预设
 */
export function findComfyUIWorkflowPreset(
  settings: ComfyUIWorkflowPresetSettings,
  presetId: string,
): ComfyUIWorkflowPreset | undefined {
  return settings.presets.find(preset => preset.id === presetId) ?? settings.presets[0];
}

/**
 * 读取当前 ComfyUI 工作流预设
 * @param settings 工作流预设集合
 * @returns 当前工作流预设
 */
export function getActiveComfyUIWorkflowPreset(settings: ComfyUIWorkflowPresetSettings): ComfyUIWorkflowPreset {
  const preset = findComfyUIWorkflowPreset(settings, settings.activePresetId);
  if (!preset) throw new Error('未找到当前 ComfyUI 工作流预设');
  return preset;
}

/**
 * 读取当前 ComfyUI 工作流 JSON
 * @param settings 工作流预设集合
 * @returns 当前工作流 JSON
 */
export function getActiveComfyUIWorkflowJson(settings: ComfyUIWorkflowPresetSettings): string {
  return getActiveComfyUIWorkflowPreset(settings).workflowJson;
}

/**
 * 导入 JSON 工作流并切换到新建预设，避免覆盖当前选择的预设
 * @param settings 工作流预设集合
 * @param presetId 新预设 ID
 * @param fileName 导入文件名
 * @param workflowJson 导入的工作流 JSON
 * @returns 新建并激活的预设
 */
export function importComfyUIWorkflowPreset(
  settings: ComfyUIWorkflowPresetSettings,
  presetId: string,
  fileName: string,
  workflowJson: string,
): ComfyUIWorkflowPreset {
  const name = fileName.replace(/\.json$/i, '').trim() || '导入的工作流';
  const preset = createComfyUIWorkflowPreset(presetId, name, workflowJson);
  settings.presets.push(preset);
  settings.activePresetId = preset.id;
  return preset;
}

/**
 * 过滤仍存在于工作流中的收藏 ID，保序去重
 * @param ids 原始收藏节点 ID
 * @param validNodeIds 当前工作流有效节点 ID 集合
 * @returns 清理后的收藏列表
 */
export function pruneFavoriteNodeIds(ids: readonly string[], validNodeIds: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (!validNodeIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

/**
 * 切换节点收藏状态：已在则移除，否则在有效时追加
 * @param ids 当前收藏列表
 * @param nodeId 目标节点 ID
 * @param valid 节点是否仍存在于工作流
 * @returns 切换后的收藏列表
 */
export function toggleFavoriteNodeId(ids: readonly string[], nodeId: string, valid: boolean): string[] {
  if (ids.includes(nodeId)) return ids.filter(id => id !== nodeId);
  if (!valid) return [...ids];
  return [...ids, nodeId];
}

/** 定位 Popover 中的收藏行 */
export interface FavoriteLocateOption {
  key: string;
  label: string;
  icon: string;
  nodeId: string;
  kind: 'favorite';
}

/**
 * 构造定位 Popover 收藏区选项（按显示名 zh-CN 排序）
 * @param workflow 当前工作流
 * @param favoriteNodeIds 预设收藏 ID
 * @returns 有效收藏定位项
 */
export function buildFavoriteLocateOptions(
  workflow: ComfyUIWorkflow,
  favoriteNodeIds: readonly string[],
): FavoriteLocateOption[] {
  const validIds = new Set(Object.keys(workflow));
  return pruneFavoriteNodeIds(favoriteNodeIds, validIds)
    .map(nodeId => {
      const node = workflow[nodeId];
      const name = node ? readNodeDisplayName(node, nodeId) : nodeId;
      return {
        key: `favorite:${nodeId}`,
        label: name,
        icon: 'fa-solid fa-star',
        nodeId,
        kind: 'favorite' as const,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true }));
}
