import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUOTE_COLOR,
  contrastRatio,
  getThemeQuoteColorOpaque,
  relativeLuminance,
} from '@/services/sillytavern/theme';

describe('theme 主题色亮度与对比度防御机制', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  describe('relativeLuminance 相对亮度计算', () => {
    it('正确计算白色、黑色与中间灰的 WCAG 相对亮度', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
      // #808080 线性化后真实值约为 0.2158605
      expect(relativeLuminance('#808080')).toBeCloseTo(0.21586, 4);
    });
  });

  describe('contrastRatio 对比度计算', () => {
    it('正确计算纯黑纯白以及默认主题色的对比度', () => {
      expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
      expect(contrastRatio('#e18a24', '#ffffff')).toBeCloseTo(2.67, 2);
      // #f49066 相对亮度约为 0.4014，对白底标准 WCAG 对比度约为 2.33:1（大于阈值 2）
      expect(contrastRatio('#f49066', '#ffffff')).toBeCloseTo(2.33, 2);
    });
  });

  describe('getThemeQuoteColorOpaque 颜色获取与对比度防御', () => {
    /**
     * 辅助函数：构造 mock getComputedStyle
     */
    function mockStyles(options: {
      quoteColor?: string;
      darkSurface?: string;
      lightSurface?: string;
    }) {
      const {
        quoteColor = '',
        darkSurface = 'rgb(18, 20, 22)',
        lightSurface = 'rgb(255, 255, 255)',
      } = options;

      vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => {
        const el = element as HTMLElement;
        const isDarkProbe = el.classList?.contains('cosmos-vision-app-dark');
        const isSurfaceProbe = el.classList?.contains('cosmos-vision-root');

        return {
          getPropertyValue(prop: string): string {
            if (prop === '--SmartThemeQuoteColor') {
              return quoteColor;
            }
            if (prop === '--cv-surface') {
              if (isSurfaceProbe) {
                return isDarkProbe ? darkSurface : lightSurface;
              }
              return '';
            }
            return '';
          },
          get color(): string {
            return el.style?.color || '';
          },
        } as unknown as CSSStyleDeclaration;
      });
    }

    it('深色模式下极暗主题色对比度不足，回退到默认橙', () => {
      mockStyles({
        quoteColor: 'rgba(13,20,32,1)',
        darkSurface: 'rgb(18, 20, 22)',
      });

      const color = getThemeQuoteColorOpaque(document.documentElement, true);
      expect(color).toBe(DEFAULT_QUOTE_COLOR);
    });

    it('浅色模式下极亮主题色对比度不足，回退到默认橙', () => {
      mockStyles({
        quoteColor: 'rgba(245,245,245,1)',
        lightSurface: 'rgb(255, 255, 255)',
      });

      const color = getThemeQuoteColorOpaque(document.documentElement, false);
      expect(color).toBe(DEFAULT_QUOTE_COLOR);
    });

    it('正常主题色满足对比度阈值时直接放行，不发生回退', () => {
      mockStyles({
        quoteColor: 'rgba(244,144,102,1)',
        lightSurface: 'rgb(255, 255, 255)',
      });

      const color = getThemeQuoteColorOpaque(document.documentElement, false);
      expect(color).toBe('#f49066');
    });

    it('现有行为回归：纯黑/纯白/空 quote 色回退到默认橙', () => {
      mockStyles({ quoteColor: 'rgba(0,0,0,1)' });
      expect(getThemeQuoteColorOpaque(document.documentElement, false)).toBe(DEFAULT_QUOTE_COLOR);

      mockStyles({ quoteColor: 'rgba(255,255,255,1)' });
      expect(getThemeQuoteColorOpaque(document.documentElement, false)).toBe(DEFAULT_QUOTE_COLOR);

      mockStyles({ quoteColor: '' });
      expect(getThemeQuoteColorOpaque(document.documentElement, false)).toBe(DEFAULT_QUOTE_COLOR);
    });

    it('surface 读取失败时跳过对比度判定，返回原色不引入额外回退', () => {
      mockStyles({
        quoteColor: 'rgba(13,20,32,1)',
        darkSurface: '',
      });

      // 当 surface 为空读取失败时，不应引入额外回退路径
      expect(getThemeQuoteColorOpaque(document.documentElement, true)).toBe('#0d1420');
    });
  });
});
