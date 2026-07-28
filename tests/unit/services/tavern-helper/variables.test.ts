import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchScopeVariables, VARIABLE_SCOPES } from '@/services/tavern-helper/variables';

describe('tavern-helper variables service', () => {
  const originalTavernHelper = (globalThis as unknown as { TavernHelper: unknown }).TavernHelper;

  beforeEach(() => {
    delete (globalThis as unknown as { TavernHelper?: unknown }).TavernHelper;
  });

  afterEach(() => {
    (globalThis as unknown as { TavernHelper: unknown }).TavernHelper = originalTavernHelper;
  });

  it('handles unavailable TavernHelper', () => {
    expect(VARIABLE_SCOPES).toHaveLength(4);
    const res = fetchScopeVariables('global');
    expect(res.data).toBeNull();
    expect(res.error).toBe('酒馆助手不可用');
  });

  it('handles invalid scope type', () => {
    const res = fetchScopeVariables('invalid' as any);
    expect(res.data).toBeNull();
    expect(res.error).toBe('未知作用域类型');
  });

  it('fetches global scope variables successfully', () => {
    const getVariablesMock = vi.fn().mockReturnValue({ foo: 'bar' });
    (globalThis as unknown as { TavernHelper: unknown }).TavernHelper = {
      getVariables: getVariablesMock,
    };

    const res = fetchScopeVariables('global');
    expect(res.data).toEqual({ foo: 'bar' });
    expect(res.error).toBeNull();
    expect(getVariablesMock).toHaveBeenCalledWith({ type: 'global' });
  });

  it('fetches message scope with latest message_id option', () => {
    const getVariablesMock = vi.fn().mockReturnValue({ currentMessageVar: 123 });
    (globalThis as unknown as { TavernHelper: unknown }).TavernHelper = {
      getVariables: getVariablesMock,
    };

    const res = fetchScopeVariables('message');
    expect(res.data).toEqual({ currentMessageVar: 123 });
    expect(res.error).toBeNull();
    expect(getVariablesMock).toHaveBeenCalledWith({ type: 'message', message_id: 'latest' });
  });

  it('catches thrown exceptions during getVariables call', () => {
    const getVariablesMock = vi.fn().mockImplementation(() => {
      throw new Error('ST runtime error');
    });
    (globalThis as unknown as { TavernHelper: unknown }).TavernHelper = {
      getVariables: getVariablesMock,
    };

    const res = fetchScopeVariables('chat');
    expect(res.data).toBeNull();
    expect(res.error).toBe('ST runtime error');
  });
});
