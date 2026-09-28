import { event_types, eventSource } from '@sillytavern/script';

/**
 * 插件默认橙色主题色
 */
export const DEFAULT_QUOTE_COLOR = '#e18a24';

/**
 * 主题色与背景的最低对比度阈值
 *
 * 注：可见性保险线而非 WCAG 无障碍达标线；
 * 默认橙对白底约 2.67、ST 常见主题色 #f49066 对白底约 2.33，阈值必须低于它们，否则正常主题色也被拦。
 */
export const MIN_QUOTE_SURFACE_CONTRAST = 2;

/**
 * 计算 Hex 颜色的 WCAG 相对亮度
 *
 * 各通道 c/255 后线性化（c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4），L = 0.2126R + 0.7152G + 0.0722B。
 * @param hex 颜色十六进制字符串，形如 #rrggbb
 * @returns 相对亮度值 (0 - 1)，非法输入返回 NaN
 */
export function relativeLuminance(hex: string): number {
  const fullHex = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return NaN;
  }
  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * 计算两个 Hex 颜色的 WCAG 对比度
 *
 * 公式为 (L1+0.05)/(L2+0.05)，L1 为较亮者。
 * @param hexA 颜色 A (十六进制)
 * @param hexB 颜色 B (十六进制)
 * @returns 对比度比例 (1 - 21)，任一颜色非法时返回 NaN
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  if (Number.isNaN(lumA) || Number.isNaN(lumB)) {
    return NaN;
  }
  const l1 = Math.max(lumA, lumB);
  const l2 = Math.min(lumA, lumB);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * 读取当前深浅主题下的插件 surface 颜色
 *
 * 原理：浅色值定义在 :root（继承到探测元素），深色值定义在 `.cosmos-vision-root.cosmos-vision-app-dark`（探测元素自身匹配）。
 * @param darkMode 是否为深色模式
 * @returns 归一化后的 `#rrggbb` 颜色，读取或解析失败时返回 null
 */
function readCvSurfaceColor(darkMode: boolean): string | null {
  const probe = document.createElement('span');
  probe.className = darkMode ? 'cosmos-vision-root cosmos-vision-app-dark' : 'cosmos-vision-root';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const raw = getComputedStyle(probe).getPropertyValue('--cv-surface').trim();
  probe.remove();
  return toOpaqueHex(raw);
}

/**
 * 读取 ST 主题色 --SmartThemeQuoteColor 并归一化为 #rrggbb
 * 如果未获取到，或颜色为纯黑 (#000000) 或纯白 (#ffffff)，或与当前 surface 对比度不足，则回退为默认的橙色主题色 (#e18a24)
 * @param target 计算样式来源,默认 document.documentElement
 * @param darkMode 是否为深色模式,用于计算背景对比度,默认 false
 * @returns 形如 `#rrggbb` 的不透明颜色;解析失败或不满足对比度则返回默认橙色
 */
export function getThemeQuoteColorOpaque(
  target: HTMLElement = document.documentElement,
  darkMode = false,
): string {
  const raw = getComputedStyle(target).getPropertyValue('--SmartThemeQuoteColor').trim();
  const color = toOpaqueHex(raw);

  if (!color || color === '#000000' || color === '#ffffff') {
    return DEFAULT_QUOTE_COLOR;
  }

  const surface = readCvSurfaceColor(darkMode);
  if (surface && contrastRatio(color, surface) < MIN_QUOTE_SURFACE_CONTRAST) {
    return DEFAULT_QUOTE_COLOR;
  }

  return color;
}

/**
 * 等待 ST APP_READY 事件,确保主题 CSS 变量已注入
 * - 优先用 computed style 检查,涵盖 inline 与 stylesheet 两种注入方式,避免错过 APP_READY 后永久 pending
 * - 同时挂超时兜底,防 ST 未来改实现导致事件永不触发
 * @param timeoutMs 兜底超时(默认 3000ms),即使事件未到也会 resolve
 */
export function whenSillyTavernReady(timeoutMs = 3000): Promise<void> {
  return new Promise(resolve => {
    const exists = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeQuoteColor').trim();
    if (exists) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    eventSource.once(event_types.APP_READY, finish);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * 借浏览器代理解析任意合法颜色字符串,统一输出不带 alpha 的 #rrggbb
 * 覆盖 hex / hex+alpha / rgb / rgba / hsl / hsla / color-mix 等所有 ST 可能输出
 */
function toOpaqueHex(input: string): string | null {
  if (!input) return null;
  const probe = document.createElement('span');
  probe.style.color = input;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  // 浏览器规范化为 `rgb(r, g, b)` 或 `rgba(r, g, b, a)` / `rgb(r g b / a)`
  const m = computed.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return null;
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}
