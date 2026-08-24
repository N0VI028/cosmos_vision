import {
  isHTMLElementNode,
  tryAccessIframeDocument,
} from '@/services/inline-image/iframe-utils';

export interface AccessibleFrame {
  iframe: HTMLIFrameElement;
  doc: Document;
  win: Window;
}

/**
 * 统一的同源 Iframe 生命周期与事件协同注册表 (FrameRegistry)
 * 集中管理同源可访问 iframe 的动态发现、事件挂载、尺寸/滚动同步与生命周期注销
 */
export class FrameRegistry {
  private activeFrames = new Set<HTMLIFrameElement>();
  private pointerCleanups = new WeakMap<HTMLIFrameElement, () => void>();
  private layoutCleanups = new WeakMap<HTMLIFrameElement, () => void>();
  private loadCleanups = new WeakMap<HTMLIFrameElement, () => void>();
  private docMap = new WeakMap<HTMLIFrameElement, Document>();
  private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private layoutSyncHandler: (() => void) | null = null;
  private mutationObserver: MutationObserver | null = null;

  /**
   * 扫描并返回当前页面中所有同源且可访问的 iframe 实例
   */
  public getAccessibleFrames(): AccessibleFrame[] {
    const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
    const results: AccessibleFrame[] = [];
    for (const iframe of iframes) {
      const doc = tryAccessIframeDocument(iframe);
      const win = iframe.contentWindow;
      if (doc && win) {
        results.push({ iframe, doc, win });
      }
    }
    return results;
  }

  /**
   * 启动 DOM 动态监听，感知新挂载的 iframe 并自动注册
   */
  public startObserving(options?: { onFrameAdded?: (frame: AccessibleFrame) => void }): void {
    if (this.mutationObserver || typeof MutationObserver === 'undefined') return;
    this.syncFrames(options?.onFrameAdded);

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldSync = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (isHTMLElementNode(node)) {
              if (node.tagName === 'IFRAME' || node.querySelector('iframe')) {
                shouldSync = true;
                break;
              }
            }
          }
        }
      }
      if (shouldSync) {
        this.syncFrames(options?.onFrameAdded);
      }
    });

    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * 停止 DOM 动态监听
   */
  public stopObserving(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * 统一注册手势指针监听器
   * 自动为所有当前及未来同源 iframe 文档挂载 pointerdown
   */
  public bindPointerDown(handler: (e: PointerEvent) => void): void {
    this.pointerDownHandler = handler;
    for (const frame of this.getAccessibleFrames()) {
      this.registerIframe(frame.iframe);
    }
  }

  /**
   * 主动登记单个 iframe 元素（如悬停、按下或新增时刷新）
   */
  public registerIframe(iframe: HTMLIFrameElement): boolean {
    const doc = tryAccessIframeDocument(iframe);
    const win = iframe.contentWindow;
    if (!doc || !win) return false;

    this.activeFrames.add(iframe);

    // 绑定 iframe load 事件，保证其文档重新载入或 swipe 切换时自动重新注入
    if (!this.loadCleanups.has(iframe)) {
      const onLoad = () => {
        this.refreshFrame(iframe);
      };
      iframe.addEventListener('load', onLoad);
      this.loadCleanups.set(iframe, () => {
        iframe.removeEventListener('load', onLoad);
        this.loadCleanups.delete(iframe);
      });
    }

    this.refreshFrame(iframe);
    return true;
  }

  /**
   * 刷新并确保 iframe 当前最新的 contentDocument 上挂载有监听器
   */
  public refreshFrame(iframe: HTMLIFrameElement): void {
    const doc = tryAccessIframeDocument(iframe);
    const win = iframe.contentWindow;
    if (!doc || !win) return;

    const prevDoc = this.docMap.get(iframe);
    if (prevDoc !== doc) {
      const oldPointerCleanup = this.pointerCleanups.get(iframe);
      if (oldPointerCleanup) oldPointerCleanup();
      this.pointerCleanups.delete(iframe);

      const oldLayoutCleanup = this.layoutCleanups.get(iframe);
      if (oldLayoutCleanup) oldLayoutCleanup();
      this.layoutCleanups.delete(iframe);

      this.docMap.set(iframe, doc);
    }

    const frame: AccessibleFrame = { iframe, doc, win };
    if (this.pointerDownHandler) {
      this.attachPointerDown(frame);
    }
    if (this.layoutSyncHandler) {
      this.attachLayoutSync(frame);
    }
  }

  /**
   * 挂载指针按下监听器
   */
  private attachPointerDown(frame: AccessibleFrame): void {
    if (this.pointerCleanups.has(frame.iframe)) return;
    const handler = (e: PointerEvent) => {
      this.pointerDownHandler?.(e);
    };
    frame.doc.addEventListener('pointerdown', handler, true);
    const cleanup = () => {
      try {
        frame.doc.removeEventListener('pointerdown', handler, true);
      } catch {
        // 忽略已销毁的 iframe 异常
      }
      this.pointerCleanups.delete(frame.iframe);
    };
    this.pointerCleanups.set(frame.iframe, cleanup);
    this.activeFrames.add(frame.iframe);
  }

  /**
   * 绑定多文档滚动与重排同步监听器
   * 覆盖 window 滚动/缩放、iframe 内部滚动/缩放以及 ResizeObserver
   */
  public bindLayoutSync(
    syncLayout: () => void,
    observedElements: HTMLElement[] = [],
  ): () => void {
    this.layoutSyncHandler = syncLayout;
    const cleanups: Array<() => void> = [];

    // 1. 顶层窗口滚动与缩放
    window.addEventListener('scroll', syncLayout, true);
    window.addEventListener('resize', syncLayout);
    cleanups.push(() => {
      window.removeEventListener('scroll', syncLayout, true);
      window.removeEventListener('resize', syncLayout);
    });

    // 2. 遍历已知同源 iframe 绑定滚动与缩放
    const currentFrames = this.getAccessibleFrames();
    for (const frame of currentFrames) {
      this.attachLayoutSync(frame);
    }

    // 3. ResizeObserver 监听宿主容器、选中段落与 iframe
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        syncLayout();
      });
      for (const el of observedElements) {
        ro.observe(el);
      }
      for (const frame of currentFrames) {
        ro.observe(frame.iframe);
      }
      cleanups.push(() => {
        ro.disconnect();
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      this.clearLayoutSync();
    };
  }

  /**
   * 挂载单个 iframe 的布局同步监听
   */
  private attachLayoutSync(frame: AccessibleFrame): void {
    if (this.layoutCleanups.has(frame.iframe) || !this.layoutSyncHandler) return;
    const sync = this.layoutSyncHandler;
    frame.win.addEventListener('scroll', sync, true);
    frame.win.addEventListener('resize', sync);
    const cleanup = () => {
      try {
        frame.win.removeEventListener('scroll', sync, true);
        frame.win.removeEventListener('resize', sync);
      } catch {
        // 忽略已销毁的 iframe 异常
      }
      this.layoutCleanups.delete(frame.iframe);
    };
    this.layoutCleanups.set(frame.iframe, cleanup);
    this.activeFrames.add(frame.iframe);
  }

  /**
   * 清理布局同步监听
   */
  private clearLayoutSync(): void {
    this.layoutSyncHandler = null;
    this.activeFrames.forEach((iframe) => {
      const cleanup = this.layoutCleanups.get(iframe);
      if (cleanup) cleanup();
    });
  }

  /**
   * 同步当前所有同源 iframe
   */
  private syncFrames(onFrameAdded?: (frame: AccessibleFrame) => void): void {
    const currentFrames = this.getAccessibleFrames();
    for (const frame of currentFrames) {
      const isNew = !this.activeFrames.has(frame.iframe);
      this.registerIframe(frame.iframe);
      if (isNew) {
        onFrameAdded?.(frame);
      }
    }
  }

  /**
   * 彻底清理并销毁所有监听器与观察者
   */
  public destroy(): void {
    this.stopObserving();
    this.pointerDownHandler = null;
    this.layoutSyncHandler = null;

    this.activeFrames.forEach((iframe) => {
      const pointerCleanup = this.pointerCleanups.get(iframe);
      if (pointerCleanup) pointerCleanup();
      const layoutCleanup = this.layoutCleanups.get(iframe);
      if (layoutCleanup) layoutCleanup();
      const loadCleanup = this.loadCleanups.get(iframe);
      if (loadCleanup) loadCleanup();
    });
    this.activeFrames.clear();
  }
}

/** 全局默认 FrameRegistry 单例 */
export const defaultFrameRegistry = new FrameRegistry();
