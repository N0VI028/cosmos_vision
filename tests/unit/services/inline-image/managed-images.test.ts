import { describe, expect, it } from 'vitest';
import { managedFavoriteKey, managedTemporaryKey } from '@/services/inline-image/managed-images';

describe('inline-image managed-images key utils', () => {
  it('formats composite keys for favorite and temporary images', () => {
    expect(managedFavoriteKey(123)).toBe('favorite:123');
    expect(managedTemporaryKey('tmp-456')).toBe('temporary:tmp-456');
  });
});
