import type {
  ComfyUIGraphEdge,
  ComfyUIGraphNode,
  ComfyUILayoutNode,
  ComfyUIWorkflow,
  ComfyUIWorkflowLayout,
  ComfyUIWorkflowNode,
} from '@/services/comfyui/types';
import { isLinkRef } from '@/services/comfyui/link';

const LAYOUT_NODE_BASE_W = 180;
const LAYOUT_NODE_BASE_H = 56;
const LAYOUT_COL_GAP = 220;
const LAYOUT_PADDING = 40;
const LAYOUT_ROW_GAP = 100;

/**
 * 读取工作流节点展示名称
 * @param node 工作流节点
 * @param nodeId 节点 ID
 * @returns 展示名称
 */
export function readNodeDisplayName(node: ComfyUIWorkflowNode, nodeId: string): string {
  const metaTitle = node._meta?.title?.trim();
  if (metaTitle) return metaTitle;
  if (node.class_type) return node.class_type;
  return String(nodeId);
}

/**
 * 从工作流构建图节点列表
 * @param workflow 工作流
 * @returns 图节点列表
 */
export function extractGraphNodes(workflow: ComfyUIWorkflow): ComfyUIGraphNode[] {
  return Object.entries(workflow).map(([id, node]) => ({
    id,
    classType: node.class_type ?? '',
    title: readNodeDisplayName(node, id),
  }));
}

/**
 * 从工作流构建图边列表
 * @param workflow 工作流
 * @returns 图边列表
 */
export function extractGraphEdges(workflow: ComfyUIWorkflow): ComfyUIGraphEdge[] {
  const edges: ComfyUIGraphEdge[] = [];
  for (const [targetNodeId, node] of Object.entries(workflow)) {
    for (const [inputName, value] of Object.entries(node.inputs ?? {})) {
      if (!isLinkRef(value)) continue;
      const [sourceId, outputIndex] = value;
      if (!workflow[String(sourceId)]) continue;
      edges.push({
        id: `${sourceId}:${outputIndex}->${targetNodeId}:${inputName}`,
        sourceNodeId: String(sourceId),
        sourceOutputIndex: outputIndex,
        targetNodeId,
        targetInputName: inputName,
      });
    }
  }
  return edges;
}

/**
 * 对工作流进行分层自动布局
 * @param workflow 工作流
 * @returns 包含节点坐标和连线的布局
 */
export function layoutWorkflow(workflow: ComfyUIWorkflow): ComfyUIWorkflowLayout {
  const nodes = extractGraphNodes(workflow);
  const edges = extractGraphEdges(workflow);
  const layers = computeLayers(nodes, edges);
  const positioned = positionByLayers(nodes, layers);

  let maxX = 0;
  let maxY = 0;
  for (const node of positioned) {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    nodes: positioned,
    edges,
    width: Math.max(maxX + LAYOUT_PADDING, 1),
    height: Math.max(maxY + LAYOUT_PADDING, 1),
  };
}

/**
 * 按拓扑入度分层
 * @param nodes 图节点
 * @param edges 图边
 * @returns nodeId -> layerIndex
 */
function computeLayers(nodes: ComfyUIGraphNode[], edges: ComfyUIGraphEdge[]): Map<string, number> {
  const { ids, inCount, adj } = buildAdjacency(nodes, edges);
  const layer = assignTopoLayers(ids, inCount, adj);
  const fallback = layer.size ? Math.max(...layer.values()) + 1 : 0;
  for (const id of ids) {
    if (!layer.has(id)) layer.set(id, fallback);
  }
  return layer;
}

/**
 * 构建邻接表与入度表
 * @param nodes 图节点
 * @param edges 图边
 * @returns 邻接结构
 */
function buildAdjacency(
  nodes: ComfyUIGraphNode[],
  edges: ComfyUIGraphEdge[],
): {
  ids: Set<string>;
  inCount: Map<string, number>;
  adj: Map<string, string[]>;
} {
  const ids = new Set(nodes.map(node => node.id));
  const inCount = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    inCount.set(id, 0);
    adj.set(id, []);
  }
  for (const edge of edges) {
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) continue;
    inCount.set(edge.targetNodeId, (inCount.get(edge.targetNodeId) ?? 0) + 1);
    adj.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }
  return { ids, inCount, adj };
}

/**
 * 按 Kahn 算法分配拓扑层
 * @param ids 全部节点 ID
 * @param inCount 入度表
 * @param adj 邻接表
 * @returns 已分层节点
 */
function assignTopoLayers(
  ids: Set<string>,
  inCount: Map<string, number>,
  adj: Map<string, string[]>,
): Map<string, number> {
  const queue = [...ids].filter(id => (inCount.get(id) ?? 0) === 0).sort();
  const layer = new Map<string, number>();
  let current = 0;
  while (queue.length) {
    const layerNodes = [...queue].sort();
    queue.length = 0;
    for (const id of layerNodes) {
      layer.set(id, current);
      for (const next of adj.get(id) ?? []) {
        const newCount = (inCount.get(next) ?? 1) - 1;
        inCount.set(next, newCount);
        if (newCount === 0) queue.push(next);
      }
    }
    current += 1;
  }
  return layer;
}

/**
 * 按层放置节点
 * @param nodes 图节点
 * @param layers 层映射
 * @returns 带坐标节点
 */
function positionByLayers(
  nodes: ComfyUIGraphNode[],
  layers: Map<string, number>,
): ComfyUILayoutNode[] {
  const byLayer = groupNodesByLayer(nodes, layers);
  const positioned: ComfyUILayoutNode[] = [];
  for (const layerIndex of [...byLayer.keys()].sort((a, b) => a - b)) {
    const list = (byLayer.get(layerIndex) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
    list.forEach((node, ni) => {
      positioned.push({
        ...node,
        x: LAYOUT_PADDING + layerIndex * LAYOUT_COL_GAP,
        y: LAYOUT_PADDING + ni * LAYOUT_ROW_GAP,
        width: LAYOUT_NODE_BASE_W,
        height: LAYOUT_NODE_BASE_H,
      });
    });
  }
  return positioned;
}

/**
 * 将节点按层分组
 * @param nodes 图节点
 * @param layers 层映射
 * @returns 层到节点列表
 */
function groupNodesByLayer(
  nodes: ComfyUIGraphNode[],
  layers: Map<string, number>,
): Map<number, ComfyUIGraphNode[]> {
  const byLayer = new Map<number, ComfyUIGraphNode[]>();
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const list = byLayer.get(layer) ?? [];
    list.push(node);
    byLayer.set(layer, list);
  }
  return byLayer;
}
