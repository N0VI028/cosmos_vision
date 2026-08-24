import { describe, expect, it } from 'vitest';
import { extractFrontendText, resolveFrontendBubbleRoot } from '@/services/inline-image/frontend-text-extract';

describe('frontend-text-extract', () => {
  it('extracts clean text while preserving <br> newlines and ignoring metadata and controls', () => {
    const bubble = document.createElement('div');
    bubble.className = 'custom-bubble';
    bubble.innerHTML = `
      <p>第一行对话<br>第二行对话</p>
      <button class="image-tag-button">生图按钮文本</button>
      <title>微信聊天界面</title>
      <script>console.log("script");</script>
      <div class="cv-inline-controls">插件控件</div>
      <span>第三行文本</span>
    `;
    document.body.appendChild(bubble);

    const extracted = extractFrontendText(bubble);
    expect(extracted).toContain('第一行对话\n第二行对话');
    expect(extracted).toContain('第三行文本');
    expect(extracted).not.toContain('生图按钮文本');
    expect(extracted).not.toContain('微信聊天界面');
    expect(extracted).not.toContain('script');
    expect(extracted).not.toContain('插件控件');
  });

  it('resolves bubble root using data-cv-selectable or closest block', () => {
    const container = document.createElement('div');
    container.setAttribute('data-cv-selectable', 'true');
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);

    expect(resolveFrontendBubbleRoot(child)).toBe(container);
  });
});
