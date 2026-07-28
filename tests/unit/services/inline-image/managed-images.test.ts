import { describe, expect, it } from 'vitest';
import {
  managedFavoriteKey,
  managedTemporaryKey,
  parseManagedImageKey,
} from '@/services/inline-image/managed-images';

describe('inline-image managed-images key utils', () => {
  it('formats composite keys for favorite and temporary images', () => {
    expect(managedFavoriteKey(123)).toBe('favorite:123');
    expect(managedTemporaryKey('tmp-456')).toBe('temporary:tmp-456');
  });

  it('parses composite keys back to kind and sourceId', () => {
    expect(parseManagedImageKey('favorite:123')).toEqual({ kind: 'favorite', sourceId: 123 });
    expect(parseManagedImageKey('temporary:tmp-456')).toEqual({ kind: 'temporary', sourceId: 'tmp-456' });
    expect(parseManagedImageKey('invalid-key')).toBeNull();
  });
});
