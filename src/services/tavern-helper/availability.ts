/**
 * TavernHelper 可用性检测选项
 */
export interface TavernHelperAvailabilityOptions {
  silent?: boolean;
}

export const MINIMUM_TAVERN_HELPER_VERSION = '4.8.13';
export const TAVERN_HELPER_DOC_URL =
  'https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/%E5%85%B3%E4%BA%8E%E9%85%92%E9%A6%86%E5%8A%A9%E6%89%8B/%E5%AE%89%E8%A3%85%E4%B8%8E%E6%9B%B4%E6%96%B0.html';

/**
 * 比较点分版本号是否达到最低要求
 * @param currentVersion 当前版本号
 * @param minimumVersion 最低版本号
 */
export function isVersionAtLeast(currentVersion: string, minimumVersion: string): boolean {
  const currentParts = currentVersion.split('.').map(Number);
  const minimumParts = minimumVersion.split('.').map(Number);
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (currentParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/**
 * 检测 JS-Slash-Runner 是否已安装并注入 TavernHelper
 * 仅返回布尔,不弹 toast;用于 UI 条件渲染与降级判断
 */
export function isJsSlashRunnerInstalled(): boolean {
  return typeof TavernHelper !== 'undefined';
}

/**
 * 检测 JS-Slash-Runner 是否满足最低版本要求
 * 版本不足或版本接口缺失时返回 false
 */
export function isTavernHelperSupported(): boolean {
  if (!isJsSlashRunnerInstalled() || !TavernHelper) return false;
  if (typeof TavernHelper.getTavernHelperVersion !== 'function') return false;
  return isVersionAtLeast(TavernHelper.getTavernHelperVersion(), MINIMUM_TAVERN_HELPER_VERSION);
}

/**
 * 调用 TavernHelper 前的强校验
 * 缺失时通过 toastr 提示用户安装并启用 JS-Slash-Runner
 * @param options 检测选项
 * @returns true 表示可继续调用 TavernHelper.xxx()
 */
export function ensureTavernHelper(options: TavernHelperAvailabilityOptions = {}): boolean {
  if (isTavernHelperSupported()) return true;
  if (!options.silent) {
    toastr.error(getTavernHelperUnavailableMessage(), '', { escapeHtml: false });
  }
  return false;
}

/**
 * 获取 TavernHelper 不可用时的用户提示（包含安装与更新指南超链接）
 */
export function getTavernHelperUnavailableMessage(): string {
  const linkHtml = `<a href="${TAVERN_HELPER_DOC_URL}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; font-weight: bold; margin-left: 4px;">点击查看安装与更新指南</a>`;
  if (!isJsSlashRunnerInstalled()) {
    return `CosmosVision 需要“酒馆助手”扩展(JS-Slash-Runner)，请先安装并启用。${linkHtml}`;
  }
  return `CosmosVision 需要酒馆助手 ${MINIMUM_TAVERN_HELPER_VERSION} 或更高版本，请先更新。${linkHtml}`;
}

/**
 * 获取可安全调用的 TavernHelper 实例
 * @param options 检测选项
 * 缺失时返回 null，调用方自行决定降级或抛错
 */
export function getTavernHelper(
  options: TavernHelperAvailabilityOptions = {},
): NonNullable<typeof TavernHelper> | null {
  if (!ensureTavernHelper(options) || !TavernHelper) return null;
  return TavernHelper;
}

/**
 * 获取可选 TavernHelper 实例
 * 缺失时静默返回 null，用于日志预览等只读场景
 */
export function getOptionalTavernHelper(): NonNullable<typeof TavernHelper> | null {
  return isTavernHelperSupported() && TavernHelper ? TavernHelper : null;
}
