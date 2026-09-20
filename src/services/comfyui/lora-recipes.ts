import { normalizeLoraManagerName } from '@/services/comfyui/lora-adapter';
import {
  isRecord,
  readLoraManagerErrorMessage,
  readTrimmedString,
  requestLoraManagerPayload,
} from '@/services/comfyui/lora-manager-client';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';
import { triggerBrowserDownload } from '@/services/browser-download';
import type { ComfyUILoraPreset } from '@/constants/comfyui';

/**
 * ComfyUI-Lora-Manager 配方（recipe）列表接口
 * 与触发词/预览图接口同源同端口，挂在 ComfyUI 自身的 aiohttp 服务上。
 * 配方是「一组 LoRA + 各自权重」的预设组合（另含提示词与采样参数，本模块只取 LoRA 组合）。
 */
const LORA_MANAGER_RECIPES_PATH = '/api/lm/recipes';

/** 接口 404 时的提示（未装 / 未启用 ComfyUI-Lora-Manager） */
const LORA_MANAGER_MISSING_MESSAGE =
  'ComfyUI 未提供 LoRA Manager 配方接口（404），请确认已安装并启用 ComfyUI-Lora-Manager';

/** 单页拉取的配方条数 */
export const COMFYUI_RECIPE_PAGE_SIZE = 40;

/** 配方组名最大长度（超出截断，避免预设选择器被超长标题撑开） */
const RECIPE_PRESET_NAME_MAX_LENGTH = 40;

/** 导出文件的格式标识 */
export const LORA_RECIPE_FILE_FORMAT = 'cosmos-vision-lora-recipe';

/** 导出文件的格式版本 */
export const LORA_RECIPE_FILE_VERSION = 1;

/** 配方内的单个 LoRA 条目 */
export interface ComfyUILoraRecipeLora {
  /** LoRA Manager 记录的基名（无扩展名） */
  fileName: string;
  /** 库内相对路径，本地已收录时才有 */
  localPath: string | null;
  strength: number;
  /** 配方内被手动排除（导入时跳过） */
  excluded: boolean;
  /** LoRA Manager 判定该 LoRA 本地已存在 */
  inLibrary: boolean;
}

/** 配方列表条目 */
export interface ComfyUILoraRecipe {
  id: string;
  title: string;
  /** 底模名称（如 Anima/Illustrious），无记录时为空串 */
  baseModel: string;
  /** 配方所在文件夹（相对配方根目录），无则空串 */
  folder: string;
  /** 预览图完整地址，无预览图时为 null */
  previewUrl: string | null;
  loras: ComfyUILoraRecipeLora[];
}

/** 配方分页结果 */
export interface ComfyUILoraPage {
  items: ComfyUILoraRecipe[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 待写入预设组的 LoRA（id 由调用方生成） */
export interface ComfyUILoraRecipeImportEntry {
  name: string;
  strength: number;
  enabled: boolean;
}

/** 配方 LoRA 映射结果 */
export interface ComfyUILoraRecipeImportResult {
  /** 可直接写入预设组的 LoRA 列表 */
  entries: ComfyUILoraRecipeImportEntry[];
  /** 未在 ComfyUI LoRA 列表中找到的条目名（写入时禁用） */
  unmatched: string[];
}

/** 配方 LoRA 映射选项 */
export interface ComfyUILoraRecipeMapOptions {
  /** 保留 excluded 条目为禁用而非跳过（本插件导出文件回读时使用） */
  keepExcluded?: boolean;
}

/** LoRA 选项索引（配方条目的命中判定依据） */
export interface ComfyUILoraOptionIndex {
  /** 规范化完整路径 → 选项原值 */
  exact: Map<string, string>;
  /** 无扩展名基名（小写）→ 选项原值 */
  byBaseName: Map<string, string>;
}

/** 导出文件的 loras 条目（字段名与 Lora Manager 配方 sidecar 一致） */
export interface LoraRecipeFileLora {
  file_name: string;
  strength: number;
  exclude: boolean;
}

/** 导出文件顶层结构 */
export interface LoraRecipeFilePayload {
  format: typeof LORA_RECIPE_FILE_FORMAT;
  version: number;
  title: string;
  base_model: string;
  loras: LoraRecipeFileLora[];
}

/** 导入文件解析结果 */
export interface LoraRecipeFileContent {
  title: string;
  loras: ComfyUILoraRecipeLora[];
}

/**
 * 读取 LoRA Manager 配方列表的指定页
 * 不带 search/sort_by：本插件只做批量化导入，不需要检索与排序。
 * @param comfyuiUrl ComfyUI 地址
 * @param page 页码（从 1 开始）
 * @param pageSize 单页条数
 * @returns 规范化后的配方分页结果
 */
export async function fetchComfyUILoraRecipesPage(
  comfyuiUrl: string,
  page = 1,
  pageSize = COMFYUI_RECIPE_PAGE_SIZE,
): Promise<ComfyUILoraPage> {
  const baseUrl = normalizeComfyUIUrl(comfyuiUrl);
  const currentPage = readIntAtLeast(page, 1, 1);
  const size = readIntAtLeast(pageSize, COMFYUI_RECIPE_PAGE_SIZE, 1);
  const params = new URLSearchParams({ page: String(currentPage), page_size: String(size) });
  const payload = await requestLoraManagerPayload(baseUrl, {
    path: LORA_MANAGER_RECIPES_PATH,
    featureLabel: '配方接口',
    notFoundMessage: LORA_MANAGER_MISSING_MESSAGE,
    unavailableMessage: 'LoRA Manager 未能返回配方列表',
    query: `?${params.toString()}`,
    // LoRA Manager 失败时返回 {error} 正文，直接透出比状态码更有信息量
    handleHttpError: async response => {
      throw new Error(
        (await readLoraManagerErrorMessage(response)) ?? `LoRA Manager 配方接口请求失败 (${response.status})`,
      );
    },
  });
  return parseLoraManagerRecipePage(payload, baseUrl, currentPage, size);
}

/**
 * 循环翻页拉取全部配方
 * 拉满 total_pages 或某一页返回空列表即结束。
 * @param comfyuiUrl ComfyUI 地址
 * @returns 全部配方（按接口返回顺序）
 */
export async function fetchAllComfyUILoraRecipes(comfyuiUrl: string): Promise<ComfyUILoraRecipe[]> {
  const recipes: ComfyUILoraRecipe[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchComfyUILoraRecipesPage(comfyuiUrl, page);
    recipes.push(...result.items);
    if (!result.items.length || page >= result.totalPages) return recipes;
  }
}

/**
 * 解析配方接口返回的分页结构
 * @param payload 原始响应
 * @param baseUrl 已规范化的 ComfyUI 地址（用于拼预览图）
 * @param fallbackPage 请求页码（响应未回显时使用）
 * @param fallbackPageSize 请求单页条数（响应未回显时使用）
 * @returns 配方分页结果
 */
export function parseLoraManagerRecipePage(
  payload: unknown,
  baseUrl: string,
  fallbackPage: number,
  fallbackPageSize: number,
): ComfyUILoraPage {
  const record = isRecord(payload) ? payload : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems
    .map(item => readRecipeEntry(item, baseUrl))
    .filter((item): item is ComfyUILoraRecipe => Boolean(item));

  const page = readIntAtLeast(record.page, fallbackPage, 1);
  const pageSize = readIntAtLeast(record.page_size, fallbackPageSize, 1);
  const total = readIntAtLeast(record.total, items.length, 0);
  const totalPages = readIntAtLeast(record.total_pages, Math.ceil(total / pageSize), 0);
  return { items, total, page, pageSize, totalPages };
}

/**
 * 解析配方预览图地址
 * @param baseUrl 已规范化的 ComfyUI 基础地址
 * @param fileUrl 接口返回的 file_url（同源相对路径或绝对地址）
 * @returns 可直接用于 <img src> 的地址；无预览图时为 null
 */
export function resolveRecipePreviewUrl(baseUrl: string, fileUrl: unknown): string | null {
  const path = readTrimmedString(fileUrl);
  // LoRA Manager 用 no-preview.png 占位表示该配方没有预览图
  if (!path || path.includes('no-preview')) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 建立 LoRA 选项索引，供配方条目命中判定复用（避免逐行重建）
 * @param loraOptions ComfyUI LoRA 选项（/models/loras 返回的路径）
 * @returns 可用于映射与计数的索引
 */
export function createLoraOptionIndex(loraOptions: readonly string[]): ComfyUILoraOptionIndex {
  const exact = new Map<string, string>();
  const byBaseName = new Map<string, string>();
  for (const option of loraOptions) {
    const trimmed = option.trim();
    if (!trimmed) continue;
    const pathKey = normalizePathKey(trimmed);
    if (!exact.has(pathKey)) exact.set(pathKey, trimmed);
    const baseName = normalizeLoraManagerName(trimmed).toLowerCase();
    if (baseName && !byBaseName.has(baseName)) byBaseName.set(baseName, trimmed);
  }
  return { exact, byBaseName };
}

/**
 * 在 LoRA 选项中查找配方条目对应的选项值
 * 优先整路径精确匹配，退化为无扩展名基名匹配（与 LoRA 节点自身的解析口径一致）
 * @param lora 配方条目
 * @param index LoRA 选项索引
 * @returns 命中的选项原值；未命中为 null
 */
export function resolveRecipeLoraName(lora: ComfyUILoraRecipeLora, index: ComfyUILoraOptionIndex): string | null {
  if (lora.localPath) {
    const matched = index.exact.get(normalizePathKey(lora.localPath));
    if (matched) return matched;
  }
  // fileName 也可能带子目录，统一按无扩展名基名比较（与 LoRA 节点自身的解析口径一致）
  const baseName = normalizeLoraManagerName(lora.fileName || lora.localPath || '').toLowerCase();
  return baseName ? (index.byBaseName.get(baseName) ?? null) : null;
}

/**
 * 统计配方中可在本地命中的 LoRA 数量（含已排除条目的剔除）
 * @param loras 配方内 LoRA 列表
 * @param index LoRA 选项索引
 * @returns 命中数量
 */
export function countImportedRecipeLoras(
  loras: readonly ComfyUILoraRecipeLora[],
  index: ComfyUILoraOptionIndex,
): number {
  return loras.reduce((count, lora) => count + Number(!lora.excluded && Boolean(resolveRecipeLoraName(lora, index))), 0);
}

/**
 * 把配方内的 LoRA 映射为可写入预设组的条目
 * 未命中的条目按原样保留但禁用：LoRA 节点在缺文件时会直接报错中断生图
 * excluded 默认跳过（LoRA Manager 语义：从配方移除）；keepExcluded 时保留为禁用条目
 * @param loras 配方内 LoRA 列表
 * @param index LoRA 选项索引
 * @param options 映射选项
 * @returns 映射结果（含未命中明细）
 */
export function mapRecipeLorasToSettings(
  loras: readonly ComfyUILoraRecipeLora[],
  index: ComfyUILoraOptionIndex,
  options?: ComfyUILoraRecipeMapOptions,
): ComfyUILoraRecipeImportResult {
  const keepExcluded = options?.keepExcluded === true;
  const entries: ComfyUILoraRecipeImportEntry[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const lora of loras) {
    if (lora.excluded && !keepExcluded) continue;
    const matched = resolveRecipeLoraName(lora, index);
    const name = matched ?? lora.localPath?.trim() ?? lora.fileName;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // 有意禁用的条目不视为缺失，不进 unmatched
    if (!matched && !lora.excluded) unmatched.push(name);
    entries.push({ name, strength: clampLoraStrength(lora.strength), enabled: !lora.excluded && Boolean(matched) });
  }

  return { entries, unmatched };
}

/**
 * 由配方标题生成预设组名（截断并按需追加序号避免重名）
 * @param title 配方标题
 * @param baseModel 配方底模名称（标题为空时兜底）
 * @param existingNames 已有预设组名称
 * @returns 可用的预设组名
 */
export function buildRecipePresetName(
  title: string,
  baseModel: string,
  existingNames: readonly string[],
): string {
  const base = truncateRecipeTitle(title) || (baseModel.trim() ? `${baseModel.trim()} 配方` : '未命名配方');
  const taken = new Set(existingNames.map(name => name.trim().toLowerCase()).filter(Boolean));
  if (!taken.has(base.toLowerCase())) return base;

  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${index})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * 把 LoRA 预设组转换为导出文件内容
 * @param preset LoRA 预设组
 * @returns 对齐 Lora Manager sidecar 字段的导出文件
 */
export function buildLoraRecipeFilePayload(preset: ComfyUILoraPreset): LoraRecipeFilePayload {
  return {
    format: LORA_RECIPE_FILE_FORMAT,
    version: LORA_RECIPE_FILE_VERSION,
    title: preset.name,
    base_model: '',
    loras: preset.loras.map(lora => ({
      file_name: lora.name,
      strength: lora.strength,
      exclude: !lora.enabled,
    })),
  };
}

/**
 * 解析本插件导出的 LoRA 预设文件
 * @param value 已解析的 JSON 值
 * @returns 文件标题与 LoRA 条目（未映射到本机 LoRA 列表）
 */
export function parseLoraRecipeFilePayload(value: unknown): LoraRecipeFileContent {
  if (!isRecord(value) || value.format !== LORA_RECIPE_FILE_FORMAT) {
    throw new Error('不是本插件导出的 LoRA 预设文件');
  }

  const version = readIntAtLeast(value.version, 0, 1);
  if (version > LORA_RECIPE_FILE_VERSION || version < 1) {
    throw new Error(`LoRA 预设文件版本不受支持（${version || '未知'}）`);
  }
  if (!Array.isArray(value.loras)) throw new Error('LoRA 预设文件缺少 LoRA 列表');

  const loras = value.loras
    .map(readFileLora)
    .filter((lora): lora is ComfyUILoraRecipeLora => Boolean(lora));
  return { title: readTrimmedString(value.title) ?? '', loras };
}

/**
 * 构建导出文件名
 * @param preset LoRA 预设组
 * @returns 形如 cosmos-vision-lora-名称-2026-09-20.json 的文件名
 */
export function buildLoraRecipeFileName(preset: ComfyUILoraPreset): string {
  const date = new Date().toISOString().slice(0, 10);
  return `cosmos-vision-lora-${normalizeFileNamePart(preset.name)}-${date}.json`;
}

/**
 * 下载 LoRA 预设组为 JSON 文件
 * @param preset LoRA 预设组
 */
export function downloadLoraRecipeFile(preset: ComfyUILoraPreset): void {
  const json = JSON.stringify(buildLoraRecipeFilePayload(preset), null, 2);
  triggerBrowserDownload(new Blob([json], { type: 'application/json' }), buildLoraRecipeFileName(preset));
}

/**
 * 读取导出文件内的单个 LoRA 条目
 * @param value 原始条目
 * @returns LoRA 条目或 null（无文件名时跳过）
 */
function readFileLora(value: unknown): ComfyUILoraRecipeLora | null {
  if (!isRecord(value)) return null;
  const fileName = readTrimmedString(value.file_name);
  if (!fileName) return null;
  return {
    fileName,
    localPath: null,
    strength: clampLoraStrength(readFiniteNumber(value.strength, 1)),
    excluded: value.exclude === true,
    inLibrary: false,
  };
}

/**
 * 截断配方标题作为组名
 * @param title 配方标题
 * @returns 截断后的名称（已去空白）
 */
function truncateRecipeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= RECIPE_PRESET_NAME_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, RECIPE_PRESET_NAME_MAX_LENGTH - 1)}…`;
}

/**
 * 解析单个配方条目
 * @param value 原始条目
 * @param baseUrl 已规范化的 ComfyUI 地址
 * @returns 配方条目或 null（缺 id 时丢弃）
 */
function readRecipeEntry(value: unknown, baseUrl: string): ComfyUILoraRecipe | null {
  if (!isRecord(value)) return null;
  const id = readTrimmedString(value.id);
  if (!id) return null;

  const rawLoras = Array.isArray(value.loras) ? value.loras : [];
  return {
    id,
    title: readTrimmedString(value.title) ?? '',
    baseModel: readTrimmedString(value.base_model) ?? '',
    folder: readTrimmedString(value.folder) ?? '',
    previewUrl: resolveRecipePreviewUrl(baseUrl, value.file_url),
    loras: rawLoras.map(readRecipeLora).filter((lora): lora is ComfyUILoraRecipeLora => Boolean(lora)),
  };
}

/**
 * 解析配方内的单个 LoRA 条目
 * @param value 原始条目
 * @returns LoRA 条目或 null（无名无路径时丢弃）
 */
function readRecipeLora(value: unknown): ComfyUILoraRecipeLora | null {
  if (!isRecord(value)) return null;
  const fileName = readTrimmedString(value.file_name) ?? '';
  const localPath = readTrimmedString(value.localPath);
  if (!fileName && !localPath) return null;
  return {
    fileName,
    localPath,
    strength: readFiniteNumber(value.strength, 1),
    excluded: value.exclude === true,
    inLibrary: value.inLibrary === true,
  };
}

/**
 * 规范化路径用于比较（统一分隔符与大小写，去空白）
 * @param value 路径文本
 * @returns 比较用键
 */
function normalizePathKey(value: string): string {
  return value.trim().replaceAll('\\', '/').toLowerCase();
}

/**
 * 把 LoRA 强度收敛到插件支持的区间
 * @param value 原始强度
 * @returns 合法强度
 */
function clampLoraStrength(value: number): number {
  return Math.min(5, Math.max(-5, value));
}

/**
 * 读取不小于下界的整数
 * @param value 原始值
 * @param fallback 兜底值
 * @param min 允许的最小值
 * @returns 合法整数
 */
function readIntAtLeast(value: unknown, fallback: number, min: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.trunc(parsed);
}

/**
 * 读取有限数值
 * @param value 原始值
 * @param fallback 兜底值
 * @returns 有限数值
 */
function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 规范化文件名片段（替换非法字符、折叠空白、截断长度）
 * @param value 原始名称
 * @returns 可用于文件名的片段
 */
export function normalizeFileNamePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'preset'
  );
}
