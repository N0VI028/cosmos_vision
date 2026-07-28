import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@/store/settings';

describe('settings store recovery and state management', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    (window as any).extension_settings = {};
  });

  it('initializes default settings and updates dark mode', () => {
    const store = useSettingsStore();
    expect(store.settings.imageSource).toBe('novelai');
    expect(store.isDirty).toBe(false);

    store.settings.imageSource = 'comfyui';
    expect(store.isDirty).toBe(true);

    store.applySettings();
    expect(store.savedSettings.imageSource).toBe('comfyui');
    expect(store.isDirty).toBe(false);
  });

  it('resets to defaults cleanly', () => {
    const store = useSettingsStore();
    store.settings.imageSource = 'comfyui';
    store.applySettings();

    store.resetToDefaults();
    expect(store.settings.imageSource).toBe('novelai');
    expect(store.savedSettings.imageSource).toBe('novelai');
  });

  it('handles imported settings application', () => {
    const store = useSettingsStore();
    const imported = {
      imageSource: 'comfyui',
      comfyui: { url: 'http://127.0.0.1:8188' },
    };

    store.applyImportedSettings(imported);
    expect(store.settings.imageSource).toBe('comfyui');
    expect(store.settings.comfyui.url).toBe('http://127.0.0.1:8188');
  });
});
