import { describe, expect, it } from 'vitest';
import {
  isThinkingStreaming,
  splitThinkingContent,
} from '@/services/prompt-llm/thinking-stream-parser';

describe('splitThinkingContent', () => {
  it('无思考标签时全文作为正文', () => {
    const result = splitThinkingContent('1girl, solo, masterpiece');
    expect(result).toEqual({ thinking: '', content: '1girl, solo, masterpiece' });
  });

  it('闭合思考标签分离思考与正文', () => {
    const text = '先分析画面再输出标签\n<thinking>用户想要风景图</thinking>\nscenery, sunset';
    const result = splitThinkingContent(text);
    expect(result.thinking).toBe('用户想要风景图');
    expect(result.content).toContain('scenery, sunset');
    expect(result.content).toContain('先分析画面再输出标签');
    expect(result.content).not.toContain('风景图');
  });

  it('流式中未闭合的思考标签：其后全部文本视为思考', () => {
    const text = '<thinking>模型正在推理';
    const result = splitThinkingContent(text);
    expect(result.thinking).toBe('模型正在推理');
    expect(result.content).toBe('');
  });

  it('支持 think 与 reasoning 标签名', () => {
    expect(splitThinkingContent('<think>短标签</think>ok').thinking).toBe('短标签');
    expect(splitThinkingContent('<reasoning>推理标签</reasoning>ok').thinking).toBe('推理标签');
  });

  it('多个思考块依次分离并拼接', () => {
    const text = '<thinking>第一步</thinking>正文一<thinking>第二步</thinking>正文二';
    const result = splitThinkingContent(text);
    expect(result.thinking).toBe('第一步第二步');
    expect(result.content).toBe('正文一正文二');
  });

  it('大小写不敏感匹配标签', () => {
    const result = splitThinkingContent('<Thinking>大写标签</Thinking>content');
    expect(result.thinking).toBe('大写标签');
    expect(result.content).toBe('content');
  });
});

describe('isThinkingStreaming', () => {
  it('无思考标签返回 false', () => {
    expect(isThinkingStreaming('纯正文')).toBe(false);
  });

  it('未闭合思考标签返回 true', () => {
    expect(isThinkingStreaming('<thinking>推理中')).toBe(true);
  });

  it('已闭合思考标签返回 false', () => {
    expect(isThinkingStreaming('<thinking>完成</thinking>正文')).toBe(false);
  });

  it('先闭合后再开新思考块返回 true', () => {
    expect(isThinkingStreaming('<thinking>a</thinking>b<thinking>c')).toBe(true);
  });
});
