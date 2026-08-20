import { describe, expect, it } from 'vitest';
import {
  extractMessageParagraphs,
  extractMessageParagraphsUntil,
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
});
