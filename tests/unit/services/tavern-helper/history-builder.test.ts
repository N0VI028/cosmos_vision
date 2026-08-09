import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRegexedHistory } from '@/services/tavern-helper/history-builder';
import { MINIMUM_TAVERN_HELPER_VERSION } from '@/services/tavern-helper/availability';

/**
 * 构造酒馆助手风格的消息对象
 */
function makeMessage(id: number, role: 'user' | 'assistant' | 'system', message: string, isHidden = false) {
  return { message_id: id, name: '', role, is_hidden: isHidden, message };
}

describe('tavern-helper history-builder', () => {
  // Mock TavernHelper 全局对象
  const mockGetChatMessages = vi.fn();
  const mockFormatAsTavernRegexedString = vi.fn();

  beforeEach(() => {
    // 重置 mock
    mockGetChatMessages.mockReset();
    mockFormatAsTavernRegexedString.mockReset();

    // 注入 TavernHelper mock（满足 availability 版本检测）
    (globalThis as any).TavernHelper = {
      getTavernHelperVersion: () => MINIMUM_TAVERN_HELPER_VERSION,
      getChatMessages: mockGetChatMessages,
      formatAsTavernRegexedString: mockFormatAsTavernRegexedString,
    };
  });

  describe('基本功能', () => {
    it('TavernHelper 不可用时返回错误结果', async () => {
      (globalThis as any).TavernHelper = undefined;

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 5,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TAVERN_HELPER_UNAVAILABLE');
      expect(result.text).toBe('');
      expect(result.messages).toEqual([]);
    });

    it('成功构建历史记录', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(0, 'user', 'Hello'), makeMessage(1, 'assistant', 'Hi there')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => `[regexed]${text}`);

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('[regexed]Hello\n[regexed]Hi there');
      expect(result.messages).toEqual([
        { messageId: 0, text: '[regexed]Hello' },
        { messageId: 1, text: '[regexed]Hi there' },
      ]);
      expect(result.stats.processed).toBe(2);
      expect(result.stats.totalRead).toBe(2);
    });
  });

  describe('消息筛选', () => {
    it('过滤隐藏消息', async () => {
      mockGetChatMessages.mockReturnValue([
        makeMessage(0, 'user', 'User msg'),
        makeMessage(1, 'assistant', 'Hidden msg', true),
        makeMessage(2, 'assistant', 'AI msg'),
      ]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 3,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.totalRead).toBe(3);
      expect(result.stats.filtered).toBe(1);
      expect(result.stats.processed).toBe(2);
      expect(result.text).toBe('User msg\nAI msg');
    });

    it('ignoreUserMessages=true 时过滤用户消息', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(0, 'user', 'User msg'), makeMessage(1, 'assistant', 'AI msg')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: true,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.totalRead).toBe(2);
      expect(result.stats.filtered).toBe(1);
      expect(result.stats.processed).toBe(1);
      expect(result.text).toBe('AI msg');
    });

    it('可见的 system（Narrator）消息保留并按 ai_output 处理', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(0, 'system', 'Narrator msg'), makeMessage(1, 'assistant', 'AI msg')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.processed).toBe(2);
      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(1, 'Narrator msg', 'ai_output', 'prompt', {
        depth: 2,
      });
    });
  });

  describe('正则处理', () => {
    it('正确映射 source 参数', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(0, 'user', 'User'), makeMessage(1, 'assistant', 'AI')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      // 验证第一次调用（user 消息）
      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(1, 'User', 'user_input', 'prompt', { depth: 2 });

      // 验证第二次调用（assistant 消息）
      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(2, 'AI', 'ai_output', 'prompt', { depth: 1 });
    });

    it('正确计算 depth（基于 currentMessageIndex，未传 depthBaseline）', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(5, 'user', 'Old'), makeMessage(8, 'user', 'Recent')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 10,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      // depth = currentMessageIndex - message_id（未传 depthBaseline 时默认取 currentMessageIndex）
      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(1, 'Old', 'user_input', 'prompt', {
        depth: 5, // 10 - 5
      });

      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(2, 'Recent', 'user_input', 'prompt', {
        depth: 2, // 10 - 8
      });
    });

    it('正确计算 depth（传入 depthBaseline）', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(5, 'user', 'Old'), makeMessage(8, 'user', 'Recent')]);

      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 10,
        depthBaseline: 20, // 完整聊天最后一条消息索引
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      // depth = depthBaseline - message_id（ST 语义：0 = 最后一条消息）
      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(1, 'Old', 'user_input', 'prompt', {
        depth: 15, // 20 - 5
      });

      expect(mockFormatAsTavernRegexedString).toHaveBeenNthCalledWith(2, 'Recent', 'user_input', 'prompt', {
        depth: 12, // 20 - 8
      });
    });

    it('正则处理失败时降级到原始消息', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(0, 'user', 'Normal'), makeMessage(1, 'user', 'Error')]);

      mockFormatAsTavernRegexedString
        .mockReturnValueOnce('[regexed]Normal')
        .mockImplementationOnce(() => {
          throw new Error('Regex failed');
        });

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      // 第二条消息降级到原始文本
      expect(result.success).toBe(true);
      expect(result.text).toBe('[regexed]Normal\nError');
      expect(result.stats.processed).toBe(2);
    });
  });

  describe('楼层数限制', () => {
    it('historyFloorCount 限制到 100', async () => {
      mockGetChatMessages.mockReturnValue([]);
      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      await buildRegexedHistory({
        historyFloorCount: 500, // 超过上限
        currentMessageIndex: 600,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      // 验证实际调用时 clamp 到 100
      expect(mockGetChatMessages).toHaveBeenCalledWith('500-600', { role: 'all', hide_state: 'all' });
    });

    it('historyFloorCount=0 时返回空字符串', async () => {
      mockGetChatMessages.mockReturnValue([makeMessage(10, 'user', 'Focus')]);
      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      const result = await buildRegexedHistory({
        historyFloorCount: 0,
        currentMessageIndex: 10,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
      expect(result.stats.processed).toBe(0);
    });

    it('rangeStart 不会小于 0', async () => {
      mockGetChatMessages.mockReturnValue([]);
      mockFormatAsTavernRegexedString.mockImplementation((text: string) => text);

      await buildRegexedHistory({
        historyFloorCount: 50,
        currentMessageIndex: 10, // 10 - 50 = -40，应该 clamp 到 0
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(mockGetChatMessages).toHaveBeenCalledWith('0-10', { role: 'all', hide_state: 'all' });
    });
  });

  describe('统计信息', () => {
    it('正确统计字符数', async () => {
      mockGetChatMessages.mockReturnValue([
        makeMessage(0, 'user', 'abc'), // 3 chars
        makeMessage(1, 'assistant', 'defgh'), // 5 chars
      ]);

      mockFormatAsTavernRegexedString.mockImplementation(
        (text: string) => `[${text}]`, // +2 chars
      );

      const result = await buildRegexedHistory({
        historyFloorCount: 10,
        currentMessageIndex: 2,
        ignoreUserMessages: false,
        reverseOrder: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.rawChars).toBe(8); // 3 + 5
      expect(result.stats.outputChars).toBe(12); // [abc] + [defgh] = 5 + 7
    });
  });
});
