import { afterEach, vi } from 'vitest';
import lodash from 'lodash';

// 挂载 全局 lodash _
(globalThis as any)._ = lodash;
(window as any)._ = lodash;

// 挂载 toastr spy/mock
const toastrMock = {
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  clear: vi.fn(),
  remove: vi.fn(),
};
(globalThis as any).toastr = toastrMock;
(window as any).toastr = toastrMock;

// 补齐 URL.createObjectURL / revokeObjectURL
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => `blob:http://localhost/${Math.random().toString(36).substring(2)}`);
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

// 补齐 matchMedia
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// 补齐 ResizeObserver
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// 每次测试后清理 DOM、mock、storage
afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
