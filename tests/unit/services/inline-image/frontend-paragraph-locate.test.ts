import { describe, expect, it, vi } from 'vitest';
import {
  locateFrontendParagraphFromPoint,
  type FrontendCaretDeps,
} from '@/services/inline-image/frontend-paragraph-locate';

describe('locateFrontendParagraphFromPoint', () => {
  it('正常路径：段首段尾跨 span 时正确识别最低公共祖先元素 LCA 为 p', () => {
    const container = document.createElement('div');
    container.className = 'frontend-card';
    container.innerHTML = `
      <p class="target-para">
        <span class="part-a">Paragraph start </span>
        <span class="part-b">paragraph end</span>
      </p>
    `;
    document.body.appendChild(container);

    const spanA = container.querySelector('.part-a')!;
    const spanB = container.querySelector('.part-b')!;
    const textA = spanA.firstChild!;
    const textB = spanB.firstChild!;
    const targetPara = container.querySelector('.target-para')!;

    const deps: FrontendCaretDeps = {
      caretFromPoint: () => ({ node: textA, offset: 2 }),
      hasRects: () => true,
      modify: (sel, _action, direction, granularity) => {
        if (granularity === 'paragraphboundary') {
          const range = document.createRange();
          if (direction === 'backward') {
            range.setStart(textA, 0);
            range.setEnd(textA, 0);
          } else {
            range.setStart(textB, textB.textContent!.length);
            range.setEnd(textB, textB.textContent!.length);
          }
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
        return false;
      },
    };

    const result = locateFrontendParagraphFromPoint(document, 10, 20, deps);
    expect(result).toBe(targetPara);

    container.remove();
  });

  it('caret 命中元素节点或返回 null 时返回 null', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    // caret 返回 null
    const resNull = locateFrontendParagraphFromPoint(document, 0, 0, {
      caretFromPoint: () => null,
      hasRects: () => true,
    });
    expect(resNull).toBeNull();

    // caret 命中元素节点（nodeType !== Node.TEXT_NODE）
    const resEl = locateFrontendParagraphFromPoint(document, 0, 0, {
      caretFromPoint: () => ({ node: el, offset: 0 }),
      hasRects: () => true,
    });
    expect(resEl).toBeNull();

    el.remove();
  });

  it('seed 两侧 rects 均空时返回 null', () => {
    const p = document.createElement('p');
    p.textContent = 'Visible text';
    document.body.appendChild(p);
    const textNode = p.firstChild!;

    const result = locateFrontendParagraphFromPoint(document, 10, 10, {
      caretFromPoint: () => ({ node: textNode, offset: 3 }),
      hasRects: () => false,
    });
    expect(result).toBeNull();

    p.remove();
  });

  it('modify 不可用或 paragraphboundary 失败时，回退到 lineboundary', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="line-wrap">
        <span class="line-content">Single line text content</span>
      </div>
    `;
    document.body.appendChild(container);
    const span = container.querySelector('.line-content')!;
    const text = span.firstChild!;

    const deps: FrontendCaretDeps = {
      caretFromPoint: () => ({ node: text, offset: 5 }),
      hasRects: () => true,
      modify: (sel, _action, direction, granularity) => {
        if (granularity === 'paragraphboundary') {
          return false; // 段落粒度不可用
        }
        if (granularity === 'lineboundary') {
          const r = document.createRange();
          if (direction === 'backward') {
            r.setStart(text, 0);
            r.setEnd(text, 0);
          } else {
            r.setStart(text, text.textContent!.length);
            r.setEnd(text, text.textContent!.length);
          }
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        return false;
      },
    };

    const result = locateFrontendParagraphFromPoint(document, 10, 10, deps);
    expect(result).toBe(span); // text 的 parentElement 为 span，span 的 LCA 为 span

    container.remove();
  });

  it('段首段尾构造的 range 文本为空时走回退', () => {
    const container = document.createElement('div');
    container.innerHTML = `<p class="para">Text</p>`;
    document.body.appendChild(container);
    const p = container.querySelector('.para')!;
    const text = p.firstChild!;

    const deps: FrontendCaretDeps = {
      caretFromPoint: () => ({ node: text, offset: 1 }),
      hasRects: () => true,
      modify: (sel, _action, _direction, granularity) => {
        if (granularity === 'paragraphboundary') {
          // 模拟异常：段首段尾在同一个位置，内容为空
          const r = document.createRange();
          r.setStart(text, 0);
          r.setEnd(text, 0);
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        return false;
      },
    };

    const result = locateFrontendParagraphFromPoint(document, 10, 10, deps);
    expect(result).toBeNull();

    container.remove();
  });

  it('LCA 爬到 body / .mes_text / [mesid] 判定退化走回退', () => {
    const mes = document.createElement('div');
    mes.setAttribute('mesid', '100');
    const mesText = document.createElement('div');
    mesText.className = 'mes_text';
    mesText.innerHTML = `
      <div class="part-1">Text one</div>
      <div class="part-2">Text two</div>
    `;
    mes.appendChild(mesText);
    document.body.appendChild(mes);

    const t1 = mesText.querySelector('.part-1')!.firstChild!;
    const t2 = mesText.querySelector('.part-2')!.firstChild!;

    const deps: FrontendCaretDeps = {
      caretFromPoint: () => ({ node: t1, offset: 2 }),
      hasRects: () => true,
      modify: (sel, _action, direction, granularity) => {
        if (granularity === 'paragraphboundary') {
          // 模拟整楼层全选：start 在 part-1，end 在 part-2，两者的 LCA 是 mesText (.mes_text)
          const r = document.createRange();
          if (direction === 'backward') {
            r.setStart(t1, 0);
            r.setEnd(t1, 0);
          } else {
            r.setStart(t2, t2.textContent!.length);
            r.setEnd(t2, t2.textContent!.length);
          }
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        return false;
      },
    };

    const result = locateFrontendParagraphFromPoint(document, 10, 10, deps);
    // paragraphboundary 判定 LCA 是 .mes_text，退化失败；lineboundary 没 mock 返回 false，最终为 null
    expect(result).toBeNull();

    mes.remove();
  });

  it('原选区完整保存与恢复：调用前后 selection ranges 保持一致', () => {
    const p1 = document.createElement('p');
    p1.textContent = 'Existing selection text';
    const p2 = document.createElement('p');
    p2.textContent = 'Target paragraph text';
    document.body.appendChild(p1);
    document.body.appendChild(p2);

    const initialRange = document.createRange();
    initialRange.setStart(p1.firstChild!, 1);
    initialRange.setEnd(p1.firstChild!, 5);

    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(initialRange);

    const removeAllSpy = vi.spyOn(sel, 'removeAllRanges');
    const addRangeSpy = vi.spyOn(sel, 'addRange');

    const targetText = p2.firstChild!;
    const deps: FrontendCaretDeps = {
      caretFromPoint: () => ({ node: targetText, offset: 2 }),
      hasRects: () => true,
      modify: (s, _action, direction) => {
        const r = document.createRange();
        if (direction === 'backward') {
          r.setStart(targetText, 0);
          r.setEnd(targetText, 0);
        } else {
          r.setStart(targetText, targetText.textContent!.length);
          r.setEnd(targetText, targetText.textContent!.length);
        }
        s.removeAllRanges();
        s.addRange(r);
        return true;
      },
    };

    const result = locateFrontendParagraphFromPoint(document, 0, 0, deps);
    expect(result).toBe(p2);

    // 验证选区已恢复
    expect(sel.rangeCount).toBe(1);
    const restored = sel.getRangeAt(0);
    expect(restored.startContainer).toBe(initialRange.startContainer);
    expect(restored.startOffset).toBe(initialRange.startOffset);
    expect(restored.endContainer).toBe(initialRange.endContainer);
    expect(restored.endOffset).toBe(initialRange.endOffset);

    // 验证调用了清空与重置
    expect(removeAllSpy).toHaveBeenCalled();
    expect(addRangeSpy).toHaveBeenCalled();

    p1.remove();
    p2.remove();
  });
});
