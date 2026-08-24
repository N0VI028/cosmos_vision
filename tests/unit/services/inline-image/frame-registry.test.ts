import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FrameRegistry } from '@/services/inline-image/frame-registry';

describe('FrameRegistry', () => {
  let registry: FrameRegistry;
  let container: HTMLDivElement;

  beforeEach(() => {
    registry = new FrameRegistry();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    registry.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  it('正确扫描同源 iframe 实例', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);

    const frames = registry.getAccessibleFrames();
    expect(frames.length).toBe(1);
    expect(frames[0].iframe).toBe(iframe);
    expect(frames[0].doc).toBe(iframe.contentDocument);
    expect(frames[0].win).toBe(iframe.contentWindow);
  });

  it('自动为同源 iframe 挂载 pointerdown 并在 destroy 时清理', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);

    const pointerSpy = vi.fn();
    registry.bindPointerDown(pointerSpy);

    const iframeDoc = iframe.contentDocument!;
    const button = iframeDoc.createElement('button');
    iframeDoc.body.appendChild(button);

    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(pointerSpy).toHaveBeenCalledTimes(1);

    registry.destroy();

    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(pointerSpy).toHaveBeenCalledTimes(1);
  });

  it('支持主动登记新 iframe (registerIframe)', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);

    const pointerSpy = vi.fn();
    registry.bindPointerDown(pointerSpy);

    const result = registry.registerIframe(iframe);
    expect(result).toBe(true);

    const iframeDoc = iframe.contentDocument!;
    iframeDoc.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(pointerSpy).toHaveBeenCalled();
  });

  it('支持多文档滚动与尺寸同步绑定与清理', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);

    const syncSpy = vi.fn();
    const observedEl = document.createElement('div');
    container.appendChild(observedEl);

    const unbind = registry.bindLayoutSync(syncSpy, [observedEl]);

    window.dispatchEvent(new Event('scroll'));
    expect(syncSpy).toHaveBeenCalledTimes(1);

    iframe.contentWindow?.dispatchEvent(new Event('scroll'));
    expect(syncSpy).toHaveBeenCalledTimes(2);

    unbind();

    window.dispatchEvent(new Event('scroll'));
    iframe.contentWindow?.dispatchEvent(new Event('scroll'));
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });
});
