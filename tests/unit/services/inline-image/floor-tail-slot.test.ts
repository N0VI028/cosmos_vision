import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  deleteFloorTailSlot,
  listFloorTailSlotsBySwipe,
  pruneFloorTailSlotsAboveMesId,
  readFloorTailSlots,
  writeFloorTailSlot,
  type CvFloorTailSlot,
} from '@/services/inline-image/floor-tail-slot';
import { getContext } from '@sillytavern/scripts/extensions';

vi.mock('@sillytavern/scripts/extensions', () => ({
  getContext: vi.fn(),
}));

describe('floor-tail-slot', () => {
  let mockMetadata: Record<string, unknown> = {};
  const saveMetadataDebounced = vi.fn();

  beforeEach(() => {
    mockMetadata = {};
    saveMetadataDebounced.mockClear();
    vi.mocked(getContext).mockReturnValue({
      chatMetadata: mockMetadata,
      saveMetadataDebounced,
    } as any);
  });

  it('writes, reads, and deletes floor tail slots', () => {
    const slot: CvFloorTailSlot = {
      slotId: 'test-slot-1',
      mesId: 10,
      swipeId: 0,
      promptText: 'prompt sample',
      imageRefs: ['temp-1', 'temp-2'],
      createdAt: 1000,
      route: 'frontend',
    };

    writeFloorTailSlot(slot);
    expect(saveMetadataDebounced).toHaveBeenCalled();

    const slots = readFloorTailSlots();
    expect(slots['test-slot-1']).toEqual(slot);

    const list = listFloorTailSlotsBySwipe(10, 0);
    expect(list).toHaveLength(1);
    expect(list[0]?.slotId).toBe('test-slot-1');

    deleteFloorTailSlot('test-slot-1');
    expect(readFloorTailSlots()['test-slot-1']).toBeUndefined();
  });

  it('prunes slots whose mesId is at or above the threshold (chat.length after delete)', () => {
    const slot1: CvFloorTailSlot = {
      slotId: 'p1',
      mesId: 3,
      swipeId: 0,
      promptText: 'text 1',
      imageRefs: ['i1'],
      createdAt: 1000,
      route: 'frontend',
    };
    const slot2: CvFloorTailSlot = {
      slotId: 'p2',
      mesId: 4,
      swipeId: 0,
      promptText: 'text 2',
      imageRefs: ['i2'],
      createdAt: 2000,
      route: 'frontend',
    };
    const slot3: CvFloorTailSlot = {
      slotId: 'p3',
      mesId: 5,
      swipeId: 1,
      promptText: 'text 3',
      imageRefs: ['i3'],
      createdAt: 3000,
      route: 'frontend',
    };

    writeFloorTailSlot(slot1);
    writeFloorTailSlot(slot2);
    writeFloorTailSlot(slot3);

    // 删除后 chat.length = 5，mesId >= 5 的 slot 失效
    const deleted = pruneFloorTailSlotsAboveMesId(5);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.slotId).toBe('p3');
    expect(readFloorTailSlots()['p1']).toBeDefined();
    expect(readFloorTailSlots()['p2']).toBeDefined();
    expect(readFloorTailSlots()['p3']).toBeUndefined();
  });
});
