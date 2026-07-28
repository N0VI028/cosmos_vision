import { vi } from 'vitest';

export interface MockResponseOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  json?: any;
  text?: string;
  blob?: Blob;
  body?: any;
  ok?: boolean;
}

/**
 * 创建用于 vi.stubGlobal('fetch', ...) 的模拟 fetch 实现
 */
export function createMockFetch(resolver?: (url: string, init?: RequestInit) => MockResponseOptions | Promise<MockResponseOptions>) {
  return vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    const opts = resolver ? await resolver(urlString, init) : {};

    const status = opts.status ?? 200;
    const ok = opts.ok ?? (status >= 200 && status < 300);
    const headers = new Headers(opts.headers || {});

    return {
      ok,
      status,
      statusText: opts.statusText || (ok ? 'OK' : 'Error'),
      headers,
      body: opts.body ?? null,
      json: async () => opts.json ?? {},
      text: async () => opts.text ?? (opts.json ? JSON.stringify(opts.json) : ''),
      blob: async () => opts.blob ?? new Blob(['test-data'], { type: 'application/octet-stream' }),
      arrayBuffer: async () => {
        const blob = opts.blob ?? new Blob(['test-data']);
        return await blob.arrayBuffer();
      },
    };
  });
}
