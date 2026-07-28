import { vi } from 'vitest';

export function setupSillyTavernMocks() {
  const tavernHelperMock = {
    isAvailable: vi.fn().mockReturnValue(true),
    getChatHistory: vi.fn().mockReturnValue([]),
    getCharacters: vi.fn().mockReturnValue([]),
    getWorldbooks: vi.fn().mockReturnValue([]),
    generateRaw: vi.fn().mockResolvedValue('Mocked response'),
    createWorldbookEntry: vi.fn(),
    updateWorldbookEntry: vi.fn(),
    deleteWorldbookEntry: vi.fn(),
  };

  (globalThis as any).TavernHelper = tavernHelperMock;
  (window as any).TavernHelper = tavernHelperMock;

  const SillyTavernContext = {
    getContext: vi.fn().mockReturnValue({
      characterId: 1,
      characters: [{ name: 'TestChar', avatar: 'char.png' }],
      chat: [
        { name: 'User', is_user: true, mes: 'Hello' },
        { name: 'TestChar', is_user: false, mes: 'Hi there!' },
      ],
      name1: 'User',
      name2: 'TestChar',
    }),
    saveSettingsDebounced: vi.fn(),
  };

  (globalThis as any).SillyTavern = SillyTavernContext;
  (window as any).SillyTavern = SillyTavernContext;

  return {
    tavernHelperMock,
    SillyTavernContext,
  };
}
