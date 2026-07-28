import { describe, expect, it, vi } from 'vitest';
import { setupSillyTavernMocks } from '../helpers/sillytavern-mocks';
import { createMockFetch } from '../helpers/fetch-mocks';

describe('smoke test suite', () => {
  it('should verify vitest environment works', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support global lodash _ mock', () => {
    expect(_).toBeDefined();
    expect(_.isPlainObject({})).toBe(true);
    expect(_.cloneDeep({ a: 1 })).toEqual({ a: 1 });
  });

  it('should support global toastr mock', () => {
    expect(toastr).toBeDefined();
    expect(typeof toastr.info).toBe('function');
    expect(typeof toastr.error).toBe('function');
  });

  it('should support mock fetch helper', async () => {
    const mockFetch = createMockFetch(() => ({
      json: { success: true },
    }));

    vi.stubGlobal('fetch', mockFetch);

    const res = await fetch('http://localhost/test');
    const data = await res.json();
    expect(data).toEqual({ success: true });

    vi.unstubAllGlobals();
  });

  it('should set up SillyTavern mocks', () => {
    const { tavernHelperMock } = setupSillyTavernMocks();
    expect((globalThis as any).TavernHelper.isAvailable()).toBe(true);
    expect(tavernHelperMock.isAvailable).toHaveBeenCalled();
  });
});
