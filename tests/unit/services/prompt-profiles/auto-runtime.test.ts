import { describe, expect, it, vi } from 'vitest';
import {
  buildAutoParticipantContext,
  buildAutoParticipantRuntimeContent,
  buildAutoWorldInfoChatMessages,
  getAutoUserPersonaDescription,
  getAutoWorldInfoIncludeNames,
  getAutoWorldInfoMaxContext,
  safeRenderPromptTemplate,
  scanAutoWorldInfo,
} from '@/services/prompt-profiles/auto-runtime';
import * as promptProfilesSources from '@/services/tavern-helper/prompt-profiles-sources';
import * as wiModule from '@sillytavern/scripts/world-info';
import { buildPromptLlmRuntimeContent } from '@/services/prompt-profiles/runtime';
import type { PromptLlmContext, PromptLlmSettings, PromptProfilesSettings } from '@/constants/novelai';

function createMockWIPromptResult(worldInfoString: string) {
  return {
    worldInfoString,
    worldInfoBefore: '',
    worldInfoAfter: '',
    worldInfoExamples: [],
    worldInfoDepth: [],
    anBefore: [],
    anAfter: [],
    outletEntries: {},
  };
}

describe('auto-runtime service', () => {
  describe('safeRenderPromptTemplate', () => {
    it('returns empty string for non-string input or empty text', async () => {
      expect(await safeRenderPromptTemplate('' as any)).toBe('');
      expect(await safeRenderPromptTemplate(null as any)).toBe('');
      expect(await safeRenderPromptTemplate(undefined as any)).toBe('');
    });

    it('returns original content immediately when no EJS tag is present (fast path)', async () => {
      const normalText = 'A simple blonde warrior with blue eyes.';
      const result = await safeRenderPromptTemplate(normalText);
      expect(result).toBe(normalText);
    });

    it('returns raw text safely when ST-Prompt-Template is not installed (EjsTemplate undefined)', async () => {
      const originalEjsTemplate = (globalThis as any).EjsTemplate;
      try {
        delete (globalThis as any).EjsTemplate;
        const ejsText = '<% if (true) { %>Blonde hair<% } %>';
        const result = await safeRenderPromptTemplate(ejsText);
        expect(result).toBe(ejsText);
      } finally {
        (globalThis as any).EjsTemplate = originalEjsTemplate;
      }
    });

    it('uses EjsTemplate.evalTemplate to render template when plugin is available', async () => {
      const originalEjsTemplate = (globalThis as any).EjsTemplate;
      try {
        const mockEval = vi.fn().mockResolvedValue('Evaluated Result: Blonde Hair');
        (globalThis as any).EjsTemplate = { evalTemplate: mockEval };

        const ejsText = '<% if (true) { %>Blonde hair<% } %>';
        const result = await safeRenderPromptTemplate(ejsText);

        expect(result).toBe('Evaluated Result: Blonde Hair');
        expect(mockEval).toHaveBeenCalledWith(ejsText, null);
      } finally {
        (globalThis as any).EjsTemplate = originalEjsTemplate;
      }
    });

    it('falls back to raw text safely without throwing when EjsTemplate.evalTemplate errors', async () => {
      const originalEjsTemplate = (globalThis as any).EjsTemplate;
      try {
        const mockEval = vi.fn().mockRejectedValue(new Error('Syntax error in user EJS'));
        (globalThis as any).EjsTemplate = { evalTemplate: mockEval };

        const ejsText = '<% syntax error %>';
        const result = await safeRenderPromptTemplate(ejsText);

        expect(result).toBe(ejsText);
      } finally {
        (globalThis as any).EjsTemplate = originalEjsTemplate;
      }
    });
  });

  describe('buildAutoWorldInfoChatMessages', () => {
    it('returns empty array when currentMessageIndex is null, undefined, or <= 0', () => {
      expect(buildAutoWorldInfoChatMessages({ historyFloorCount: 5, currentMessageIndex: null })).toEqual([]);
      expect(buildAutoWorldInfoChatMessages({ historyFloorCount: 5, currentMessageIndex: 0 })).toEqual([]);
      expect(buildAutoWorldInfoChatMessages({ historyFloorCount: 0, currentMessageIndex: 5 })).toEqual([]);
    });

    it('filters system and hidden messages while retaining user and assistant messages', () => {
      const mockMessages = [
        { message_id: 1, name: 'System', role: 'system', is_hidden: false, message: 'System message' },
        { message_id: 2, name: 'User', role: 'user', is_hidden: false, message: 'Hello AI' },
        { message_id: 3, name: 'Assistant', role: 'assistant', is_hidden: true, message: 'Hidden secret' },
        { message_id: 4, name: 'Assistant', role: 'assistant', is_hidden: false, message: 'Hello User' },
      ];

      const getChatMessages = vi.fn().mockReturnValue(mockMessages);
      const formatAsTavernRegexedString = vi.fn().mockImplementation((text: string) => text);

      const result = buildAutoWorldInfoChatMessages({
        historyFloorCount: 5,
        currentMessageIndex: 5,
        depthBaseline: 4,
        getChatMessages,
        formatAsTavernRegexedString,
        includeNames: true,
      });

      // Depth order: message 4 has depth 0 (depthBaseline - 4), message 2 has depth 2 (depthBaseline - 2).
      // Reversed for ST world info buffer: [msg4, msg2]
      expect(result).toEqual(['Assistant: Hello User', 'User: Hello AI']);
      expect(formatAsTavernRegexedString).toHaveBeenCalledWith('Hello User', 'ai_output', 'prompt', { depth: 0 });
      expect(formatAsTavernRegexedString).toHaveBeenCalledWith('Hello AI', 'user_input', 'prompt', { depth: 2 });
    });

    it('formats messages without name prefixes when includeNames is false', () => {
      const mockMessages = [
        { message_id: 1, name: 'User', role: 'user', is_hidden: false, message: 'Draw a dragon' },
      ];

      const result = buildAutoWorldInfoChatMessages({
        historyFloorCount: 1,
        currentMessageIndex: 2,
        depthBaseline: 1,
        getChatMessages: () => mockMessages,
        formatAsTavernRegexedString: (text: string) => text,
        includeNames: false,
      });

      expect(result).toEqual(['Draw a dragon']);
    });
  });

  describe('scanAutoWorldInfo', () => {
    it('returns empty string if chat is empty and descriptions are empty', async () => {
      const result = await scanAutoWorldInfo([]);
      expect(result).toBe('');
    });

    it('calls getWorldInfoPromptFn with dryRun true and passes globalScanData', async () => {
      const getWorldInfoPromptFn = vi.fn().mockResolvedValue(createMockWIPromptResult('  Activated Lore Entry  '));

      const result = await scanAutoWorldInfo(['User: Hello'], {
        characterDescription: 'A brave knight',
        personaDescription: 'A travelling wizard',
        maxContext: 4096,
        getWorldInfoPromptFn,
      });

      expect(result).toBe('Activated Lore Entry');
      expect(getWorldInfoPromptFn).toHaveBeenCalledWith(
        ['User: Hello'],
        4096,
        true,
        expect.objectContaining({
          characterDescription: 'A brave knight',
          personaDescription: 'A travelling wizard',
          trigger: 'normal',
        }),
      );
    });

    it('gracefully catches errors and returns empty string', async () => {
      const getWorldInfoPromptFn = vi.fn().mockRejectedValue(new Error('WI engine crashed'));
      const result = await scanAutoWorldInfo(['User: Hello'], { getWorldInfoPromptFn });
      expect(result).toBe('');
    });
  });

  describe('getAutoWorldInfoIncludeNames and getAutoWorldInfoMaxContext', () => {
    it('returns default fallback values when ST module or settings are not available', async () => {
      const includeNames = await getAutoWorldInfoIncludeNames();
      expect(typeof includeNames).toBe('boolean');

      const maxCtx = await getAutoWorldInfoMaxContext();
      expect(maxCtx).toBeGreaterThanOrEqual(1024);
    });
  });

  describe('getAutoUserPersonaDescription', () => {
    it('returns trimmed description only (name no longer injected into body)', () => {
      vi.spyOn(promptProfilesSources, 'getPromptPersonUserPersonaDescription').mockReturnValue('A young traveler.');

      expect(getAutoUserPersonaDescription()).toBe('A young traveler.');

      vi.restoreAllMocks();
    });

    it('returns empty string when description is blank', () => {
      vi.spyOn(promptProfilesSources, 'getPromptPersonUserPersonaDescription').mockReturnValue('   ');

      expect(getAutoUserPersonaDescription()).toBe('');

      vi.restoreAllMocks();
    });
  });

  describe('buildAutoParticipantContext', () => {
    it('writes persona name into <person name="..."> attribute and keeps description as body', () => {
      const output = buildAutoParticipantContext({
        characterDescription: 'Hero character info',
        personaName: 'Alice',
        personaDescription: 'User persona info',
        worldInfoString: 'World lore info',
      });

      expect(output).toBe(
        '<character_description>\nHero character info\n</character_description>\n\n<person name="Alice">\nUser persona info\n</person>\n\n<world_info>\nWorld lore info\n</world_info>',
      );
    });

    it('escapes special XML characters in persona name attribute', () => {
      const output = buildAutoParticipantContext({
        personaName: 'A & B "C" <D>',
        personaDescription: 'desc',
      });

      expect(output).toBe('<person name="A &amp; B &quot;C&quot; &lt;D&gt;">\ndesc\n</person>');
    });

    it('emits empty <person> body when only name is provided', () => {
      expect(buildAutoParticipantContext({ personaName: 'Alice' })).toBe('<person name="Alice"></person>');
    });

    it('emits unnamed <person> when only description is provided', () => {
      expect(buildAutoParticipantContext({ personaDescription: 'Anonymous traveler' })).toBe(
        '<person>\nAnonymous traveler\n</person>',
      );
    });

    it('omits empty sections', () => {
      const output = buildAutoParticipantContext({
        characterDescription: 'Hero only',
        personaDescription: '',
        worldInfoString: '   ',
      });

      expect(output).toBe('<character_description>\nHero only\n</character_description>');
    });

    it('returns empty string when all sections are empty', () => {
      expect(buildAutoParticipantContext({})).toBe('');
    });
  });

  describe('buildAutoParticipantRuntimeContent', () => {
    it('assembles character, persona, and world info into participant content', async () => {
      vi.spyOn(promptProfilesSources, 'getPromptPersonCharacterDescription').mockResolvedValue('Warrior Princess');
      vi.spyOn(promptProfilesSources, 'getPromptPersonUserPersonaDescription').mockReturnValue('Brave Traveler');
      vi.spyOn(wiModule, 'getWorldInfoPrompt').mockResolvedValue(createMockWIPromptResult('Kingdom of Eldoria'));

      const context: PromptLlmContext = {
        historyParagraphs: ['Floor 1', 'Floor 2'],
        focusParagraph: 'She swung her blade.',
        specialRequest: '',
        messageIndex: 3,
      };

      const result = await buildAutoParticipantRuntimeContent(context, { historyFloorCount: 2 });

      expect(result.historyContent).toBe('Floor 1\n\nFloor 2');
      expect(result.focusParagraphContent).toBe('She swung her blade.');
      expect(result.participantContent).toContain('<character_description>\nWarrior Princess\n</character_description>');
      expect(result.participantContent).toContain('<person');
      expect(result.participantContent).toContain('\nBrave Traveler\n</person>');
      expect(result.participantContent).toContain('<world_info>\nKingdom of Eldoria\n</world_info>');

      vi.restoreAllMocks();
    });

    it('renders EJS templates in character description and world info when EjsTemplate is present', async () => {
      const originalEjsTemplate = (globalThis as any).EjsTemplate;
      try {
        (globalThis as any).EjsTemplate = {
          evalTemplate: vi.fn().mockImplementation(async (code: string) => {
            if (code.includes('EJS_WI')) return 'Cleaned World Info Lore';
            if (code.includes('EJS_CHAR')) return 'Cleaned Character Description';
            return code;
          }),
        };

        vi.spyOn(promptProfilesSources, 'getPromptPersonCharacterDescription').mockResolvedValue('Character with <% EJS_CHAR %>');
        vi.spyOn(promptProfilesSources, 'getPromptPersonUserPersonaDescription').mockReturnValue('User Persona');
        vi.spyOn(wiModule, 'getWorldInfoPrompt').mockResolvedValue(createMockWIPromptResult('Raw WI with <% EJS_WI %>'));

        const context: PromptLlmContext = {
          historyParagraphs: ['Floor 1'],
          focusParagraph: 'Focus text',
          specialRequest: '',
          messageIndex: 2,
        };

        const result = await buildAutoParticipantRuntimeContent(context, { historyFloorCount: 1 });

        expect(result.participantContent).toContain('<character_description>\nCleaned Character Description\n</character_description>');
        expect(result.participantContent).toContain('<world_info>\nCleaned World Info Lore\n</world_info>');
      } finally {
        (globalThis as any).EjsTemplate = originalEjsTemplate;
        vi.restoreAllMocks();
      }
    });
  });

  describe('buildPromptLlmRuntimeContent autoCharacterInfo branching', () => {
    const mockContext: PromptLlmContext = {
      historyParagraphs: ['Message 1', 'Message 2'],
      focusParagraph: 'Focus Paragraph Text',
      specialRequest: 'Special request detail',
      messageIndex: 3,
    };

    const mockPromptProfiles: PromptProfilesSettings = {
      profiles: [
        {
          id: 'person-1',
          name: 'Manual Person',
          kind: 'character',
          enabled: true,
          insertMode: 'always',
          triggerKeywords: [],
          staticTags: '1girl, solo',
          templateEntries: [
            {
              id: 'entry-1',
              title: 'Entry',
              enabled: true,
              content: 'Manual Profile Content',
            },
          ],
        },
      ],
    };

    it('uses manual promptProfiles when autoCharacterInfo is false or omitted', async () => {
      const result = await buildPromptLlmRuntimeContent(mockContext, mockPromptProfiles);
      expect(result.participantContent).toContain('Manual Profile Content');
      expect(result.focusParagraphContent).toBe('Focus Paragraph Text');
      expect(result.specialRequestContent).toBe('Special request detail');
    });

    it('merges auto participant XML and manual promptProfiles, placing manual profiles after auto participant content when autoCharacterInfo is true', async () => {
      vi.spyOn(promptProfilesSources, 'getPromptPersonCharacterDescription').mockResolvedValue('Knight Char');
      vi.spyOn(promptProfilesSources, 'getPromptPersonUserPersonaDescription').mockReturnValue('Player Persona');
      vi.spyOn(wiModule, 'getWorldInfoPrompt').mockResolvedValue(createMockWIPromptResult('Magic Realm'));

      const settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory' | 'autoCharacterInfo'> = {
        historyFloorCount: 2,
        ignoreUserMessagesInHistory: false,
        autoCharacterInfo: true,
      };

      const result = await buildPromptLlmRuntimeContent(mockContext, mockPromptProfiles, settings);
      expect(result.participantContent).toContain('<character_description>\nKnight Char\n</character_description>');
      expect(result.participantContent).toContain('<person');
      expect(result.participantContent).toContain('\nPlayer Persona\n</person>');
      expect(result.participantContent).toContain('<world_info>\nMagic Realm\n</world_info>');
      expect(result.participantContent).toContain('Manual Profile Content');

      // Verify that auto content comes before manual profile content
      const autoIndex = result.participantContent.indexOf('<world_info>');
      const manualIndex = result.participantContent.indexOf('Manual Profile Content');
      expect(autoIndex).toBeLessThan(manualIndex);

      expect(result.focusParagraphContent).toBe('Focus Paragraph Text');
      expect(result.specialRequestContent).toBe('Special request detail');

      vi.restoreAllMocks();
    });
  });
});
