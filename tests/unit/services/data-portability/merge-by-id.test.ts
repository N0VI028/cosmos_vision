import { describe, expect, it } from 'vitest';
import { mergeById } from '@/services/data-portability/import';

describe('data portability mergeById', () => {
  it('overrides same ids, appends new items and keeps current order', () => {
    const current = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ];
    const incoming = [
      { id: 'b', value: 20 },
      { id: 'c', value: 3 },
    ];

    const merged = mergeById(current, incoming);

    expect(merged.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(merged.map(item => item.value)).toEqual([1, 20, 3]);
    expect(current[1].value).toBe(2);
  });

  it('keeps current order when incoming only holds existing ids', () => {
    const merged = mergeById(
      [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ],
      [{ id: 'a', value: 9 }],
    );

    expect(merged).toEqual([
      { id: 'a', value: 9 },
      { id: 'b', value: 2 },
    ]);
  });
});
