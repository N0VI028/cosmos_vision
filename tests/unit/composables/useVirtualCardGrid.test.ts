import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { chunkIntoRows, resolveCardGridColumns, useVirtualCardGrid } from '@/composables/useVirtualCardGrid';
describe('resolveCardGridColumns', () => {
  it('returns 3 columns above the two-column breakpoint', () => {
    expect(resolveCardGridColumns(897, 16)).toBe(3);
    expect(resolveCardGridColumns(1920, 16)).toBe(3);
  });

  it('returns 2 columns at the two-column breakpoint boundary', () => {
    expect(resolveCardGridColumns(896, 16)).toBe(2);
    expect(resolveCardGridColumns(609, 16)).toBe(2);
  });

  it('returns 2 columns at or below the two-column breakpoint (mobile keeps two columns)', () => {
    expect(resolveCardGridColumns(608, 16)).toBe(2);
    expect(resolveCardGridColumns(320, 16)).toBe(2);
  });

  it('honors custom rem pixel size', () => {
    expect(resolveCardGridColumns(570, 15)).toBe(2);
    expect(resolveCardGridColumns(840, 15)).toBe(2);
    expect(resolveCardGridColumns(841, 15)).toBe(3);
  });
});

describe('chunkIntoRows', () => {
  it('returns empty rows for empty input', () => {
    expect(chunkIntoRows([], 3)).toEqual([]);
  });

  it('chunks items into full rows', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('keeps remainder items in a trailing row', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('treats non-positive columns as one column', () => {
    expect(chunkIntoRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunkIntoRows([1, 2], -3)).toEqual([[1], [2]]);
  });
});

describe('useVirtualCardGrid', () => {
  it('renders a bounded window of rows and reacts to source changes', async () => {
    const source = ref(Array.from({ length: 90 }, (_, index) => index));
    let grid!: ReturnType<typeof useVirtualCardGrid<number>>;

    const GridHost = defineComponent({
      setup() {
        grid = useVirtualCardGrid<number>(source);
        return () =>
          h('div', grid.containerProps, [
            h(
              'div',
              grid.wrapperProps.value,
              grid.visibleRows.value.map(row =>
                h(
                  'div',
                  {
                    key: row.rowIndex,
                    'data-row-index': row.rowIndex,
                    ref: grid.rowRef(row.rowIndex),
                  },
                  row.items.map(item => h('span', { key: item }, String(item))),
                ),
              ),
            ),
          ]);
      },
    });

    const wrapper = mount(GridHost, { attachTo: document.body });
    await nextTick();

    // jsdom 无布局：仅首屏缓冲行会被渲染，绝不能是全部 30 行
    const initialRows = readRenderedRows(wrapper);
    expect(initialRows.length).toBeGreaterThan(0);
    expect(initialRows.length).toBeLessThan(30);
    expect(initialRows[0]).toEqual([0, 1, 2]);

    // 行 ref 按索引缓存：同索引返回同一引用（否则每次渲染都会解绑/重绑实测监听）
    expect(grid.rowRef(0)).toBe(grid.rowRef(0));
    expect(grid.rowRef(0)).not.toBe(grid.rowRef(1));

    source.value = source.value.map(item => item + 1000);
    await nextTick();
    const updatedRows = readRenderedRows(wrapper);
    expect(updatedRows.length).toBeGreaterThan(0);
    expect(updatedRows[0][0]).toBeGreaterThanOrEqual(1000);

    wrapper.unmount();
  });

  /**
   * 读取当前渲染出的行内容
   * @param wrapper 挂载实例
   * @returns 行数据
   */
  function readRenderedRows(wrapper: ReturnType<typeof mount>): number[][] {
    return wrapper.findAll('[data-row-index]').map(row => row.findAll('span').map(span => Number(span.text())));
  }
});
