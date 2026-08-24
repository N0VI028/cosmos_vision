import { describe, expect, it } from 'vitest';
import { extractBlocksUntil, extractMessageBlocks } from '@/services/inline-image/block-ref';

describe('block-ref 结构化文本提取管道', () => {
  it('抽取普通消息段落为结构化 BlockRef 序列', () => {
    document.body.innerHTML = `
      <div mesid="1" class="mes">
        <div class="mes_text">
          <p class="p1">第一段正文</p>
          <p class="p2">第二段正文</p>
        </div>
      </div>
    `;
    const mes = document.querySelector<HTMLElement>('.mes_text')!;
    const blocks = extractMessageBlocks(mes);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.kind).toBe('classic-p');
    expect(blocks[0]!.text).toBe('第一段正文');
    expect(blocks[1]!.kind).toBe('classic-p');
    expect(blocks[1]!.text).toBe('第二段正文');
  });

  it('抽取包含同源 iframe 的混合消息，并按 DOM 序递归展开气泡', () => {
    document.body.innerHTML = `
      <div mesid="2" class="mes">
        <div class="mes_text">
          <p class="p-before">宿主前置段落</p>
        </div>
      </div>
    `;
    const mes = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mes.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = `
      <div class="bubble bubble-1">iframe 第一句气泡</div>
      <div class="bubble bubble-2">iframe 第二句气泡</div>
    `;
    const pAfter = document.createElement('p');
    pAfter.className = 'p-after';
    pAfter.textContent = '宿主后置段落';
    mes.appendChild(pAfter);

    const blocks = extractMessageBlocks(mes);

    expect(blocks).toHaveLength(4);
    expect(blocks[0]!.text).toBe('宿主前置段落');
    expect(blocks[1]!.text).toBe('iframe 第一句气泡');
    expect(blocks[1]!.kind).toBe('frontend-bubble');
    expect(blocks[1]!.hostIframe).toBe(iframe);
    expect(blocks[2]!.text).toBe('iframe 第二句气泡');
    expect(blocks[2]!.hostIframe).toBe(iframe);
    expect(blocks[3]!.text).toBe('宿主后置段落');
  });

  it('精确截断至目标焦点，严格排除焦点之后的内容', () => {
    document.body.innerHTML = `
      <div mesid="3" class="mes">
        <div class="mes_text">
          <p class="p-before">前置背景</p>
        </div>
      </div>
    `;
    const mes = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mes.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = `
      <div class="bubble b1">气泡 1</div>
      <div class="bubble b2">气泡 2（焦点）</div>
      <div class="bubble b3">气泡 3（后续）</div>
    `;
    const pAfter = document.createElement('p');
    pAfter.textContent = '后续背景';
    mes.appendChild(pAfter);

    const focusEl = iframe.contentDocument!.querySelector<HTMLElement>('.b2')!;
    const context = extractBlocksUntil(focusEl);

    expect(context.historyBlocks.map(b => b.text)).toEqual(['前置背景', '气泡 1']);
    expect(context.focusBlock.text).toBe('气泡 2（焦点）');
    expect(context.allBlocks).toHaveLength(5);
  });

  it('自动过滤 HTML 源码块与注入控件', () => {
    document.body.innerHTML = `
      <div mesid="4" class="mes">
        <div class="mes_text">
          <p class="source-markup"><!DOCTYPE html><html><style>.test{}</style></html></p>
          <div class="cv-floor-tail">楼层尾挂载</div>
          <button class="image-tag-button">生图按钮</button>
          <div data-cv-selectable="true">有效气泡正文</div>
        </div>
      </div>
    `;
    const mes = document.querySelector<HTMLElement>('.mes_text')!;
    const blocks = extractMessageBlocks(mes);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toBe('有效气泡正文');
    expect(blocks[0]!.kind).toBe('custom-selectable');
  });
});
