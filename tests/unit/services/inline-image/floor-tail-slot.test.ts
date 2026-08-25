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
      imageRefs: ['temp-1', 'temp-2'],
      targetIframeId: 'TH-message--10--0',
      targetIframeIndex: 0,
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

  it('prunes slots at or above chat length and returns deleted records', () => {
    writeFloorTailSlot({
      slotId: 'slot-1',
      mesId: 5,
      swipeId: 0,
      imageRefs: ['ref-1'],
    });
    writeFloorTailSlot({
      slotId: 'slot-2',
      mesId: 10,
      swipeId: 0,
      imageRefs: ['ref-2'],
    });

    const deleted = pruneFloorTailSlotsAboveMesId(10);

    const remaining = readFloorTailSlots();
    expect(deleted.map(slot => slot.slotId)).toEqual(['slot-2']);
    expect(remaining['slot-1']).toBeDefined();
    expect(remaining['slot-2']).toBeUndefined();
  });

  it('preserves metadata insertion order during restoration', () => {
    writeFloorTailSlot({ slotId: 'first', mesId: 3, swipeId: 1, imageRefs: [] });
    writeFloorTailSlot({ slotId: 'second', mesId: 3, swipeId: 1, imageRefs: [] });

    expect(listFloorTailSlotsBySwipe(3, 1).map(slot => slot.slotId)).toEqual(['first', 'second']);
  });
});
