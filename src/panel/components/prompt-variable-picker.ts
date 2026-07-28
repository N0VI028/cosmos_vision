/**
 * 变量树节点定义，兼容 PrimeVue TreeNode
 */
export interface VariableTreeNode {
  key: string;
  label: string;
  segments: string[];
  path: string;
  value: unknown;
  kind: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined';
  summary: string;
  insertable: boolean;
  disableReason?: string;
  children?: VariableTreeNode[];
}

/**
 * 检查路径段是否符合纯点链宏语法
 * @param segment 路径段
 * @returns 是否有效
 */
export function isValidDotSegment(segment: string): boolean {
  if (!segment || typeof segment !== 'string') {
    return false;
  }
  return !/[\s.::[\](){}]/.test(segment);
}

/**
 * 获取变量值的类型标识
 * @param val 任意变量值
 * @returns 类型字符串
 */
export function getNodeKind(val: unknown): VariableTreeNode['kind'] {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (Array.isArray(val)) return 'array';
  const type = typeof val;
  if (type === 'object') return 'object';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}

/**
 * 格式化变量值的简短摘要
 * @param val 任意变量值
 * @returns 格式化摘要字符串
 */
export function formatValueSummary(val: unknown): string {
  const kind = getNodeKind(val);
  switch (kind) {
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'array':
    case 'object':
      return '';
    case 'string': {
      const str = val as string;
      return str.length > 80 ? `"${str.slice(0, 80)}..."` : `"${str}"`;
    }
    default:
      return String(val);
  }
}

/**
 * 判断节点及其祖先段是否全部允许插入点链宏
 * @param segments 完整路径段
 * @returns 是否可插入及禁用原因
 */
export function checkNodeInsertable(segments: string[]): { insertable: boolean; disableReason?: string } {
  const hasInvalidSegment = segments.some((seg) => !isValidDotSegment(seg));
  if (hasInvalidSegment) {
    return { insertable: false, disableReason: '包含点号、空白或特殊字符，无法生成可靠点链宏' };
  }
  return { insertable: true };
}

/**
 * 递归构建单节点与其子树
 * @param scope 作用域标识
 * @param label 当前层键名
 * @param val 节点值
 * @param parentSegments 父级路径段
 * @returns 变量树节点
 */
export function buildTreeNode(
  scope: string,
  label: string,
  val: unknown,
  parentSegments: string[],
): VariableTreeNode {
  const segments = [...parentSegments, label];
  const path = segments.join('.');
  const key = `${scope}:${JSON.stringify(segments)}`;
  const kind = getNodeKind(val);
  const summary = formatValueSummary(val);
  const { insertable, disableReason } = checkNodeInsertable(segments);

  const node: VariableTreeNode = {
    key,
    label,
    segments,
    path,
    value: val,
    kind,
    summary,
    insertable,
    disableReason,
  };

  if (kind === 'object' && val) {
    node.children = Object.entries(val as Record<string, unknown>).map(([k, v]) =>
      buildTreeNode(scope, k, v, segments),
    );
  } else if (kind === 'array' && Array.isArray(val)) {
    node.children = val.map((item, idx) =>
      buildTreeNode(scope, String(idx), item, segments),
    );
  }

  return node;
}

/**
 * 将底层变量记录转为变量树节点列表
 * @param raw 原始变量记录
 * @param scope 作用域标识
 * @returns 顶级节点数组
 */
export function buildVariableTree(
  raw: Record<string, unknown> | null,
  scope: string,
): VariableTreeNode[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  return Object.entries(raw).map(([key, val]) => buildTreeNode(scope, key, val, []));
}

/**
 * 生成酒馆助手标准变量宏字符串
 * @param macroScope 宏作用域标识 (global, character, chat, message)
 * @param segments 路径段数组
 * @returns 宏字符串
 */
export function buildVariableMacro(macroScope: string, segments: string[]): string {
  const path = segments.join('.');
  return `{{get_${macroScope}_variable::${path}}}`;
}

/**
 * 检查节点自身是否匹配关键字
 * @param node 节点
 * @param kw 小写关键字
 * @returns 是否匹配
 */
function isNodeSelfMatch(node: VariableTreeNode, kw: string): boolean {
  return (
    node.label.toLowerCase().includes(kw) ||
    node.path.toLowerCase().includes(kw) ||
    node.summary.toLowerCase().includes(kw)
  );
}

/**
 * 过滤单节点及其子树
 * @param node 单个节点
 * @param kw 小写关键字
 * @returns 过滤后的节点或 null
 */
function filterSingleNode(node: VariableTreeNode, kw: string): VariableTreeNode | null {
  if (isNodeSelfMatch(node, kw)) {
    return node;
  }
  if (!node.children || node.children.length === 0) {
    return null;
  }
  const filteredChildren = filterVariableTreeNodes(node.children, kw);
  if (filteredChildren.length === 0) {
    return null;
  }
  return { ...node, children: filteredChildren };
}

/**
 * 按关键字过滤变量树
 * @param nodes 节点列表
 * @param keyword 搜索关键字
 * @returns 过滤后的节点列表
 */
export function filterVariableTreeNodes(
  nodes: VariableTreeNode[],
  keyword: string,
): VariableTreeNode[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) {
    return nodes;
  }
  return nodes
    .map((node) => filterSingleNode(node, trimmed))
    .filter((node): node is VariableTreeNode => node !== null);
}

/**
 * 收集树中所有容器节点的 key 用于展开
 * @param nodes 节点列表
 * @returns key map 映射
 */
export function collectExpandedKeys(nodes: VariableTreeNode[]): Record<string, boolean> {
  const keys: Record<string, boolean> = {};
  function traverse(list: VariableTreeNode[]) {
    for (const node of list) {
      if (node.children && node.children.length > 0) {
        keys[node.key] = true;
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return keys;
}
