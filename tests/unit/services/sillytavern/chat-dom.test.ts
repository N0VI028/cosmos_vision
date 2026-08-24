import { describe, expect, it } from 'vitest';
import {
  extractMessageParagraphs,
  extractMessageParagraphsUntil,
  getFocusedChatParagraphs,
  stripFrontendSourceMarkup,
} from '@/services/sillytavern/chat-dom';

describe('chat-dom 前端型楼层文本提取', () => {
  it('只保留嵌套隐式容器中最内层的文本气泡', () => {
    document.body.innerHTML = `
      <div mesid="1">
        <div class="mes_text">
          <p>普通段落</p>
          <div class="custom-chat-container">
            <div class="message-row">
              <div class="custom-bubble">气泡文本</div>
            </div>
          </div>
        </div>
      </div>
    `;
    const bubble = document.querySelector<HTMLElement>('.custom-bubble')!;

    expect(extractMessageParagraphs(bubble)).toEqual(['普通段落', '气泡文本']);
  });

  it('排除显式气泡内外的隐式重复层级', () => {
    document.body.innerHTML = `
      <div mesid="2">
        <div class="mes_text">
          <div class="custom-chat-container">
            <div class="message-row">
              <div data-cv-selectable>显式气泡</div>
            </div>
          </div>
          <div class="custom-bubble">隐式气泡</div>
        </div>
      </div>
    `;
    const explicitBubble = document.querySelector<HTMLElement>('[data-cv-selectable]')!;

    expect(extractMessageParagraphs(explicitBubble)).toEqual(['显式气泡', '隐式气泡']);
  });

  it('按元素身份排除焦点且不在空结果时回退', () => {
    document.body.innerHTML = `
      <div mesid="3">
        <div class="mes_text">
          <div class="custom-bubble focus">焦点气泡</div>
          <div class="custom-bubble other">同楼层气泡</div>
        </div>
      </div>
    `;
    const focus = document.querySelector<HTMLElement>('.focus')!;
    const other = document.querySelector<HTMLElement>('.other')!;

    expect(extractMessageParagraphs(focus, [focus])).toEqual(['同楼层气泡']);
    expect(extractMessageParagraphs(other, [focus, other])).toEqual([]);
  });

  it('截断到焦点气泡并包含焦点，不包含后续内容', () => {
    document.body.innerHTML = `
      <div mesid="4">
        <div class="mes_text">
          <div class="custom-bubble before">前置内容</div>
          <div class="custom-bubble focus">焦点内容</div>
          <div class="custom-bubble after">后续内容</div>
        </div>
      </div>
    `;
    const focus = document.querySelector<HTMLElement>('.focus')!;

    expect(extractMessageParagraphsUntil(focus)).toEqual(['前置内容', '焦点内容']);
  });

  it('iframe 焦点历史排除宿主 HTML 源码并保留可见文本', () => {
    document.body.innerHTML = `
      <div mesid="5">
        <div class="mes_text">
          <p>正常文章上下文</p>
          <p class="frontend-source"></p>
        </div>
      </div>
    `;
    const source = document.querySelector<HTMLElement>('.frontend-source')!;
    source.textContent = '<!DOCTYPE html><html><head><style>.bubble{color:red}</style></head></html>';
    const mesText = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mesText.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = '<div class="bubble">iframe 气泡文本</div>';
    const focus = iframe.contentDocument!.querySelector<HTMLElement>('.bubble')!;

    expect(extractMessageParagraphsUntil(focus)).toEqual(['正常文章上下文', 'iframe 气泡文本']);
  });

  it('iframe 内包含多个气泡时，截断到焦点气泡，严格排除后续气泡', () => {
    document.body.innerHTML = `
      <div mesid="5b">
        <div class="mes_text">
          <p>宿主前置段落</p>
        </div>
      </div>
    `;
    const mesText = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mesText.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = `
      <div class="chat-list">
        <div class="bubble bubble-1">第一句对话</div>
        <div class="bubble bubble-2">第二句对话（焦点）</div>
        <div class="bubble bubble-3">第三句对话（后续）</div>
      </div>
    `;
    const b1 = iframe.contentDocument!.querySelector<HTMLElement>('.bubble-1')!;
    const b2 = iframe.contentDocument!.querySelector<HTMLElement>('.bubble-2')!;

    // 选中第一句时，排除第二句与第三句
    expect(extractMessageParagraphsUntil(b1)).toEqual(['宿主前置段落', '第一句对话']);

    // 选中第二句时，包含第一句与第二句，排除第三句
    expect(extractMessageParagraphsUntil(b2)).toEqual(['宿主前置段落', '第一句对话', '第二句对话（焦点）']);
  });

  it('iframe 位于父文档段落中间时，正确按 DOM 序截断', () => {
    document.body.innerHTML = `
      <div mesid="5c">
        <div class="mes_text">
          <p class="p-before">前置文章</p>
        </div>
      </div>
    `;
    const mesText = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mesText.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = `
      <div class="bubble bubble-inner">iframe 气泡</div>
    `;
    const pAfter = document.createElement('p');
    pAfter.className = 'p-after';
    pAfter.textContent = '后置文章';
    mesText.appendChild(pAfter);

    const inner = iframe.contentDocument!.querySelector<HTMLElement>('.bubble-inner')!;

    expect(extractMessageParagraphsUntil(inner)).toEqual(['前置文章', 'iframe 气泡']);
    expect(extractMessageParagraphsUntil(pAfter)).toEqual(['前置文章', 'iframe 气泡', '后置文章']);
  });

  it('清理历史中的完整 HTML 文档源码并保留源码外文本', () => {
    const history = '用户消息\n\n前置说明\n\n<!DOCTYPE html><html><style>.bubble{color:red}</style><body>源码</body></html>\n\n可见气泡';
    expect(stripFrontendSourceMarkup(history)).toBe('用户消息\n\n前置说明\n\n可见气泡');
  });

  it('清理历史中的独立 title 元数据', () => {
    expect(stripFrontendSourceMarkup('前置文本\n<title>微信聊天界面</title>\n气泡正文'))
      .toBe('前置文本\n\n气泡正文');
  });

  it('getFocusedChatParagraphs 收集父文档与同源 iframe 内部的选中元素', () => {
    document.body.innerHTML = `
      <div mesid="6">
        <div class="mes_text">
          <p class="outer-p">外部段落</p>
        </div>
      </div>
    `;
    const outerP = document.querySelector<HTMLElement>('.outer-p')!;
    outerP.classList.add('cv-inline-selected');

    const mesText = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mesText.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = `
      <main>
        <div class="message-row"><div class="bubble">iframe 气泡</div></div>
      </main>
    `;
    const innerBubble = iframe.contentDocument!.querySelector<HTMLElement>('.bubble')!;
    innerBubble.classList.add('cv-inline-selected');

    const focused = getFocusedChatParagraphs();
    expect(focused).toContain(outerP);
    expect(focused).toContain(innerBubble);
    expect(focused).toHaveLength(2);
  });
});
