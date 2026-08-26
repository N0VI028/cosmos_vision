import { vi } from 'vitest';

export const getWorldInfoPrompt = vi.fn().mockResolvedValue({
  worldInfoString: '',
  worldInfoBefore: '',
  worldInfoAfter: '',
});

export const getWorldInfoSettings = vi.fn().mockReturnValue({
  world_info_include_names: true,
});
