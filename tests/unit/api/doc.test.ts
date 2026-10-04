import { describe, expect, it } from 'vitest';
import { API_DOC_MARKDOWN } from '@/api/doc';

describe('api/doc', () => {
  it('API_DOC_MARKDOWN 常量存在且为非空字符串', () => {
    expect(typeof API_DOC_MARKDOWN).toBe('string');
    expect(API_DOC_MARKDOWN.length).toBeGreaterThan(100);
  });

  it('包含关键接口与事件锚点', () => {
    expect(API_DOC_MARKDOWN).toContain('cosmos-vision:api-ready');
    expect(API_DOC_MARKDOWN).toContain('requestPrompt');
    expect(API_DOC_MARKDOWN).toContain('generateImage');
    expect(API_DOC_MARKDOWN).toContain('window.CosmosVision');
  });

  it('包含关键字段与代码块格式', () => {
    expect(API_DOC_MARKDOWN).toContain('focusParagraph');
    expect(API_DOC_MARKDOWN).toContain('characterPrompts');
    expect(API_DOC_MARKDOWN).toContain('```js');
  });

  it('包含完整的 TypeScript 类型声明', () => {
    expect(API_DOC_MARKDOWN).toContain('interface CosmosVisionApi');
    expect(API_DOC_MARKDOWN).toContain('requestPrompt(options: CosmosVisionRequestPromptOptions)');
    expect(API_DOC_MARKDOWN).toContain('generateImage(options: CosmosVisionGenerateImageOptions)');
    expect(API_DOC_MARKDOWN).toContain('CosmosVisionStreamPreviewEvent');
    expect(API_DOC_MARKDOWN).toContain('declare global');
    expect(API_DOC_MARKDOWN).toContain('CosmosVision?: CosmosVisionApi');
  });
});
