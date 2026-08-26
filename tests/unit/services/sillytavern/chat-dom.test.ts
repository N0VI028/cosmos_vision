import { describe, expect, it } from 'vitest';
import {
  extractMessageParagraphs,
  extractMessageParagraphsUntil,
  getFocusedChatParagraphs,
  stripFrontendSourceMarkup,
} from '@/services/sillytavern/chat-dom';

describe('chat-dom 前端型楼层文本提取', () => {
  it('前端型楼层全量收集气泡文本，按换行扁平化', () => {
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

    expect(extractMessageParagraphs(bubble)).toEqual(['普通段落\n\n气泡文本']);
  });

  it('前端型楼层收集显式气泡与隐式气泡全部文本', () => {
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

    expect(extractMessageParagraphs(explicitBubble)).toEqual(['显式气泡\n\n隐式气泡']);
  });

  it('前端型楼层全量收集不按元素排除焦点，仍收整层', () => {
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

    // 前端型全量收集暂不支持按元素排除，整层文本均收入；兄弟气泡边界以双换行分隔
    expect(extractMessageParagraphs(focus, [focus])).toEqual(['焦点气泡\n\n同楼层气泡']);
    expect(extractMessageParagraphs(other, [focus, other])).toEqual(['焦点气泡\n\n同楼层气泡']);
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

    // 焦点气泡为其所在块的末尾，与前置块间以双换行分隔
    expect(extractMessageParagraphsUntil(focus)).toEqual(['前置内容\n\n焦点内容']);
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

    expect(extractMessageParagraphsUntil(focus)).toEqual(['正常文章上下文\n\niframe 气泡文本']);
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
    expect(extractMessageParagraphsUntil(b1)).toEqual(['宿主前置段落\n\n第一句对话']);

    // 选中第二句时，包含第一句与第二句，排除第三句；iframe 内兄弟气泡以双换行分隔
    expect(extractMessageParagraphsUntil(b2)).toEqual(['宿主前置段落\n\n第一句对话\n\n第二句对话（焦点）']);
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

    expect(extractMessageParagraphsUntil(inner)).toEqual(['前置文章\n\niframe 气泡']);
    // 后置段落与 iframe 内容紧邻，块边界以双换行分隔
    expect(extractMessageParagraphsUntil(pAfter)).toEqual(['前置文章\n\niframe 气泡\n\n后置文章']);
  });

  it('混合楼层：普通文本 + details 小剧场 + iframe 文本，全部命中不漏', () => {
    document.body.innerHTML = `
      <div mesid="7">
        <div class="mes_text">
          <p>这是普通开场白。</p>
          <details open>
            <summary>小剧场标题</summary>
            <ol>
              <li>第一句对白</li>
              <li>第二句<del>删除</del><strong>强调</strong>对白</li>
            </ol>
          </details>
        </div>
      </div>
    `;
    const mesText = document.querySelector<HTMLElement>('.mes_text')!;
    const iframe = document.createElement('iframe');
    mesText.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = '<span>iframe 内可见文本</span>';
    const iframeText = iframe.contentDocument!.querySelector<HTMLElement>('span')!;

    const result = extractMessageParagraphsUntil(iframeText)[0];
    expect(result).toContain('这是普通开场白。');
    expect(result).toContain('小剧场标题');
    expect(result).toContain('第一句对白');
    expect(result).toContain('删除');
    expect(result).toContain('强调');
    expect(result).toContain('iframe 内可见文本');
  });

  it('cv 插件按钮与楼层尾挂载容器被剔除', () => {
    document.body.innerHTML = `
      <div mesid="8">
        <div class="mes_text">
          <p>正文段落</p>
          <button class="image-tag-button">不应收集的按钮</button>
          <div class="cv-floor-tail">
            <div class="cv-floor-tail-slot">不应收集的挂载槽</div>
          </div>
          <div class="cv-inline-decoration">不应收集的装饰</div>
          <p>尾部正文</p>
        </div>
      </div>
    `;
    const focus = document.querySelector<HTMLElement>('.mes_text p:last-of-type')!;

    expect(extractMessageParagraphsUntil(focus)).toEqual(['正文段落\n\n尾部正文']);
  });

  it('纯 markdown 楼层走白名单分块，不回归', () => {
    document.body.innerHTML = `
      <div mesid="9">
        <div class="mes_text">
          <blockquote>引用块</blockquote>
          <p>第一段</p>
          <p>第二段</p>
        </div>
      </div>
    `;
    const last = document.querySelector<HTMLElement>('.mes_text p:last-of-type')!;

    // 纯 markdown 无 [style]/details/div[class]，走白名单分块路径
    expect(extractMessageParagraphsUntil(last)).toEqual(['引用块', '第一段', '第二段']);
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
