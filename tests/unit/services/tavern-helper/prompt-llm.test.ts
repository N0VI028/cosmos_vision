import { describe, expect, it } from 'vitest';
import {
  buildCustomApi,
  buildGenerateRawMessagesRequest,
  buildJsonSchema,
  extractOutputBlock,
  formatPromptLlmRawResult,
  getPromptLlmRequestError,
  parsePromptLlmOutput,
  readPromptLlmOutput,
} from '@/services/tavern-helper/prompt-llm';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';

describe('tavern-helper prompt-llm helper', () => {
  it('extracts output block from XML or code block', () => {
    expect(extractOutputBlock('Prefix <output> {"positive":"cat"} </output> Suffix')).toBe('{"positive":"cat"}');
    expect(extractOutputBlock('```json\n{"positive":"cat"}\n```')).toBe('{"positive":"cat"}');
  });

  it('formats raw result and parses output JSON', () => {
    const raw = { positive: 'masterpiece', negative: 'worst quality' };
    const formatted = formatPromptLlmRawResult(raw);
    const parsed = parsePromptLlmOutput(formatted, { positive: 'positive', negative: 'negative' });
    expect(parsed).toEqual({ positivePrompt: 'masterpiece', negativePrompt: 'worst quality' });
  });

  it('reads output using labeled fallback when JSON parsing fails', () => {
    const labeledText = 'positive: masterpiece, 1girl\nnegative: bad quality';
    const output = readPromptLlmOutput(labeledText);
    expect(output).toEqual({ positivePrompt: 'masterpiece, 1girl', negativePrompt: 'bad quality' });
  });

  it('validates prompt llm request settings and builds custom api & json schema', () => {
    const settings = {
      ...DEFAULT_SETTINGS.promptLlm,
      model: 'gpt-4o',
      apiUrl: 'http://localhost:8000/v1',
      apiKey: 'sk-test',
    };
    expect(getPromptLlmRequestError(settings)).toBeNull();

    const customApi = buildCustomApi(settings);
    expect(customApi.model).toBe(settings.model);

    const schema = buildJsonSchema();
    expect(schema.name).toBe('cosmos_vision_prompt_output');

    const req = buildGenerateRawMessagesRequest([{ role: 'user', content: 'test' }], customApi, schema);
    expect(req.ordered_prompts).toHaveLength(1);
  });
});
