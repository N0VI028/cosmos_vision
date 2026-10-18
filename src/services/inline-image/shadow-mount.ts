/**
 * Shadow DOM 挂载隔离服务：为画廊宿主容器注入 open shadowRoot，
 * 免疫第三方插件对宿主聊天 DOM 的静默篡改（如 el.normalize() 删除 Vue Fragment 锚点文本节点）。
 */

export const CV_SHADOW_ROOT_CLASS = 'cv-shadow-mount-root';

/** 已创建的 shadowRoot 登记表：document.head 出现新样式表时统一重同步 */
const registeredShadowRoots = new Set<ShadowRoot>();
let headStyleObserver: MutationObserver | null = null;

/** 缓存已构建的构造式样式表（sheet 对象未变则复用） */
const constructedSheetCache = new WeakMap<CSSStyleSheet, CSSStyleSheet | null>();
/** 已发出跨域/读取失败警告的样式表集合，避免控制台刷屏 */
const warnedSheets = new WeakSet<CSSStyleSheet>();
/** 已发出 @import 丢失警告的样式表集合 */
const importWarnedSheets = new WeakSet<CSSStyleSheet>();

/** 样式表指纹：对象身份 + 规则数（insertRule/deleteRule 原地改表时对象不变但规则数变化） */
interface SheetFingerprint {
  sheet: CSSStyleSheet;
  ruleCount: number;
}

/** 上一次同步时的源样式表指纹列表 */
let lastSourceSheets: SheetFingerprint[] = [];
/** 缓存的构造式样式表列表 */
let cachedConstructedSheets: CSSStyleSheet[] = [];

/**
 * 将普通样式表（<style> / <link> 解析所得）转换为可供 shadowRoot.adoptedStyleSheets 采用的构造式样式表
 * @param sheet 源 CSSStyleSheet
 * @returns 构造式 CSSStyleSheet，若跨域或转换失败则返回 null
 */
function convertToConstructedSheet(sheet: CSSStyleSheet): CSSStyleSheet | null {
  if (constructedSheetCache.has(sheet)) {
    return constructedSheetCache.get(sheet) ?? null;
  }

  try {
    const rules = Array.from(sheet.cssRules);
    if (rules.some(rule => rule instanceof CSSImportRule) && !importWarnedSheets.has(sheet)) {
      importWarnedSheets.add(sheet);
      console.warn('[cosmos_vision] 样式表含 @import，其导入的子样式无法进入 shadowRoot 隔离区（浏览器对构造式样式表的限制）');
    }
    const cssText = rules.map(rule => rule.cssText).join('\n');
    const constructed = new CSSStyleSheet();
    constructed.replaceSync(cssText);
    constructedSheetCache.set(sheet, constructed);
    return constructed;
  } catch (error) {
    if (!warnedSheets.has(sheet)) {
      warnedSheets.add(sheet);
      console.warn('[cosmos_vision] 无法克隆样式表到 shadowRoot (可能受跨域策略限制):', sheet.href ?? sheet, error);
    }
    constructedSheetCache.set(sheet, null);
    return null;
  }
}

/**
 * 读取当前 document.styleSheets 的指纹列表（对象身份 + 规则数；跨域不可读记 -1）
 * @returns 指纹列表
 */
function readStyleFingerprints(): SheetFingerprint[] {
  return Array.from(document.styleSheets).map(sheet => {
    let ruleCount = -1;
    try {
      ruleCount = sheet.cssRules.length;
    } catch {
      // 跨域样式表无法读取规则数，以 -1 参与指纹
    }
    return { sheet, ruleCount };
  });
}

/**
 * 校验指纹列表是否完全一致（数量、对象身份与规则数）
 * @param current 当前指纹列表
 * @param previous 上一次指纹列表
 * @returns 是否相同
 */
function hasSameStyleSheets(current: SheetFingerprint[], previous: SheetFingerprint[]): boolean {
  if (current.length !== previous.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i]!.sheet !== previous[i]!.sheet || current[i]!.ruleCount !== previous[i]!.ruleCount) return false;
  }
  return true;
}

/**
 * 从当前 document.styleSheets 构建或更新构造式样式表数组
 * 内容发生原地变化（同对象不同规则数）的表先失效其缓存克隆再重建
 * @returns 构造式样式表数组（集合未变化时返回上次同一数组引用）
 */
function updateConstructedSheets(): CSSStyleSheet[] {
  const currentSheets = readStyleFingerprints();

  if (hasSameStyleSheets(currentSheets, lastSourceSheets)) {
    return cachedConstructedSheets;
  }

  // 同索引下对象相同而规则数变化 = 原地 insertRule/deleteRule，旧克隆已过期
  for (let i = 0; i < currentSheets.length && i < lastSourceSheets.length; i += 1) {
    const current = currentSheets[i]!;
    const previous = lastSourceSheets[i]!;
    if (current.sheet === previous.sheet && current.ruleCount !== previous.ruleCount) {
      constructedSheetCache.delete(current.sheet);
    }
  }

  const result: CSSStyleSheet[] = [];
  for (const { sheet } of currentSheets) {
    const constructed = convertToConstructedSheet(sheet);
    if (constructed) {
      result.push(constructed);
    }
  }

  lastSourceSheets = currentSheets;
  cachedConstructedSheets = result;
  return cachedConstructedSheets;
}

/**
 * 将文档级样式表同步到 shadowRoot（采用构造式样式表 adoptedStyleSheets）
 * 若环境不支持或跨域规则异常，安全降级忽略。
 * @param shadowRoot 目标 shadowRoot
 */
function syncAdoptedStyleSheets(shadowRoot: ShadowRoot): void {
  try {
    shadowRoot.adoptedStyleSheets = updateConstructedSheets();
  } catch {
    // 降级容错：静默忽略样式表同步失败（如 jsdom 限制或不支持）
  }
}

/**
 * 响应 document.head 变更，仅在样式表集合（数量/对象身份/规则数）变动时重赋 adoptedStyleSheets
 */
function onHeadMutated(): void {
  for (const root of registeredShadowRoots) {
    if (!root.isConnected) {
      registeredShadowRoots.delete(root);
    }
  }
  if (registeredShadowRoots.size === 0) return;

  const previousSheets = cachedConstructedSheets;
  const sheets = updateConstructedSheets();
  if (sheets === previousSheets) return;

  for (const root of registeredShadowRoots) {
    try {
      root.adoptedStyleSheets = sheets;
    } catch {
      // 降级容错
    }
  }
}

/**
 * 监听 document.head 新增样式表（PrimeVue 组件样式为首次使用时懒注入 <style>），
 * 为全部已注册 shadowRoot 重同步 adoptedStyleSheets，并顺带清理已断开的宿主。
 */
function ensureHeadStyleObserver(): void {
  if (headStyleObserver) return;
  headStyleObserver = new MutationObserver(onHeadMutated);
  headStyleObserver.observe(document.head ?? document, { childList: true, subtree: true });
}

/**
 * 卸载 Shadow DOM 挂载隔离服务：断开 observer、清空已注册 shadowRoot 登记表与样式表指纹缓存
 */
export function teardownShadowMount(): void {
  if (headStyleObserver) {
    headStyleObserver.disconnect();
    headStyleObserver = null;
  }
  registeredShadowRoots.clear();
  lastSourceSheets = [];
  cachedConstructedSheets = [];
}

/**
 * 获取给定宿主容器内的 shadow 内容根元素（.cv-shadow-mount-root）
 * 若容器无 shadowRoot 或未挂载内容根，返回 null。
 * @param container 宿主容器
 * @returns shadow 内容根元素或 null
 */
export function getShadowContentRoot(container: HTMLElement): HTMLElement | null {
  return container.shadowRoot?.querySelector<HTMLElement>(`.${CV_SHADOW_ROOT_CLASS}`) ?? null;
}

/**
 * 确保给定宿主容器拥有 open shadowRoot 与内容根元素，并返回 Teleport 挂载目标。
 * - container 无 shadowRoot 时 attachShadow({ mode: 'open' })，创建 shadow 内容根元素并同步样式表；
 * - 已有 shadowRoot 时复用已存在的内容根元素；
 * - 若 attachShadow 抛错（如不支持或已 closed），安全降级返回 container 自身。
 * @param container 光域宿主容器（如 .cv-render 或 .cv-floor-tail-slot）
 * @returns shadow 内部的内容根元素（降级时为 container 自身）
 */
export function ensureShadowMountTarget(container: HTMLElement): HTMLElement {
  try {
    let shadowRoot = container.shadowRoot;
    if (!shadowRoot) {
      shadowRoot = container.attachShadow({ mode: 'open' });
      registeredShadowRoots.add(shadowRoot);
      ensureHeadStyleObserver();
    }
    syncAdoptedStyleSheets(shadowRoot);
    let inner = shadowRoot.querySelector<HTMLElement>(`.${CV_SHADOW_ROOT_CLASS}`);
    if (!inner) {
      inner = document.createElement('div');
      inner.className = CV_SHADOW_ROOT_CLASS;
      shadowRoot.append(inner);
    }
    return inner;
  } catch {
    // 降级容错：不支持 shadowRoot 或调用异常时回退为直接使用容器自身
    return container;
  }
}
