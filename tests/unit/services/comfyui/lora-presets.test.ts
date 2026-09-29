import { describe, expect, it } from 'vitest';
import { formatLoraDisplayName, stripLoraTriggerWords } from '@/services/comfyui/lora-presets';

describe('stripLoraTriggerWords', () => {
  it('空词表原样返回', () => {
    expect(stripLoraTriggerWords('masterpiece, 1girl', [])).toBe('masterpiece, 1girl');
    expect(stripLoraTriggerWords('masterpiece, 1girl', ['   '])).toBe('masterpiece, 1girl');
  });

  it('按逗号与换行拆分并精确匹配大小写剥离触发词', () => {
    const prompt = 'triggerA, masterpiece,\nTRIGGERB, 1girl, triggerC\nsolo';
    const stripped = stripLoraTriggerWords(prompt, ['triggera', 'triggerb']);
    expect(stripped).toBe('masterpiece, 1girl, triggerC, solo');
  });

  it('全匹配时返回空串', () => {
    expect(stripLoraTriggerWords('triggerA, triggerB', ['triggerA', 'triggerB'])).toBe('');
    expect(stripLoraTriggerWords('triggerA\ntriggerB', ['triggerA', 'triggerB'])).toBe('');
  });

  it('不存在触发词时保留原有标签并规范为逗号连接', () => {
    expect(stripLoraTriggerWords('masterpiece,\n1girl', ['otherTrigger'])).toBe('masterpiece, 1girl');
  });
});

describe('formatLoraDisplayName', () => {
  it('strips .safetensors extension, including uppercase .SAFETENSORS', () => {
    expect(formatLoraDisplayName('rella.safetensors')).toBe('rella');
    expect(formatLoraDisplayName('RELLA.SAFETENSORS')).toBe('RELLA');
    expect(formatLoraDisplayName('style.Ckpt')).toBe('style');
    expect(formatLoraDisplayName('character.GGUF')).toBe('character');
    expect(formatLoraDisplayName('anime.sft')).toBe('anime');
    expect(formatLoraDisplayName('weights.bin')).toBe('weights');
  });

  it('preserves unknown extensions', () => {
    expect(formatLoraDisplayName('my.model')).toBe('my.model');
    expect(formatLoraDisplayName('lora.custom_ext')).toBe('lora.custom_ext');
    expect(formatLoraDisplayName('test.png')).toBe('test.png');
  });

  it('handles subdirectories properly and preserves dot in directory when file has no extension', () => {
    expect(formatLoraDisplayName('subdir/model.safetensors')).toBe('subdir/model');
    expect(formatLoraDisplayName('nested/path/model.safetensors')).toBe('nested/path/model');
    expect(formatLoraDisplayName('my.dir/model')).toBe('my.dir/model');
  });

  it('handles names without extension, whitespace and empty strings', () => {
    expect(formatLoraDisplayName('model_without_ext')).toBe('model_without_ext');
    expect(formatLoraDisplayName('')).toBe('');
    expect(formatLoraDisplayName('   ')).toBe('');
  });

  it('handles multi-part names with multiple dots', () => {
    expect(formatLoraDisplayName('model.v2.pt')).toBe('model.v2');
    expect(formatLoraDisplayName('character.v1.0.safetensors')).toBe('character.v1.0');
    expect(formatLoraDisplayName('subdir.v1/model.v2.ckpt')).toBe('subdir.v1/model.v2');
  });
});
