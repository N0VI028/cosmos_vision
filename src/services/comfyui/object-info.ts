import type {
  ComfyUIInputControlDesc,
  ComfyUILinkRef,
  ComfyUIObjectInfoInputSpec,
  ComfyUIObjectInfoMap,
  ComfyUIObjectInfoNode,
  ComfyUIObjectInfoOutputSpec,
  ComfyUIWorkflow,
  ComfyUIWorkflowNode,
  CosmosVisionNodeMeta,
} from '@/services/comfyui/types';
import { isLinkRef } from '@/services/comfyui/link';
import { readNodeMeta } from '@/services/comfyui/meta';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';

/** 按规范化 URL 缓存最近一次成功的 object_info */
const objectInfoCache = new Map<string, ComfyUIObjectInfoMap>();

/**
 * 读取缓存中的 object_info
 * @param url ComfyUI URL
 * @returns 缓存表或 null
 */
export function getCachedComfyUIObjectInfo(url: string): ComfyUIObjectInfoMap | null {
  try {
    return objectInfoCache.get(normalizeComfyUIUrl(url)) ?? null;
  } catch {
    return null;
  }
}

/**
 * 清除 object_info 缓存
 * @param url 可选，仅清除指定 URL；不传则清空全部
 */
export function clearComfyUIObjectInfoCache(url?: string): void {
  if (!url) {
    objectInfoCache.clear();
    return;
  }
  try {
    objectInfoCache.delete(normalizeComfyUIUrl(url));
  } catch {
    // 忽略无效 URL
  }
}

/**
 * 拉取并规范化 /object_info
 * @param url ComfyUI URL
 * @param forceRefresh 是否强制刷新
 * @returns 规范化后的节点 schema 表
 */
export async function fetchComfyUIObjectInfo(
  url: string,
  forceRefresh = false,
): Promise<ComfyUIObjectInfoMap> {
  const baseUrl = normalizeComfyUIUrl(url);
  if (!forceRefresh) {
    const cached = objectInfoCache.get(baseUrl);
    if (cached) return cached;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/object_info`);
  } catch (error) {
    throw new Error(`[ComfyUI /object_info] ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`ComfyUI /object_info 请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const map = normalizeObjectInfo(payload);
  objectInfoCache.set(baseUrl, map);
  return map;
}

/**
 * 将原始 object_info 响应规范化为内部表
 * @param payload 原始响应
 * @returns 节点 schema 表
 */
export function normalizeObjectInfo(payload: unknown): ComfyUIObjectInfoMap {
  if (!isRecord(payload)) return {};
  const result: ComfyUIObjectInfoMap = {};
  for (const [classType, rawNode] of Object.entries(payload)) {
    if (!isRecord(rawNode)) continue;
    result[classType] = normalizeObjectInfoNode(classType, rawNode);
  }
  return result;
}

/**
 * 从 object_info 与当前值映射参数控件描述
 * @param workflow 工作流
 * @param nodeId 节点 ID
 * @param objectInfo 节点 schema 表
 * @returns 输入控件描述列表
 */
export function mapInputControls(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  objectInfo: ComfyUIObjectInfoMap | null,
): ComfyUIInputControlDesc[] {
  const node = workflow[nodeId];
  if (!node) return [];
  const schema = objectInfo?.[node.class_type];
  const meta = readNodeMeta(node);
  // objectInfo 非 null 即在线；某 class_type 缺失时 schema 仍可能为 undefined
  const online = objectInfo != null;
  return Object.entries(node.inputs ?? {}).map(([inputName, value]) =>
    buildInputControl(nodeId, inputName, value, schema, meta, online),
  );
}

/**
 * 读取可被指定为输出节点的候选节点 ID
 * @param workflow 工作流
 * @param objectInfo 节点 schema 表；null 表示未同步且无候选
 * @returns 候选节点 ID 列表
 */
export function listOutputCandidates(
  workflow: ComfyUIWorkflow,
  objectInfo: ComfyUIObjectInfoMap | null,
): string[] {
  if (!objectInfo) return [];
  return Object.entries(workflow)
    .filter(([, node]) => isImageOutputCandidate(node, objectInfo))
    .map(([id]) => id);
}

/**
 * 判断节点是否可作为图片输出候选
 * @param node 工作流节点
 * @param objectInfo 节点 schema 表
 * @returns 是否候选
 */
function isImageOutputCandidate(
  node: ComfyUIWorkflowNode,
  objectInfo: ComfyUIObjectInfoMap,
): boolean {
  const schema = objectInfo[node.class_type];
  if (!schema) return false;
  const hasImageInput = schema.inputs.some(input => input.type === 'IMAGE');
  const hasImageOutput = schema.outputs.some(output => output.type === 'IMAGE');
  return hasImageInput || hasImageOutput;
}

/**
 * 构建单个输入控件描述
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param value 当前值
 * @param schema 节点 schema（在线但未注册的 class 可能为 undefined）
 * @param meta 节点元数据
 * @param online 是否已同步 object_info；离线不开放改绑定 UI
 */
function buildInputControl(
  nodeId: string,
  inputName: string,
  value: unknown,
  schema: ComfyUIObjectInfoNode | undefined,
  meta: CosmosVisionNodeMeta,
  online: boolean,
): ComfyUIInputControlDesc {
  const spec = schema?.inputs.find(item => item.name === inputName);
  if (isLinkRef(value)) return buildLinkControl(nodeId, inputName, value, spec);

  const promptBinding = meta.promptBindings?.[inputName] ?? null;
  return {
    nodeId,
    inputName,
    label: inputName,
    dataType: spec?.type,
    value,
    promptBinding,
    // schema multiline 可绑；已有绑定仍可改/解绑。离线时恒为 false
    canPromptBind: online && Boolean(spec?.multiline || promptBinding),
    seedMode: meta.seedModes?.[inputName],
    controlAfterGenerate: Boolean(spec?.controlAfterGenerate),
    ...resolveScalarControlFields(value, spec),
  };
}

/**
 * 构建连线引用只读控件
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param value 连线引用
 * @param spec 输入 schema
 * @returns 控件描述
 */
function buildLinkControl(
  nodeId: string,
  inputName: string,
  value: ComfyUILinkRef,
  spec?: ComfyUIObjectInfoInputSpec,
): ComfyUIInputControlDesc {
  return {
    nodeId,
    inputName,
    kind: 'link',
    label: inputName,
    dataType: spec?.type,
    value,
    readonly: true,
    linkSource: { nodeId: String(value[0]), outputIndex: value[1] },
  };
}

/**
 * 解析标量/JSON 控件字段
 * @param value 当前值
 * @param spec 输入 schema
 * @returns kind 与附加约束
 */
function resolveScalarControlFields(
  value: unknown,
  spec: ComfyUIObjectInfoInputSpec | undefined,
): Pick<ComfyUIInputControlDesc, 'kind' | 'options' | 'min' | 'max' | 'step' | 'multiline'> {
  if (spec?.options?.length) return { kind: 'select', options: spec.options };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') {
    return { kind: 'number', min: spec?.min, max: spec?.max, step: spec?.step };
  }
  return resolveStringOrJsonFields(value, spec);
}

/**
 * 解析字符串或 JSON 降级控件字段
 * @param value 当前值
 * @param spec 输入 schema
 * @returns kind 与 multiline
 */
function resolveStringOrJsonFields(
  value: unknown,
  spec: ComfyUIObjectInfoInputSpec | undefined,
): Pick<ComfyUIInputControlDesc, 'kind' | 'multiline'> {
  if (typeof value !== 'string') return { kind: 'json' };
  if (spec?.multiline || value.includes('\n')) return { kind: 'textarea', multiline: true };
  return { kind: 'text' };
}

/**
 * 规范化单个 object_info 节点
 * @param classType 节点类型
 * @param rawNode 原始节点定义
 * @returns 规范化节点
 */
function normalizeObjectInfoNode(
  classType: string,
  rawNode: Record<string, unknown>,
): ComfyUIObjectInfoNode {
  const input = isRecord(rawNode.input) ? rawNode.input : {};
  const required = isRecord(input.required) ? input.required : {};
  const optional = isRecord(input.optional) ? input.optional : {};
  const inputs = [
    ...Object.entries(required).map(([name, spec]) => normalizeInputSpec(name, spec, true)),
    ...Object.entries(optional).map(([name, spec]) => normalizeInputSpec(name, spec, false)),
  ];

  return {
    classType,
    displayName: readString(rawNode.display_name) ?? readString(rawNode.name),
    category: readString(rawNode.category),
    outputs: normalizeOutputSpecs(rawNode),
    inputs,
  };
}

/**
 * 规范化节点输出端口
 * @param rawNode 原始节点定义
 * @returns 输出端口列表
 */
function normalizeOutputSpecs(rawNode: Record<string, unknown>): ComfyUIObjectInfoOutputSpec[] {
  const types = readStringArray(rawNode.output).map(type => type.toUpperCase());
  const names = readStringArray(rawNode.output_name);
  const listFlags = Array.isArray(rawNode.output_is_list) ? rawNode.output_is_list : [];
  return types.map((type, index) => ({
    index,
    name: names[index] ?? `输出 ${index + 1}`,
    type,
    isList: listFlags[index] === true,
  }));
}

/**
 * 读取字符串数组
 * @param value 原始值
 * @returns 有效字符串列表
 */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim());
}

/**
 * 规范化单个输入定义
 * @param name 输入名
 * @param rawSpec 原始定义
 * @param required 是否必填
 * @returns 输入规格
 */
function normalizeInputSpec(
  name: string,
  rawSpec: unknown,
  required: boolean,
): ComfyUIObjectInfoInputSpec {
  const typeInfo = Array.isArray(rawSpec) ? rawSpec[0] : rawSpec;
  const extras = Array.isArray(rawSpec) && isRecord(rawSpec[1]) ? rawSpec[1] : {};
  const options = Array.isArray(typeInfo)
    ? typeInfo.filter((item): item is string => typeof item === 'string')
    : undefined;
  const typeName = resolveInputTypeName(typeInfo);

  return {
    name,
    type: typeName,
    required,
    options,
    default: extras.default,
    min: readNumber(extras.min),
    max: readNumber(extras.max),
    step: readNumber(extras.step),
    multiline: Boolean(extras.multiline),
    controlAfterGenerate: Boolean(extras.control_after_generate),
  };
}

/**
 * 解析输入类型名称
 * @param typeInfo 原始类型定义
 * @returns 规范化类型名
 */
function resolveInputTypeName(typeInfo: unknown): string {
  if (Array.isArray(typeInfo)) return 'COMBO';
  if (typeof typeInfo === 'string') return typeInfo.toUpperCase();
  return 'UNKNOWN';
}

/**
 * 判断值是否为普通对象
 * @param value 待判断值
 * @returns 是否为对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读取字符串字段
 * @param value 原始值
 * @returns 字符串或 undefined
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * 读取数字字段
 * @param value 原始值
 * @returns 数字或 undefined
 */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
