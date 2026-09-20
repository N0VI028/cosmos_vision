import { describe, expect, it } from 'vitest';
import { formatLoraDisplayName } from '@/services/comfyui/lora-presets';

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
