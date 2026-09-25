import { describe, expect, it } from 'vitest';
import {
  beginImageGeneration,
  endImageGeneration,
  hasRunningImageGeneration,
} from '@/store/image-generation-activity';

describe('image-generation-activity', () => {
  // 模块级计数，用例按顺序串行执行
  it('并发生图计数累加，全部结束才归零', () => {
    beginImageGeneration();
    beginImageGeneration();
    expect(hasRunningImageGeneration.value).toBe(true);

    endImageGeneration();
    expect(hasRunningImageGeneration.value).toBe(true);

    endImageGeneration();
    expect(hasRunningImageGeneration.value).toBe(false);
  });
});
