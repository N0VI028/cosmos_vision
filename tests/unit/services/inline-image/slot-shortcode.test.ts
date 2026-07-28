import { describe, expect, it } from 'vitest';
import {
  encodeSlotShortcode,
  hasSlotShortcode,
  newSlotId,
  parseSlotIds,
  parseSlotMarkerLine,
} from '@/services/inline-image/slot-shortcode';

describe('inline-image slot-shortcode', () => {
  it('generates valid 8-character hex slot ids', () => {
    const id = newSlotId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });

  it('encodes and parses slot shortcodes', () => {
    const encoded = encodeSlotShortcode('a1b2c3d4');
    expect(encoded).toBe('⟦cv:a1b2c3d4⟧');

    expect(parseSlotMarkerLine(' ⟦cv:a1b2c3d4⟧ ')).toBe('a1b2c3d4');
    expect(parseSlotMarkerLine('invalid line')).toBeNull();

    const ids = parseSlotIds('Here is ⟦cv:a1b2c3d4⟧ and ⟦cv:e5f6g7h8⟧ and ⟦cv:a1b2c3d4⟧');
    expect(ids).toEqual(['a1b2c3d4', 'e5f6g7h8']);
  });

  it('checks if text has slot shortcode', () => {
    const text = 'Hello\n⟦cv:a1b2c3d4⟧\nWorld';
    expect(hasSlotShortcode(text, 'a1b2c3d4')).toBe(true);
    expect(hasSlotShortcode(text, '12345678')).toBe(false);
  });
});
