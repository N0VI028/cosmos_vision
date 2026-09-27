import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { promptLlmSettingsSchema, recoverPromptLlmSettings } from '@/store/prompt-llm-settings';

describe('prompt-llm settings schema and recovery', () => {
  it('validates default prompt-llm settings schema', () => {
    const result = promptLlmSettingsSchema.safeParse(DEFAULT_SETTINGS.promptLlm);
    expect(result.success).toBe(true);
    expect(DEFAULT_SETTINGS.promptLlm.autoCharacterInfo).toBe(false);
  });

  it('recovers corrupted settings gracefully with fallback defaults', () => {
    const corrupted = {
      temperature: 'invalid', // bad type
      historyFloorCount: -5, // bad value
      shouldStream: 'yes', // bad type
      autoCharacterInfo: 'yes', // bad type
    };

    const recovered = recoverPromptLlmSettings(corrupted);
    expect(recovered.accounts[0].temperature).toBe(DEFAULT_SETTINGS.promptLlm.accounts[0].temperature);
    expect(recovered.historyFloorCount).toBe(DEFAULT_SETTINGS.promptLlm.historyFloorCount);
    expect(recovered.accounts[0].shouldStream).toBe(false);
    expect(recovered.autoCharacterInfo).toBe(false);
  });

  it('preserves valid autoCharacterInfo value', () => {
    const recovered = recoverPromptLlmSettings({ autoCharacterInfo: true });
    expect(recovered.autoCharacterInfo).toBe(true);
  });

  it('migrates legacy single account fields into the first account', () => {
    const legacy = {
      apiUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-key',
      model: 'gpt-4o',
      source: 'deepseek',
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered.accounts).toHaveLength(1);
    expect(recovered.accounts[0].apiUrl).toBe('https://api.example.com/v1');
    expect(recovered.accounts[0].apiKey).toBe('sk-secret-key');
    expect(recovered.accounts[0].model).toBe('gpt-4o');
    expect(recovered.accounts[0].source).toBe('deepseek');
    expect(recovered.accounts[0].enabled).toBe(true);
    expect(recovered.routingMode).toBe('sequential');
  });

  it('keeps existing account list when already migrated', () => {
    const migrated = {
      accounts: [
        {
          id: 'acc-a',
          name: 'A',
          proxyPreset: '',
          apiUrl: 'https://a.example.com',
          apiKey: 'key-a',
          source: 'openai',
          model: 'gpt-4o',
          enabled: true,
        },
        {
          id: 'acc-b',
          name: '',
          proxyPreset: '',
          apiUrl: 'https://b.example.com',
          apiKey: 'key-b',
          source: 'claude',
          model: 'claude-sonnet-4',
          enabled: false,
        },
      ],
      routingMode: 'load_balance',
    };

    const recovered = recoverPromptLlmSettings(migrated);
    expect(recovered.accounts.map(account => account.id)).toEqual(['acc-a', 'acc-b']);
    expect(recovered.accounts[1].enabled).toBe(false);
    expect(recovered.accounts[1].source).toBe('claude');
    expect(recovered.routingMode).toBe('load_balance');
  });

  it('migrates legacy global connection fields into the first account', () => {
    const legacy = {
      proxyPreset: 'my-proxy',
      model: 'gpt-4o-mini',
      source: 'xai',
      accounts: [{ id: 'acc-a', name: 'A', apiUrl: 'https://a.example.com', apiKey: 'key-a', enabled: true }],
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered.accounts[0].proxyPreset).toBe('my-proxy');
    expect(recovered.accounts[0].model).toBe('gpt-4o-mini');
    expect(recovered.accounts[0].source).toBe('xai');
    expect(recovered).not.toHaveProperty('proxyPreset');
    expect(recovered).not.toHaveProperty('model');
    expect(recovered).not.toHaveProperty('source');
  });

  it('keeps per-account connection fields when already set', () => {
    const migrated = {
      proxyPreset: 'old-global',
      model: 'old-model',
      accounts: [
        {
          id: 'acc-a',
          name: 'A',
          proxyPreset: 'acc-proxy',
          apiUrl: '',
          apiKey: '',
          source: 'claude',
          model: 'claude-opus-4',
          enabled: true,
        },
        { id: 'acc-b', name: 'B', apiUrl: 'https://b.example.com', apiKey: 'key-b', enabled: true },
      ],
    };

    const recovered = recoverPromptLlmSettings(migrated);
    expect(recovered.accounts[0].proxyPreset).toBe('acc-proxy');
    expect(recovered.accounts[0].model).toBe('claude-opus-4');
    expect(recovered.accounts[1].proxyPreset).toBe('');
    expect(recovered.accounts[1].model).toBe('');
    expect(recovered.accounts[1].source).toBe('openai');
  });

  it('migrates legacy global generation params to multiple accounts without params', () => {
    const legacy = {
      temperature: 1.2,
      maxTokens: 4096,
      topP: 0.85,
      topK: 40,
      shouldStream: true,
      accounts: [
        { id: 'acc-1', name: 'Acc1', apiUrl: 'https://1.example.com', apiKey: 'k1', enabled: true },
        { id: 'acc-2', name: 'Acc2', apiUrl: 'https://2.example.com', apiKey: 'k2', enabled: true },
      ],
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered).not.toHaveProperty('temperature');
    expect(recovered).not.toHaveProperty('maxTokens');
    expect(recovered).not.toHaveProperty('topP');
    expect(recovered).not.toHaveProperty('topK');
    expect(recovered).not.toHaveProperty('shouldStream');

    expect(recovered.accounts[0].temperature).toBe(1.2);
    expect(recovered.accounts[0].maxTokens).toBe(4096);
    expect(recovered.accounts[0].topP).toBe(0.85);
    expect(recovered.accounts[0].topK).toBe(40);
    expect(recovered.accounts[0].shouldStream).toBe(true);

    expect(recovered.accounts[1].temperature).toBe(1.2);
    expect(recovered.accounts[1].maxTokens).toBe(4096);
    expect(recovered.accounts[1].topP).toBe(0.85);
    expect(recovered.accounts[1].topK).toBe(40);
    expect(recovered.accounts[1].shouldStream).toBe(true);
  });

  it('preserves account-level generation params over legacy global fallback', () => {
    const legacy = {
      temperature: 1.5,
      maxTokens: 8192,
      accounts: [
        {
          id: 'acc-1',
          name: 'Custom',
          temperature: 0.2,
          maxTokens: 1024,
          topP: 0.9,
          topK: 20,
          enabled: true,
        },
        {
          id: 'acc-2',
          name: 'Fallback',
          enabled: true,
        },
      ],
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered.accounts[0].temperature).toBe(0.2);
    expect(recovered.accounts[0].maxTokens).toBe(1024);
    expect(recovered.accounts[0].topP).toBe(0.9);
    expect(recovered.accounts[0].topK).toBe(20);

    expect(recovered.accounts[1].temperature).toBe(1.5);
    expect(recovered.accounts[1].maxTokens).toBe(8192);
    expect(recovered.accounts[1].topP).toBe(1.0); // 账号默认值
    expect(recovered.accounts[1].topK).toBe(0); // 账号默认值
  });

  it('uses default generation params when neither legacy global nor account specifies them', () => {
    const raw = {
      accounts: [{ id: 'acc-1', name: 'Fresh', enabled: true }],
    };

    const recovered = recoverPromptLlmSettings(raw);
    expect(recovered.accounts[0].temperature).toBe(0.7);
    expect(recovered.accounts[0].maxTokens).toBe(32000);
    expect(recovered.accounts[0].topP).toBe(1.0);
    expect(recovered.accounts[0].topK).toBe(0);
  });
});
