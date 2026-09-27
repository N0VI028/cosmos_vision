import { describe, expect, it } from 'vitest';
import { buildResolutionJson, parseResolutionJson } from '@/services/comfyui/resolution-json';

describe('comfyui resolution-json', () => {
  it('解析 resolution_json 中的宽高', () => {
    expect(parseResolutionJson('{"version":1,"width":1024,"height":1536}')).toEqual({ width: 1024, height: 1536 });
  });

  it('非法输入返回 null', () => {
    expect(parseResolutionJson('not-json')).toBeNull();
    expect(parseResolutionJson('null')).toBeNull();
    expect(parseResolutionJson('{"width":"1024","height":1536}')).toBeNull();
  });

  it('重建 resolution_json 保留其余字段与键序', () => {
    expect(buildResolutionJson('{"version":1,"width":1024,"height":1536}', 832, 1216)).toBe(
      '{"version":1,"width":832,"height":1216}',
    );
  });

  it('原串非法时兜底重建', () => {
    expect(buildResolutionJson('not-json', 832, 1216)).toBe('{"version":1,"width":832,"height":1216}');
  });
});
