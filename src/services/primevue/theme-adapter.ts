import { palette, updatePrimaryPalette } from '@primeuix/themes';

import { getThemeQuoteColorOpaque } from '@/services/sillytavern/theme';

/**
 * 把 ST --SmartThemeQuoteColor 映射到 PrimeVue Primary 色阶
 * 在 PrimeVue 安装后、Vue mount 前调用一次,避免组件以默认 emerald 短暂闪烁
 */
export function syncThemeColorToPrimary(): void {
  const color = getThemeQuoteColorOpaque();
  const scale = palette(color);
  // palette 解析失败会原样返回字符串,此时保留 PrimeVue 默认色
  if (typeof scale === 'string') return;
  updatePrimaryPalette(scale as Parameters<typeof updatePrimaryPalette>[0]);
}
