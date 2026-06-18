import { event_types, eventSource } from '@sillytavern/script';

/**
 * 读取 ST 主题色 --SmartThemeQuoteColor 并归一化为 #rrggbb
 * @param target 计算样式来源,默认 document.documentElement
 * @returns 形如 `#rrggbb` 的不透明颜色;解析失败返回 ST 默认值
 */
export function getThemeQuoteColorOpaque(target: HTMLElement = document.documentElement): string {
  const raw = getComputedStyle(target).getPropertyValue('--SmartThemeQuoteColor').trim();
  return toOpaqueHex(raw) ?? '#e18a24';
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
