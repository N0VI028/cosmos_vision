import { describe, expect, it } from 'vitest';
import { readPromptNodeErrors } from '@/services/comfyui/api';

describe('readPromptNodeErrors', () => {
  it('无 node_errors 或空表时返回 null（任务正常入队）', () => {
    expect(readPromptNodeErrors(undefined)).toBeNull();
    expect(readPromptNodeErrors({})).toBeNull();
  });

  it('汇总节点校验错误为可读消息（含输入名）', () => {
    const message = readPromptNodeErrors({
      '72': { errors: [{ type: 'bad_linked_input', message: 'Bad linked input', details: 'loras' }] },
      '243': { errors: [{ type: 'bad_linked_input', message: 'Bad linked input', details: 'loras' }] },
    });
    expect(message).toBe(
      'ComfyUI 校验失败，任务未入队：节点 72（输入 loras）: Bad linked input；节点 243（输入 loras）: Bad linked input',
    );
  });

  it('错误条目缺失 message 或 details 时降级为未知校验错误', () => {
    const message = readPromptNodeErrors({
      '9': { errors: [{ type: 'value_not_in_list' }] },
    });
    expect(message).toBe('ComfyUI 校验失败，任务未入队：节点 9: 未知校验错误');
  });

  it('errors 数组为空时同样降级为未知校验错误', () => {
    const message = readPromptNodeErrors({ '10': {} });
    expect(message).toBe('ComfyUI 校验失败，任务未入队：节点 10: 未知校验错误');
  });
});
