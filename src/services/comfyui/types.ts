/** 提示词绑定方向 */
export type PromptBinding = 'positive' | 'negative';

/** seed 控件模式 */
export type SeedMode = 'fixed' | 'randomize' | 'increment' | 'decrement';

/** CosmosVision 节点私有元数据 */
export interface CosmosVisionNodeMeta {
  promptBindings?: Record<string, PromptBinding>;
  seedModes?: Record<string, SeedMode>;
  imageOutput?: boolean;
}

/** 工作流节点元数据 */
export interface ComfyUIWorkflowNodeMeta {
  title?: string;
  cosmosVision?: CosmosVisionNodeMeta;
}

/** ComfyUI API 工作流节点 */
export interface ComfyUIWorkflowNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: ComfyUIWorkflowNodeMeta;
}

/** ComfyUI API 工作流 */
export type ComfyUIWorkflow = Record<string, ComfyUIWorkflowNode>;

/** 连线引用 [sourceNodeId, outputIndex] */
export type ComfyUILinkRef = [string | number, number];

/** 工作流图节点 */
export interface ComfyUIGraphNode {
  id: string;
  classType: string;
  title: string;
}

/** 工作流图边 */
export interface ComfyUIGraphEdge {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputName: string;
}

/** 带布局的图节点 */
export interface ComfyUILayoutNode extends ComfyUIGraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 自动布局结果 */
export interface ComfyUIWorkflowLayout {
  nodes: ComfyUILayoutNode[];
  edges: ComfyUIGraphEdge[];
  width: number;
  height: number;
}

/** 提示词绑定目标 */
export interface ComfyUIPromptBindingTarget {
  nodeId: string;
  inputName: string;
  binding: PromptBinding;
}

/** seed 模式目标 */
export interface ComfyUISeedModeTarget {
  nodeId: string;
  inputName: string;
  mode: SeedMode;
  value: number;
}

/** 参数控件类型 */
export type ComfyUIInputControlKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'json'
  | 'link';

/** 参数控件描述 */
export interface ComfyUIInputControlDesc {
  nodeId: string;
  inputName: string;
  kind: ComfyUIInputControlKind;
  label: string;
  value: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  controlAfterGenerate?: boolean;
  seedMode?: SeedMode;
  promptBinding?: PromptBinding | null;
  linkSource?: { nodeId: string; outputIndex: number };
  readonly?: boolean;
}

/** /object_info 节点输入定义 */
export interface ComfyUIObjectInfoInputSpec {
  name: string;
  type: string;
  required: boolean;
  options?: string[];
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  controlAfterGenerate?: boolean;
}

/** /object_info 节点定义 */
export interface ComfyUIObjectInfoNode {
  classType: string;
  displayName?: string;
  category?: string;
  isOutput?: boolean;
  inputs: ComfyUIObjectInfoInputSpec[];
}

/** 规范化后的 object_info 表 */
export type ComfyUIObjectInfoMap = Record<string, ComfyUIObjectInfoNode>;

/** history 图片元数据 */
export interface ComfyUIHistoryImage {
  filename: string;
  subfolder?: string;
  type?: string;
}

/** ComfyUI LoRA 请求快照 */
export interface ComfyUILoraSnapshot {
  name: string;
  strength: number;
}

/** ComfyUI 请求快照 */
export interface ComfyUIRequestSnapshot {
  endpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  imageOutputNodeId: string;
  promptBindings: ComfyUIPromptBindingTarget[];
  seedValues: ComfyUISeedModeTarget[];
  loras: ComfyUILoraSnapshot[];
}

/** ComfyUI 已解析请求 */
export interface ComfyUIResolvedRequest {
  workflow: ComfyUIWorkflow;
  snapshot: ComfyUIRequestSnapshot;
  imageOutputNodeId: string;
}
