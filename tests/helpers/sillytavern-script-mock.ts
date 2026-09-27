export const saveSettingsDebounced = () => {};

type EventListener = (...args: unknown[]) => void;

/** 测试用事件总线：模拟 ST eventSource 的 on/emit/removeListener */
class MockEventSource {
  private listeners = new Map<string, Set<EventListener>>();

  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  once(event: string, listener: EventListener): void {
    const wrapped: EventListener = (...args) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  removeListener(event: string, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  /** 触发事件（测试驱动用） */
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(listener => listener(...args));
  }
}

export const eventSource = new MockEventSource();
export const event_types: Record<string, string> = {};
