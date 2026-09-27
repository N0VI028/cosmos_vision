import { describe, expect, it } from 'vitest';
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

    // 设置进度
    session.status.setProgress({ value: 10, max: 20 });
    expect(host.querySelector('.cv-inline-generation-spinner')).toBeNull();
    const progressEl = host.querySelector('.cv-inline-generation-progress');
    expect(progressEl).not.toBeNull();
    const textEl = host.querySelector('.cv-inline-generation-text');
    expect(textEl?.textContent).toBe('正在生图... 50%');

    // 清除进度
    session.status.setProgress(null);
    expect(host.querySelector('.cv-inline-generation-spinner')).not.toBeNull();
    expect(host.querySelector('.cv-inline-generation-progress')).toBeNull();
    expect(textEl?.textContent).toBe('正在生图...');

    // 清理
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

    // 切换到 error 态
    session.status.setStatus('生图失败', 'error');
    expect(host.querySelector('.cv-inline-generation-progress')).toBeNull();
    expect(host.querySelector('.cv-inline-generation-spinner')).toBeNull();

    session.status.remove();
    controller.cleanup();
  });
});
