/**
 * 检测 JS-Slash-Runner 是否已安装并注入 TavernHelper
 * 仅返回布尔,不弹 toast;用于 UI 条件渲染与降级判断
 */
export function isJsSlashRunnerInstalled(): boolean {
  return typeof TavernHelper !== 'undefined';
}

/**
 * 调用 TavernHelper 前的强校验
 * 缺失时通过 toastr 提示用户安装并启用 JS-Slash-Runner
 * @returns true 表示可继续调用 TavernHelper.xxx()
 */
export function ensureTavernHelper(): boolean {
  if (isJsSlashRunnerInstalled()) return true;
  toastr.error('CosmosVision 需要"酒馆助手"扩展(JS-Slash-Runner),请先安装并启用');
  return false;
}

/**
 * 获取可安全调用的 TavernHelper 实例
 * 缺失时返回 null，调用方自行决定降级或抛错
 */
export function getTavernHelper(): NonNullable<typeof TavernHelper> | null {
  if (!ensureTavernHelper() || !TavernHelper) return null;
  return TavernHelper;
}

/**
 * 获取可选 TavernHelper 实例
 * 缺失时静默返回 null，用于日志预览等只读场景
 */
export function getOptionalTavernHelper(): NonNullable<typeof TavernHelper> | null {
  return isJsSlashRunnerInstalled() && TavernHelper ? TavernHelper : null;
}
