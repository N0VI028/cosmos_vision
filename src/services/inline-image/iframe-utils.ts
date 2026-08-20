/**
 * 安全访问 iframe 的 contentDocument（同源检测）
 *
 * 跨域 iframe 会因浏览器同源策略限制无法访问 contentDocument
 * @param iframe iframe 元素
 * @returns contentDocument（同源）或 null（跨域/未加载）
 */
export function tryAccessIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    const doc = iframe.contentDocument;
    // 尝试访问属性确保真正可访问（某些浏览器 contentDocument 存在但属性访问时才抛异常）
    if (doc && doc.body !== undefined) return doc;
    return null;
  } catch {
    return null; // 跨域或安全限制，静默处理
  }
}

/**
 * 跨 realm 检查节点是否为 Element（不使用 instanceof）
 *
 * iframe 内的 Element 构造函数与父文档不同，instanceof 判定会失败
 * @param node 待检查节点
 * @returns 是否为 Element 节点
 */
export function isElementNode(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    'nodeType' in node &&
    (node as Node).nodeType === Node.ELEMENT_NODE
  );
}

/**
 * 跨 realm 检查节点是否为 HTMLElement（不使用 instanceof）
 *
 * iframe 内的 HTMLElement 构造函数与父文档不同，instanceof 判定会失败
 * @param node 待检查节点
 * @returns 是否为 HTMLElement 节点
 */
export function isHTMLElementNode(node: unknown): node is HTMLElement {
  return isElementNode(node) && 'tagName' in node;
}
