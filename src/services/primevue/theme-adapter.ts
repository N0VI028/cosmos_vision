import { palette, updatePrimaryPalette } from '@primeuix/themes';

import { DARK_MODE_STORAGE_KEY, DEFAULT_DARK_MODE } from '@/constants/default-settings';
import { getThemeQuoteColorOpaque } from '@/services/sillytavern/theme';

/**
 * 把 ST --SmartThemeQuoteColor（含对比度回退结论）映射到 PrimeVue Primary 色阶，
 * 并经 :root 变量 --cv-quote-color 下发给宿主聊天 DOM 内的内联 UI（状态条 / 触发按钮 / 画廊高亮）——
 * 它们在面板组件树外，读不到 PrimeVue 主色变量。
 * 在 PrimeVue 安装后、Vue mount 前调用一次,避免组件以默认 emerald 短暂闪烁
 *
 * 注：useLocalStorage(boolean) 落盘为 'true'/'false' 字符串，null 表示从未写过取默认值 true。
 */
export function syncThemeColorToPrimary(): void {
  const raw = localStorage.getItem(DARK_MODE_STORAGE_KEY);
  const darkMode = raw === null ? DEFAULT_DARK_MODE : raw !== 'false';
  const color = getThemeQuoteColorOpaque(document.documentElement, darkMode);
  document.documentElement.style.setProperty('--cv-quote-color', color);
  const scale = palette(color);
  // palette 解析失败会原样返回字符串,此时保留 PrimeVue 默认色
  if (typeof scale === 'string') return;
  updatePrimaryPalette(scale as Parameters<typeof updatePrimaryPalette>[0]);
}
