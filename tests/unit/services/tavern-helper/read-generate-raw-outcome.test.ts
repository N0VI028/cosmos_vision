import { describe, expect, it } from 'vitest';
import { readGenerateRawOutcome } from '@/services/tavern-helper/prompt-llm';

describe('readGenerateRawOutcome', () => {
  it('纯字符串原样返回正文', () => {
    const result = readGenerateRawOutcome('abc');
    expect(result).toEqual({ text: 'abc' });
  });

  it('详情对象提取 content 正文', () => {
    const raw = { content: '正文' };
    const result = readGenerateRawOutcome(raw);
    expect(result).toEqual({ text: '正文' });
  });

  it('String 子类实例正确提取正文', () => {
    const raw = new String('正文');
    const result = readGenerateRawOutcome(raw);
    expect(result).toEqual({ text: '正文' });
  });

  it('缺少 content 的空对象正文为空串', () => {
    const result = readGenerateRawOutcome({});
    expect(result).toEqual({ text: '' });
  });
});
