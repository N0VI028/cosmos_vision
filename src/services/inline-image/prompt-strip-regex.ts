import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';
import { SLOT_SHORTCODE_SOURCE } from '@/services/inline-image/slot-shortcode';

const REGEX_SCRIPT_NAME = '⟦勿动⟧CosmosVision: 不发送短码';
const REGEX_ID = 'cosmos-vision-inline-slot-shortcode-prompt-strip';

type TavernRegexLike = {
  id: string;
  script_name: string;
  enabled: boolean;
  find_regex: string;
  replace_string: string;
  trim_strings: string[];
  source: {
    user_input: boolean;
    ai_output: boolean;
    slash_command: boolean;
    world_info: boolean;
  };
  destination: {
    display: boolean;
    prompt: boolean;
  };
  run_on_edit: boolean;
  min_depth: number | null;
  max_depth: number | null;
};

type RegexHelper = {
  getTavernRegexes: (option: { type: 'global' }) => TavernRegexLike[];
  updateTavernRegexesWith: (
    updater: (regexes: TavernRegexLike[]) => TavernRegexLike[],
    option: { type: 'global' },
  ) => Promise<TavernRegexLike[]>;
};

/**
 * 确保全局 prompt 正则已注册并开启：仅剥离 `⟦cv:…⟧`，不碰 display
 * load 时调用；插件关闭时也保持开启
 */
export async function ensurePromptStripRegex(): Promise<void> {
  const helper = getRegexHelper();
  if (!helper) return;
  try {
    await helper.updateTavernRegexesWith(upsertPromptStripRegex, { type: 'global' });
  } catch (error) {
    console.error('[CosmosVision] 注册段落短码 prompt 剥离正则失败', error);
  }
}

/**
 * 把 prompt 剥离正则 upsert 进全局列表
 * @param regexes 当前全局正则
 * @returns 更新后的列表
 */
function upsertPromptStripRegex(regexes: TavernRegexLike[]): TavernRegexLike[] {
  const next = [...regexes];
  const index = next.findIndex(isManagedPromptStripRegex);
  const ensured = createPromptStripRegex();
  if (index >= 0) next[index] = { ...next[index], ...ensured, id: next[index]!.id || ensured.id };
  else next.push(ensured);
  return next;
}

/**
 * 判断是否为插件托管的 prompt 剥离正则
 * @param regex 正则项
 * @returns 是否托管项
 */
function isManagedPromptStripRegex(regex: TavernRegexLike): boolean {
  return regex.id === REGEX_ID || regex.script_name === REGEX_SCRIPT_NAME;
}

/**
 * 构建 prompt-only 短码剥离正则
 * @returns 酒馆正则配置
 */
function createPromptStripRegex(): TavernRegexLike {
  return {
    id: REGEX_ID,
    script_name: REGEX_SCRIPT_NAME,
    enabled: true,
    find_regex: `/${SLOT_SHORTCODE_SOURCE}/g`,
    replace_string: '',
    trim_strings: [],
    source: {
      user_input: true,
      ai_output: true,
      slash_command: true,
      world_info: true,
    },
    destination: {
      display: false,
      prompt: true,
    },
    run_on_edit: true,
    min_depth: null,
    max_depth: null,
  };
}

/**
 * 读取可操作全局正则的 TavernHelper
 * @returns helper 或 null
 */
function getRegexHelper(): RegexHelper | null {
  const helper = getOptionalTavernHelper();
  if (!helper || !hasRegexApi(helper)) return null;
  return helper;
}

/**
 * 判断 helper 是否暴露正则 API
 * @param value helper
 * @returns 是否可用
 */
function hasRegexApi(value: object): value is RegexHelper {
  return 'getTavernRegexes' in value && 'updateTavernRegexesWith' in value;
}
