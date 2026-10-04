import { describe, expect, it } from 'vitest';
import { readGenerateRawOutcome } from '@/services/tavern-helper/prompt-llm';

describe('readGenerateRawOutcome', () => {
  it('纯字符串原样返回正文（旧版助手普通模型）', () => {
    const result = readGenerateRawOutcome('abc');
    expect(result).toEqual({ text: 'abc' });
  });

  it('String 子类实例（带 content getter，旧版助手推理模型）正确提取正文与推理', () => {
    class BoxedDetails extends String {
      get content(): string {
        return String.prototype.valueOf.call(this);
      }
    }
    const result = readGenerateRawOutcome(Object.assign(new BoxedDetails('正文'), { reasoning: '推理' }));
    expect(result).toEqual({ text: '正文', reasoning: '推理' });
  });

  it('详情对象提取 content 正文', () => {
    const result = readGenerateRawOutcome({ content: '正文' });
    expect(result).toEqual({ text: '正文' });
  });

  it('详情对象携带 reasoning 时一并提取', () => {
    const result = readGenerateRawOutcome({ content: '正文', reasoning: '推理' });
    expect(result).toEqual({ text: '正文', reasoning: '推理' });
  });

  it('详情对象无 reasoning 时不产生该字段', () => {
    const result = readGenerateRawOutcome({ content: '正文' });
    expect(result).toEqual({ text: '正文' });
    expect('reasoning' in result).toBe(false);
  });

  it('reasoning 非字符串时忽略', () => {
    const result = readGenerateRawOutcome({ content: '正文', reasoning: 123 });
    expect(result).toEqual({ text: '正文' });
  });

  it('缺少 content 或非对象返回时正文为空串', () => {
    expect(readGenerateRawOutcome({})).toEqual({ text: '' });
    expect(readGenerateRawOutcome(undefined)).toEqual({ text: '' });
  });
});
