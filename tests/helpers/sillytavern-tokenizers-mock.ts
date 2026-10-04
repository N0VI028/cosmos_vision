/**
 * 测试环境模拟 @sillytavern/scripts/tokenizers
 * 简单按字符串长度模拟 token 计数
 */
export const getTokenCountAsync = async (str: unknown, _padding?: number): Promise<number> =>
  typeof str === 'string' ? str.length : 0;
