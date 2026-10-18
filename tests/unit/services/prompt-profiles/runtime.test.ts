import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT_PERSON_FIXED_NEGATIVE_TAGS_BLOCK,
  DEFAULT_PROMPT_PERSON_FIXED_POSITIVE_TAGS_BLOCK,
  PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN,
  PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN,
  PROMPT_LLM_FIXED_TAGS_TOKEN,
} from '@/constants/default-settings';
import type { PromptPerson } from '@/constants/novelai';
import {
  appendFixedNegativeTagsBlockToPerson,
  appendFixedPositiveTagsBlockToPerson,
  createDefaultPromptPersonTemplateEntries,
  createPromptPerson,
  hasUnreferencedFixedNegativeTags,
  hasUnreferencedFixedTags,
  replacePromptPersonTemplateTokens,
  stripEmptyFixedNegativeTagsBlocks,
  stripEmptyFixedTagsBlocks,
} from '@/services/prompt-profiles/runtime';

describe('prompt-profiles runtime', () => {
  describe('createPromptPerson', () => {
    it('creates person with default empty staticTags and negativeTags', () => {
      const person = createPromptPerson('character', 'Alice');
      expect(person.name).toBe('Alice');
      expect(person.staticTags).toBe('');
      expect(person.negativeTags).toBe('');
      expect(person.templateEntries).toHaveLength(2);
    });
  });

  describe('createDefaultPromptPersonTemplateEntries', () => {
    it('contains negative block after positive block with all three key elements', () => {
      const entries = createDefaultPromptPersonTemplateEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].title).toBe('人物开始');
      expect(entries[1].title).toBe('人物结束');

      const content = entries[0].content;
      const positiveBlockIndex = content.indexOf('<fixed_positive_tags>');
      const negativeBlockIndex = content.indexOf('<fixed_negative_tags>');
      expect(positiveBlockIndex).toBeGreaterThan(-1);
      expect(negativeBlockIndex).toBeGreaterThan(-1);
      expect(negativeBlockIndex).toBeGreaterThan(positiveBlockIndex);

      // 块语义校验：负面原样体现 / 无需负面时忽略
      expect(content).toContain('必须原样体现在最终负面提示词中');
      expect(content).toContain('忽略本块');
      expect(content).toContain(PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN);
      // 冲突解决规则同样覆盖负面
      expect(content).toContain('该优先级同样适用于 <fixed_negative_tags>');
    });
  });

  describe('replacePromptPersonTemplateTokens & stripEmptyBlocks', () => {
    it('replaces both staticTags and negativeTags when both are provided', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: 'blue eyes, blonde hair',
        negativeTags: 'red eyes, short hair',
      };
      const template = `Prefix\n${DEFAULT_PROMPT_PERSON_FIXED_POSITIVE_TAGS_BLOCK}\n${DEFAULT_PROMPT_PERSON_FIXED_NEGATIVE_TAGS_BLOCK}\nSuffix`;
      const result = replacePromptPersonTemplateTokens(template, person);

      expect(result).toContain('blue eyes, blonde hair');
      expect(result).toContain('red eyes, short hair');
      expect(result).not.toContain(PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN);
      expect(result).not.toContain(PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN);
    });

    it('replaces legacy fixed_tags token for existing templates', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: 'blue eyes',
        negativeTags: '',
      };
      const result = replacePromptPersonTemplateTokens(`X ${PROMPT_LLM_FIXED_TAGS_TOKEN} Y`, person);
      expect(result).toBe('X blue eyes Y');
    });

    it('strips empty fixed_positive_tags block when staticTags is empty', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: '   ',
        negativeTags: 'bad anatomy',
      };
      const template = `<fixed_positive_tags>Fixed: ${PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN}</fixed_positive_tags>\n<fixed_negative_tags>Neg: ${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags>`;
      const result = replacePromptPersonTemplateTokens(template, person);

      expect(result).not.toContain('<fixed_positive_tags>');
      expect(result).not.toContain('Fixed:');
      expect(result).toContain('<fixed_negative_tags>Neg: bad anatomy</fixed_negative_tags>');
    });

    it('strips empty legacy fixed_tags block when staticTags is empty', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: '   ',
        negativeTags: 'bad anatomy',
      };
      const template = `<fixed_tags>Fixed: ${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags>\n<fixed_negative_tags>Neg: ${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags>`;
      const result = replacePromptPersonTemplateTokens(template, person);

      expect(result).not.toContain('<fixed_tags>');
      expect(result).not.toContain('Fixed:');
      expect(result).toContain('<fixed_negative_tags>Neg: bad anatomy</fixed_negative_tags>');
    });

    it('strips empty fixed_negative_tags block when negativeTags is empty', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: 'masterpiece',
        negativeTags: '',
      };
      const template = `<fixed_tags>Fixed: ${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags>\n<fixed_negative_tags>Neg: ${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags>`;
      const result = replacePromptPersonTemplateTokens(template, person);

      expect(result).toContain('<fixed_tags>Fixed: masterpiece</fixed_tags>');
      expect(result).not.toContain('<fixed_negative_tags>');
      expect(result).not.toContain('Neg:');
    });

    it('strips both blocks when both staticTags and negativeTags are empty', () => {
      const person: PromptPerson = {
        ...createPromptPerson('character', 'Bob'),
        staticTags: '',
        negativeTags: '',
      };
      const template = `Header\n<fixed_tags>${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags>\n<fixed_negative_tags>${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags>\nFooter`;
      const result = replacePromptPersonTemplateTokens(template, person);

      expect(result).not.toContain('<fixed_tags>');
      expect(result).not.toContain('<fixed_negative_tags>');
      expect(result).toContain('Header');
      expect(result).toContain('Footer');
    });

    it('direct strip functions correctly clean target blocks', () => {
      const text = `A <fixed_tags>info ${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags> B <fixed_negative_tags>neg ${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags> C`;
      expect(stripEmptyFixedTagsBlocks(text)).toBe(`A  B <fixed_negative_tags>neg ${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}</fixed_negative_tags> C`);
      expect(stripEmptyFixedNegativeTagsBlocks(text)).toBe(`A <fixed_tags>info ${PROMPT_LLM_FIXED_TAGS_TOKEN}</fixed_tags> B  C`);
    });
  });

  describe('unreferenced tags detection', () => {
    it('hasUnreferencedFixedTags returns true only when staticTags non-empty and no enabled entry references token', () => {
      const person = createPromptPerson('character', 'Charlie');
      person.staticTags = '';
      expect(hasUnreferencedFixedTags(person)).toBe(false);

      person.staticTags = 'cat ears';
      // Default template contains {{fixed_positive_tags}} in enabled '人物开始' entry
      expect(hasUnreferencedFixedTags(person)).toBe(false);

      // Disable the entry containing the token
      person.templateEntries[0].enabled = false;
      expect(hasUnreferencedFixedTags(person)).toBe(true);

      // 仅含旧版宏的启用条目同样视为已引用（存量模板兼容）
      person.templateEntries[0].enabled = true;
      person.templateEntries[0].content = 'legacy only: {{fixed_tags}}';
      expect(hasUnreferencedFixedTags(person)).toBe(false);

      // Clear content of entry
      person.templateEntries[0].content = 'no token here';
      expect(hasUnreferencedFixedTags(person)).toBe(true);
    });

    it('hasUnreferencedFixedNegativeTags returns true only when negativeTags non-empty and no enabled entry references token', () => {
      const person = createPromptPerson('character', 'Charlie');
      person.negativeTags = '';
      expect(hasUnreferencedFixedNegativeTags(person)).toBe(false);

      person.negativeTags = 'dog ears';
      // Default template contains {{fixed_negative_tags}} in enabled '人物开始' entry
      expect(hasUnreferencedFixedNegativeTags(person)).toBe(false);

      // Disable entry
      person.templateEntries[0].enabled = false;
      expect(hasUnreferencedFixedNegativeTags(person)).toBe(true);

      // Content without negative token
      person.templateEntries[0].enabled = true;
      person.templateEntries[0].content = 'only fixed_tags: {{fixed_tags}}';
      expect(hasUnreferencedFixedNegativeTags(person)).toBe(true);
    });
  });

  describe('append helpers', () => {
    it('appends block into existing start entry and returns patched', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries[0].content = '<person name="x">';
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN);
      expect(person.templateEntries[0].content).toContain('<fixed_positive_tags>');
    });

    it('recreates default start entry when it was deleted (structure restored, not appended after </person>)', () => {
      const person = createPromptPerson('character', 'Dan');
      // 模拟"人物开始"被删、仅剩"人物结束"
      person.templateEntries = [person.templateEntries[1]];
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('recreated');
      expect(person.templateEntries).toHaveLength(2);
      expect(person.templateEntries[0].title).toBe('人物开始');
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN);
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN);
      expect(person.templateEntries[1].title).toBe('人物结束');
    });

    it('restores full default pair when templateEntries is empty', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries = [];
      const result = appendFixedNegativeTagsBlockToPerson(person);
      expect(result).toBe('recreated');
      expect(person.templateEntries).toHaveLength(2);
      expect(person.templateEntries[0].title).toBe('人物开始');
      expect(person.templateEntries[1].title).toBe('人物结束');
    });

    it('enables disabled start entry and appends missing block', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries[0].enabled = false;
      person.templateEntries[0].content = '<person name="x">';
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].enabled).toBe(true);
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN);
    });

    it('does not duplicate block when new token already referenced', () => {
      const person = createPromptPerson('character', 'Dan');
      const before = person.templateEntries[0].content;
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].content).toBe(before);
    });

    it('does not duplicate block when only legacy token referenced', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries[0].content = '<person name="x">{{fixed_tags}}';
      const before = person.templateEntries[0].content;
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].content).toBe(before);
    });

    it('hits renamed start entry by content detection', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries[0].title = '开场';
      person.templateEntries[0].content = '<person name="x">';
      const result = appendFixedPositiveTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN);
    });

    it('appends fixed negative tags block into start entry', () => {
      const person = createPromptPerson('character', 'Dan');
      person.templateEntries[0].content = '<person name="x">';
      const result = appendFixedNegativeTagsBlockToPerson(person);
      expect(result).toBe('patched');
      expect(person.templateEntries[0].content).toContain(PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN);
      expect(person.templateEntries[0].content).toContain('<fixed_negative_tags>');
    });
  });
});
