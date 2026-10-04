import { describe, expect, it, vi } from 'vitest';
import { createInlineGenerationSessionController } from '@/composables/inlineGenerationSession';

describe('inlineGenerationSession setProgress and ProgressBar', () => {
  it('调用 setProgress 能在运行态切换显示 ProgressBar 并移除 ProgressSpinner', () => {
    const controller = createInlineGenerationSessionController({
      getDarkMode: () => false,
    });
    const paragraph = document.createElement('div');
    const target = document.createElement('div');
    document.body.appendChild(target);

    const session = controller.start(paragraph, target, '正在生图...');
    const host = session.status.host;

    // 默认 running 态无 progress 时应有 spinner，无 progressbar
    expect(host.querySelector('.cv-inline-generation-spinner')).not.toBeNull();
    expect(host.querySelector('.cv-inline-generation-progress')).toBeNull();

    session.status.setProgress({ value: 10, max: 20 });
    expect(host.querySelector('.cv-inline-generation-spinner')).toBeNull();
    const progressEl = host.querySelector('.cv-inline-generation-progress');
    expect(progressEl).not.toBeNull();
    const textEl = host.querySelector('.cv-inline-generation-text');
    expect(textEl?.textContent).toBe('正在生图... 50%');

    session.status.setProgress(null);
    expect(host.querySelector('.cv-inline-generation-spinner')).not.toBeNull();
    expect(host.querySelector('.cv-inline-generation-progress')).toBeNull();
    expect(textEl?.textContent).toBe('正在生图...');

    session.status.remove();
    controller.cleanup();
  });

  it('错误态下不显示 ProgressBar', () => {
    const controller = createInlineGenerationSessionController({
      getDarkMode: () => false,
    });
    const paragraph = document.createElement('div');
    const target = document.createElement('div');
    document.body.appendChild(target);

    const session = controller.start(paragraph, target, '正在生图...');
    const host = session.status.host;

    session.status.setProgress({ value: 5, max: 20 });
    expect(host.querySelector('.cv-inline-generation-progress')).not.toBeNull();

    session.status.setStatus('生图失败', 'error');
    expect(host.querySelector('.cv-inline-generation-progress')).toBeNull();
    expect(host.querySelector('.cv-inline-generation-spinner')).toBeNull();

    session.status.remove();
    controller.cleanup();
  });
});

describe('inlineGenerationSession cancel-to-retry transition', () => {
  it('用例 A：用户点击取消转为可重试错误态，点击重试触发重试回调', () => {
    const controller = createInlineGenerationSessionController({
      getDarkMode: () => false,
    });
    const paragraph = document.createElement('div');
    const target = document.createElement('div');
    document.body.appendChild(target);

    const session = controller.start(paragraph, target, '正在生图...');
    const host = session.status.host;

    const cancelButton = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === '取消',
    );
    expect(cancelButton).toBeDefined();
    cancelButton?.click();

    expect(session.status.isRemoved()).toBe(false);
    expect(host.isConnected).toBe(true);

    const retry = vi.fn();
    controller.handleFailure(new Error('已取消生成'), session, retry);

    const textEl = host.querySelector('.cv-inline-generation-text');
    expect(textEl?.textContent).toContain('已取消生成');

    const retryButton = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === '重试',
    );
    expect(retryButton).toBeDefined();

    retryButton?.click();
    expect(retry).toHaveBeenCalledTimes(1);

    controller.cleanup();
    target.remove();
  });

  it('用例 B：同段落启动新会话 supersede 旧会话，旧会话 handleFailure 仍移除状态条且无重试按钮', () => {
    const controller = createInlineGenerationSessionController({
      getDarkMode: () => false,
    });
    const paragraph = document.createElement('div');
    const target = document.createElement('div');
    document.body.appendChild(target);

    const session1 = controller.start(paragraph, target, '生成1...');
    const retry1 = vi.fn();

    controller.start(paragraph, target, '生成2...');
    expect(session1.status.isRemoved()).toBe(true);

    controller.handleFailure(new Error('任务中断'), session1, retry1);

    expect(session1.status.isRemoved()).toBe(true);
    const retryButton1 = Array.from(session1.status.host.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === '重试',
    );
    expect(retryButton1).toBeUndefined();
    expect(retry1).not.toHaveBeenCalled();

    controller.cleanup();
    target.remove();
  });

  it('用例 C：取消后被 supersede 的迟到 rejection 不复活已移除状态条', () => {
    const controller = createInlineGenerationSessionController({
      getDarkMode: () => false,
    });
    const paragraph = document.createElement('div');
    const target = document.createElement('div');
    document.body.appendChild(target);

    const session1 = controller.start(paragraph, target, '生成1...');

    const cancelButton = Array.from(session1.status.host.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === '取消',
    );
    expect(cancelButton).toBeDefined();
    cancelButton?.click();

    controller.start(paragraph, target, '生成2...');

    const retry = vi.fn();
    controller.handleFailure(new Error('x'), session1, retry);

    expect(session1.status.isRemoved()).toBe(true);
    const retryButton = Array.from(session1.status.host.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === '重试',
    );
    expect(retryButton).toBeUndefined();

    controller.cleanup();
    target.remove();
  });
});
