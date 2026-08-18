import { describe, expect, it } from 'vitest';
import { resolveInlineRoute } from '@/services/inline-image/route-resolve';

describe('route-resolve', () => {
  it('identifies classic paragraph inside .mes_text p', () => {
    document.body.innerHTML = `
      <div class="mes" mesid="1">
        <div class="mes_text">
          <p id="target">这是一个普通段落</p>
        </div>
      </div>
    `;
    const target = document.getElementById('target')!;
    expect(resolveInlineRoute(target)).toBe('classic-p');
  });

  it('identifies frontend bubble element not inside p', () => {
    document.body.innerHTML = `
      <div class="mes" mesid="1">
        <div class="mes_text">
          <div class="bubble-container" id="bubble">
            <span class="content">前端卡气泡文本</span>
          </div>
        </div>
      </div>
    `;
    const bubble = document.getElementById('bubble')!;
    expect(resolveInlineRoute(bubble)).toBe('frontend');
  });

  it('throws error when element is from another document (iframe)', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    // 轻量 DOM 模拟（如部分 happy-dom 配置）不提供 iframe 文档时跳过该用例
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;
    const insideIframe = iframeDoc.createElement('div');
    iframeDoc.body.appendChild(insideIframe);

    expect(() => resolveInlineRoute(insideIframe)).toThrow('暂不支持 iframe 内选段生图');
  });
});
