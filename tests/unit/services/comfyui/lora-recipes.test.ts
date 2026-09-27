import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComfyUILoraPreset } from '@/constants/comfyui';
import { createMockFetch } from '../../../helpers/fetch-mocks';
import {
  buildLoraRecipeFilePayload,
  buildLoraRecipeFileName,
  buildRecipePresetName,
  countImportedRecipeLoras,
  createLoraOptionIndex,
  downloadLoraRecipeFile,
  fetchAllComfyUILoraRecipes,
  fetchComfyUILoraRecipesPage,
  LORA_RECIPE_FILE_FORMAT,
  mapRecipeLorasToSettings,
  parseLoraManagerRecipePage,
  parseLoraRecipeFilePayload,
  resolveRecipePreviewUrl,
  type ComfyUILoraRecipeLora,
} from '@/services/comfyui/lora-recipes';

/** 构造配方内 LoRA 条目 */
function createRecipeLora(overrides: Partial<ComfyUILoraRecipeLora> = {}): ComfyUILoraRecipeLora {
  return {
    fileName: 'Turbo-ANIMA-v2.9',
    localPath: null,
    strength: 0.7,
    excluded: false,
    inLibrary: true,
    ...overrides,
  };
}

/** 构造 LoRA 预设组 */
function createPreset(name: string, loras: Array<{ name: string; strength: number; enabled: boolean }>) {
  return createComfyUILoraPreset(
    'preset-1',
    name,
    loras.map((lora, index) => ({ id: `lora-${index}`, ...lora })),
  );
}

describe('comfyui lora recipes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('fetchComfyUILoraRecipesPage', () => {
    it('请求指定页并带上分页参数', async () => {
      const fetchMock = createMockFetch(() => ({ json: { items: [], total: 0 } }));
      vi.stubGlobal('fetch', fetchMock);

      await fetchComfyUILoraRecipesPage('http://127.0.0.1:8188/', 2, 20);

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8188/api/lm/recipes?page=2&page_size=20');
    });

    it('未传页码时取第一页与默认单页条数', async () => {
      const fetchMock = createMockFetch(() => ({ json: { items: [] } }));
      vi.stubGlobal('fetch', fetchMock);

      await fetchComfyUILoraRecipesPage('http://127.0.0.1:8188');

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8188/api/lm/recipes?page=1&page_size=40');
    });

    it('404 时提示缺少 LoRA Manager', async () => {
      vi.stubGlobal('fetch', createMockFetch(() => ({ status: 404 })));

      await expect(fetchComfyUILoraRecipesPage('http://127.0.0.1:8188')).rejects.toThrow(/ComfyUI-Lora-Manager/);
    });

    it('失败时透出服务端 error 正文', async () => {
      vi.stubGlobal('fetch', createMockFetch(() => ({ status: 500, json: { error: 'Recipe scanner unavailable' } })));

      await expect(fetchComfyUILoraRecipesPage('http://127.0.0.1:8188')).rejects.toThrow('Recipe scanner unavailable');
    });

    it('地址为空时直接拒绝', async () => {
      await expect(fetchComfyUILoraRecipesPage('')).rejects.toThrow('请先填写 ComfyUI URL');
    });
  });

  describe('fetchAllComfyUILoraRecipes', () => {
    it('循环翻页聚合全部配方', async () => {
      const fetchMock = createMockFetch(url =>
        url.includes('page=1')
          ? { json: { items: [{ id: 'recipe-1' }, { id: 'recipe-2' }], total: 3, total_pages: 2 } }
          : { json: { items: [{ id: 'recipe-3' }], total: 3, total_pages: 2 } },
      );
      vi.stubGlobal('fetch', fetchMock);

      const recipes = await fetchAllComfyUILoraRecipes('http://127.0.0.1:8188');

      expect(recipes.map(recipe => recipe.id)).toEqual(['recipe-1', 'recipe-2', 'recipe-3']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('响应缺少 total_pages 时按条数兜底停止翻页', async () => {
      const fetchMock = createMockFetch(() => ({ json: { items: [{ id: 'recipe-1' }], total: 1 } }));
      vi.stubGlobal('fetch', fetchMock);

      const recipes = await fetchAllComfyUILoraRecipes('http://127.0.0.1:8188');

      expect(recipes.map(recipe => recipe.id)).toEqual(['recipe-1']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('单页即拉全时只请求一次', async () => {
      const fetchMock = createMockFetch(() => ({
        json: { items: [{ id: 'recipe-1' }, { id: 'recipe-2' }], total: 2, total_pages: 1 },
      }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchAllComfyUILoraRecipes('http://127.0.0.1:8188')).resolves.toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('空列表页终止翻页', async () => {
      const fetchMock = createMockFetch(url =>
        url.includes('page=1')
          ? { json: { items: [{ id: 'recipe-1' }], total_pages: 5 } }
          : { json: { items: [], total_pages: 5 } },
      );
      vi.stubGlobal('fetch', fetchMock);

      const recipes = await fetchAllComfyUILoraRecipes('http://127.0.0.1:8188');

      expect(recipes.map(recipe => recipe.id)).toEqual(['recipe-1']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseLoraManagerRecipePage', () => {
    it('读取条目、LoRA、底模与分页信息', () => {
      const page = parseLoraManagerRecipePage(
        {
          items: [
            {
              id: 'recipe-1',
              title: '女巫风格',
              base_model: 'Anima',
              folder: '风格/暗黑',
              file_url: '/loras_static/recipe/1.webp',
              loras: [
                {
                  file_name: 'Turbo-ANIMA-v2.9',
                  localPath: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors',
                  strength: 0.7,
                  exclude: false,
                  inLibrary: true,
                },
                { file_name: 'missing_lora', strength: 1, exclude: true },
              ],
            },
          ],
          total: 41,
          page: 2,
          page_size: 20,
          total_pages: 3,
        },
        'http://127.0.0.1:8188',
        1,
        40,
      );

      expect(page).toEqual({
        items: [
          {
            id: 'recipe-1',
            title: '女巫风格',
            baseModel: 'Anima',
            folder: '风格/暗黑',
            previewUrl: 'http://127.0.0.1:8188/loras_static/recipe/1.webp',
            loras: [
              {
                fileName: 'Turbo-ANIMA-v2.9',
                localPath: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors',
                strength: 0.7,
                excluded: false,
                inLibrary: true,
              },
              {
                fileName: 'missing_lora',
                localPath: null,
                strength: 1,
                excluded: true,
                inLibrary: false,
              },
            ],
          },
        ],
        total: 41,
        page: 2,
        pageSize: 20,
        totalPages: 3,
      });
    });

    it('丢弃无 id 的条目并容忍缺失字段', () => {
      const page = parseLoraManagerRecipePage(
        { items: [{ title: '无 id' }, { id: 'recipe-2' }, 'not-an-object'] },
        'http://127.0.0.1:8188',
        1,
        40,
      );

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ id: 'recipe-2', title: '', baseModel: '', folder: '', loras: [] });
      // 响应未回显分页字段时回退请求参数
      expect(page).toMatchObject({ page: 1, pageSize: 40, total: 1, totalPages: 1 });
    });

    it('结构非法时返回空页', () => {
      expect(parseLoraManagerRecipePage(null, 'http://127.0.0.1:8188', 3, 20)).toEqual({
        items: [],
        total: 0,
        page: 3,
        pageSize: 20,
        totalPages: 0,
      });
    });

    it('LoRA 条目缺字段时回退强度 1 与空 localPath', () => {
      const page = parseLoraManagerRecipePage(
        { items: [{ id: 'recipe-3', loras: [{ file_name: 'styled_lora' }, { strength: 1 }, 'bad'] }] },
        'http://127.0.0.1:8188',
        1,
        40,
      );

      expect(page.items[0]!.loras).toEqual([
        { fileName: 'styled_lora', localPath: null, strength: 1, excluded: false, inLibrary: false },
      ]);
    });
  });

  describe('resolveRecipePreviewUrl', () => {
    it('同源路径补前缀，绝对地址原样保留', () => {
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', '/loras_static/a.webp')).toBe(
        'http://127.0.0.1:8188/loras_static/a.webp',
      );
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', 'loras_static/a.webp')).toBe(
        'http://127.0.0.1:8188/loras_static/a.webp',
      );
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', 'https://cdn.test/a.webp')).toBe('https://cdn.test/a.webp');
    });

    it('占位图与缺失值返回 null', () => {
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', '/loras_static/images/no-preview.png')).toBeNull();
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', '')).toBeNull();
      expect(resolveRecipePreviewUrl('http://127.0.0.1:8188', null)).toBeNull();
    });
  });

  describe('mapRecipeLorasToSettings', () => {
    const options = [
      'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors',
      'Anima2d画风/atomsphere_style_v1.2-anima-e20.sft',
      'other/Character.safetensors',
    ];

    it('整路径命中并保留选项原值', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({
            fileName: 'Turbo-ANIMA-v2.9',
            localPath: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors',
            strength: 0.75,
          }),
        ],
        index,
      );

      expect(result).toEqual({
        entries: [{ name: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors', strength: 0.75, enabled: true }],
        unmatched: [],
      });
    });

    it('退化为无扩展名基名匹配并忽略分隔符与大小写差异', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({
            fileName: 'ATOMSPHERE_STYLE_v1.2-anima-e20',
            localPath: 'Anima2d画风\\atomsphere_style_v1.2-anima-e20.sft',
          }),
        ],
        index,
      );

      expect(result.entries[0]).toMatchObject({
        name: 'Anima2d画风/atomsphere_style_v1.2-anima-e20.sft',
        enabled: true,
      });
      expect(result.unmatched).toEqual([]);
    });

    it('跳过已排除条目并对重复项去重', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({ fileName: 'Character', localPath: null }),
          createRecipeLora({ fileName: 'other/Character' }),
          createRecipeLora({ fileName: 'Character', excluded: true }),
        ],
        index,
      );

      expect(result.entries).toEqual([{ name: 'other/Character.safetensors', strength: 0.7, enabled: true }]);
    });

    it('keepExcluded 时保留已排除条目并固定禁用（含本地命中）', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({ fileName: 'Turbo-ANIMA-v2.9', localPath: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors' }),
          createRecipeLora({ fileName: 'Character', localPath: 'other/Character.safetensors', excluded: true }),
        ],
        index,
        { keepExcluded: true },
      );

      expect(result.entries).toEqual([
        { name: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors', strength: 0.7, enabled: true },
        // 本地命中但导出时被禁用，回读后仍保持禁用
        { name: 'other/Character.safetensors', strength: 0.7, enabled: false },
      ]);
    });

    it('keepExcluded 时已排除条目不计入 unmatched', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({ fileName: 'not_installed', excluded: true }),
          createRecipeLora({ fileName: 'also_missing', localPath: 'Anima/未安装/also_missing.safetensors', excluded: true }),
        ],
        index,
        { keepExcluded: true },
      );

      expect(result.entries).toEqual([
        { name: 'not_installed', strength: 0.7, enabled: false },
        { name: 'Anima/未安装/also_missing.safetensors', strength: 0.7, enabled: false },
      ]);
      expect(result.unmatched).toEqual([]);
    });

    it('未命中的 LoRA 保留但禁用，避免缺文件中断生图', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [createRecipeLora({ fileName: 'not_installed', localPath: 'Anima/未安装/not_installed.safetensors' })],
        index,
      );

      expect(result.entries).toEqual([
        { name: 'Anima/未安装/not_installed.safetensors', strength: 0.7, enabled: false },
      ]);
      expect(result.unmatched).toEqual(['Anima/未安装/not_installed.safetensors']);
    });

    it('强度超出区间时收敛到插件范围', () => {
      const index = createLoraOptionIndex(options);
      const result = mapRecipeLorasToSettings(
        [
          createRecipeLora({ fileName: 'Turbo-ANIMA-v2.9', strength: 9 }),
          createRecipeLora({ fileName: 'Character', strength: -9 }),
        ],
        index,
      );

      expect(result.entries.map(entry => entry.strength)).toEqual([5, -5]);
    });
  });

  describe('countImportedRecipeLoras', () => {
    it('只统计本地已存在且未被排除的 LoRA', () => {
      const index = createLoraOptionIndex(['a/Styled.safetensors']);

      expect(
        countImportedRecipeLoras(
          [
            createRecipeLora({ fileName: 'Styled' }),
            createRecipeLora({ fileName: 'missing' }),
            createRecipeLora({ fileName: 'Styled', excluded: true }),
          ],
          index,
        ),
      ).toBe(1);
    });
  });

  describe('buildRecipePresetName', () => {
    it('截断超长标题并保留短标题', () => {
      expect(buildRecipePresetName('女巫风格', 'Anima', [])).toBe('女巫风格');
      const long = buildRecipePresetName('a'.repeat(60), '', []);
      expect(long).toHaveLength(40);
      expect(long.endsWith('…')).toBe(true);
    });

    it('标题为空时回退到底模名', () => {
      expect(buildRecipePresetName('   ', 'Anima', [])).toBe('Anima 配方');
      expect(buildRecipePresetName('', '', [])).toBe('未命名配方');
    });

    it('重名时追加序号', () => {
      expect(buildRecipePresetName('女巫风格', '', ['女巫风格'])).toBe('女巫风格 (2)');
      expect(buildRecipePresetName('女巫风格', '', ['女巫风格', '女巫风格 (2)'])).toBe('女巫风格 (3)');
      expect(buildRecipePresetName('女巫风格', '', ['  '])).toBe('女巫风格');
    });
  });

  describe('buildLoraRecipeFilePayload', () => {
    it('映射字段并取反 enabled 为 exclude', () => {
      const preset = createPreset('女巫风格', [
        { name: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors', strength: 0.75, enabled: true },
        { name: 'missing_lora', strength: -1.5, enabled: false },
      ]);

      expect(buildLoraRecipeFilePayload(preset)).toEqual({
        format: LORA_RECIPE_FILE_FORMAT,
        version: 1,
        title: '女巫风格',
        base_model: '',
        loras: [
          { file_name: 'Anima/细节与加速/Turbo-ANIMA-v2.9.safetensors', strength: 0.75, exclude: false },
          { file_name: 'missing_lora', strength: -1.5, exclude: true },
        ],
      });
    });

    it('无 LoRA 时导出空列表', () => {
      expect(buildLoraRecipeFilePayload(createPreset('空预设', [])).loras).toEqual([]);
    });
  });

  describe('parseLoraRecipeFilePayload', () => {
    it('导出后可原样解析回标题与 LoRA', () => {
      const preset = createPreset('女巫风格', [
        { name: 'a/Turbo.safetensors', strength: 0.75, enabled: true },
        { name: 'b/Disabled.safetensors', strength: 1.2, enabled: false },
      ]);

      expect(parseLoraRecipeFilePayload(buildLoraRecipeFilePayload(preset))).toEqual({
        title: '女巫风格',
        loras: [
          { fileName: 'a/Turbo.safetensors', localPath: null, strength: 0.75, excluded: false, inLibrary: false },
          { fileName: 'b/Disabled.safetensors', localPath: null, strength: 1.2, excluded: true, inLibrary: false },
        ],
      });
    });

    it('拒绝非本插件的文件', () => {
      expect(() => parseLoraRecipeFilePayload(null)).toThrow('不是本插件导出的 LoRA 预设文件');
      expect(() => parseLoraRecipeFilePayload({ format: 'other', version: 1, loras: [] })).toThrow(
        '不是本插件导出的 LoRA 预设文件',
      );
    });

    it('拒绝超前的版本号', () => {
      expect(() => parseLoraRecipeFilePayload({ format: LORA_RECIPE_FILE_FORMAT, version: 2, loras: [] })).toThrow(
        /版本不受支持/,
      );
      expect(() => parseLoraRecipeFilePayload({ format: LORA_RECIPE_FILE_FORMAT, version: 0, loras: [] })).toThrow(
        /版本不受支持/,
      );
    });

    it('拒绝 loras 非数组', () => {
      expect(() =>
        parseLoraRecipeFilePayload({ format: LORA_RECIPE_FILE_FORMAT, version: 1, loras: {} }),
      ).toThrow('LoRA 预设文件缺少 LoRA 列表');
    });

    it('允许空 loras 列表', () => {
      expect(parseLoraRecipeFilePayload({ format: LORA_RECIPE_FILE_FORMAT, version: 1, loras: [] })).toEqual({
        title: '',
        loras: [],
      });
    });

    it('跳过没有 file_name 的条目', () => {
      const parsed = parseLoraRecipeFilePayload({
        format: LORA_RECIPE_FILE_FORMAT,
        version: 1,
        loras: [{ strength: 1 }, { file_name: '  ' }, 'bad', { file_name: 'kept' }],
      });

      expect(parsed.loras.map(lora => lora.fileName)).toEqual(['kept']);
    });

    it('强度缺省为 1 且超出区间时收敛', () => {
      const parsed = parseLoraRecipeFilePayload({
        format: LORA_RECIPE_FILE_FORMAT,
        version: 1,
        loras: [{ file_name: 'default' }, { file_name: 'high', strength: 9 }, { file_name: 'low', strength: -9 }],
      });

      expect(parsed.loras.map(lora => lora.strength)).toEqual([1, 5, -5]);
    });
  });

  describe('downloadLoraRecipeFile', () => {
    it('文件名带规范化名称与日期', () => {
      expect(buildLoraRecipeFileName(createPreset('女 巫/风格', []))).toMatch(
        /^cosmos-vision-lora-女-巫-风格-\d{4}-\d{2}-\d{2}\.json$/,
      );
      expect(buildLoraRecipeFileName(createPreset('   ', []))).toMatch(/^cosmos-vision-lora-preset-/);
    });

    it('生成 JSON blob 并触发浏览器下载', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-recipe');
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      const preset = createPreset('女巫风格', [{ name: 'a/Turbo.safetensors', strength: 0.5, enabled: true }]);

      downloadLoraRecipeFile(preset);

      const blob = createObjectURL.mock.calls[0]![0];
      expect(blob.type).toBe('application/json');
      expect(JSON.parse(await blob.text())).toMatchObject({ format: LORA_RECIPE_FILE_FORMAT, title: '女巫风格' });
      expect(click).toHaveBeenCalledTimes(1);
    });
  });
});
