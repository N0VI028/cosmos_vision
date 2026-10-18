import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import StaticTagsDraftResult from '@/panel/components/StaticTagsDraftResult.vue';
import type { PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';

describe('StaticTagsDraftResult component', () => {
  function createWrapper(initialDraft: PromptPersonTagsDraft = { positiveTags: '1girl, blue eyes', negativeTags: 'bad hands' }) {
    return mount(StaticTagsDraftResult, {
      props: {
        draft: initialDraft,
        'onUpdate:draft': (val: PromptPersonTagsDraft) => {
          Object.assign(initialDraft, val);
        },
      },
      global: {
        plugins: [PrimeVue],
      },
    });
  }

  /** 取第 index 个区块（0=正面，1=负面）内的指定文字按钮 */
  function getSectionButton(wrapper: ReturnType<typeof createWrapper>, sectionIndex: number, label: string) {
    const section = wrapper.findAll('.cv-field')[sectionIndex];
    return section.findAllComponents({ name: 'Button' }).find(b => b.text() === label);
  }

  it('renders two sections each with its own copy/replace/append buttons', () => {
    const wrapper = createWrapper();
    const sections = wrapper.findAll('.cv-field');
    expect(sections).toHaveLength(2);
    expect(sections[0].text()).toContain('固定正面 tag');
    expect(sections[1].text()).toContain('固定负面 tag');

    for (const section of sections) {
      const labels = section.findAllComponents({ name: 'Button' }).map(b => b.text());
      expect(labels).toEqual(['复制', '替换', '追加']);
    }
  });

  it('emits replace payload with only positive when positive replace clicked', async () => {
    const wrapper = createWrapper();
    await getSectionButton(wrapper, 0, '替换')?.trigger('click');

    expect(wrapper.emitted('replace')).toBeTruthy();
    expect(wrapper.emitted('replace')![0][0]).toEqual({
      positive: '1girl, blue eyes',
      negative: undefined,
    });
  });

  it('emits append payload with only negative when negative append clicked', async () => {
    const wrapper = createWrapper();
    await getSectionButton(wrapper, 1, '追加')?.trigger('click');

    expect(wrapper.emitted('append')).toBeTruthy();
    expect(wrapper.emitted('append')![0][0]).toEqual({
      positive: undefined,
      negative: 'bad hands',
    });
  });

  it('emits copy with the text of its own section', async () => {
    const wrapper = createWrapper();
    await getSectionButton(wrapper, 1, '复制')?.trigger('click');

    expect(wrapper.emitted('copy')).toBeTruthy();
    expect(wrapper.emitted('copy')![0][0]).toBe('bad hands');
  });

  it('disables all buttons of an empty section while keeping the other section usable', () => {
    const wrapper = createWrapper({ positiveTags: 'solo', negativeTags: '' });

    for (const label of ['复制', '替换', '追加']) {
      const positiveBtn = getSectionButton(wrapper, 0, label);
      const negativeBtn = getSectionButton(wrapper, 1, label);
      expect((positiveBtn?.element as HTMLButtonElement).disabled).toBe(false);
      expect((negativeBtn?.element as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('does not emit when a disabled empty-section button is clicked', async () => {
    const wrapper = createWrapper({ positiveTags: '', negativeTags: '' });
    await getSectionButton(wrapper, 0, '替换')?.trigger('click');
    await getSectionButton(wrapper, 1, '追加')?.trigger('click');

    expect(wrapper.emitted('replace')).toBeFalsy();
    expect(wrapper.emitted('append')).toBeFalsy();
  });
});
