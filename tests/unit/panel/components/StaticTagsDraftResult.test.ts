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

  /** 取第 index 个区块（0=正面，1=负面）内的全部 tag 徽章元素 */
  function getSectionBadges(wrapper: ReturnType<typeof createWrapper>, sectionIndex: number) {
    const section = wrapper.findAll('.cv-field')[sectionIndex];
    return section.findAll('.cv-tag-badge');
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

  it('renders tags as clickable badges normalized by commas, fullwidth commas and newlines', () => {
    const wrapper = createWrapper({
      positiveTags: '1girl, blue eyes，long hair\nmasterpiece\r\nsolo',
      negativeTags: '',
    });

    const badges = getSectionBadges(wrapper, 0);
    expect(badges).toHaveLength(5);
    expect(badges.map(b => b.text())).toEqual(['1girl', 'blue eyes', 'long hair', 'masterpiece', 'solo']);
  });

  it('emits replace payload with only positive when positive replace clicked with default all-selected', async () => {
    const wrapper = createWrapper();
    await getSectionButton(wrapper, 0, '替换')?.trigger('click');

    expect(wrapper.emitted('replace')).toBeTruthy();
    expect(wrapper.emitted('replace')![0][0]).toEqual({
      positive: '1girl, blue eyes',
      negative: undefined,
    });
  });

  it('emits append payload with only negative when negative append clicked with default all-selected', async () => {
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

  it('excludes deselected tag when appending or replacing after clicking badge', async () => {
    const wrapper = createWrapper({ positiveTags: '1girl, blue eyes, blonde hair', negativeTags: '' });
    const badges = getSectionBadges(wrapper, 0);
    expect(badges).toHaveLength(3);

    // 点击第二个徽章（blue eyes）取消选中
    await badges[1].trigger('click');

    await getSectionButton(wrapper, 0, '追加')?.trigger('click');

    expect(wrapper.emitted('append')).toBeTruthy();
    expect(wrapper.emitted('append')![0][0]).toEqual({
      positive: '1girl, blonde hair',
      negative: undefined,
    });

    // 再次点击恢复选中后替换
    await badges[1].trigger('click');
    await getSectionButton(wrapper, 0, '替换')?.trigger('click');
    expect(wrapper.emitted('replace')![0][0]).toEqual({
      positive: '1girl, blue eyes, blonde hair',
      negative: undefined,
    });
  });

  it('disables all buttons when all tags in section are deselected and prevents emitting', async () => {
    const wrapper = createWrapper({ positiveTags: '1girl, blue eyes', negativeTags: '' });
    const badges = getSectionBadges(wrapper, 0);

    // 全部取消选中
    await badges[0].trigger('click');
    await badges[1].trigger('click');

    for (const label of ['复制', '替换', '追加']) {
      const btn = getSectionButton(wrapper, 0, label);
      expect((btn?.element as HTMLButtonElement).disabled).toBe(true);
    }

    // 禁用态点击不触发任何事件
    await getSectionButton(wrapper, 0, '替换')?.trigger('click');
    await getSectionButton(wrapper, 0, '追加')?.trigger('click');
    await getSectionButton(wrapper, 0, '复制')?.trigger('click');

    expect(wrapper.emitted('replace')).toBeFalsy();
    expect(wrapper.emitted('append')).toBeFalsy();
    expect(wrapper.emitted('copy')).toBeFalsy();
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

  it('resets badge selection to all selected when draft prop is replaced', async () => {
    const wrapper = createWrapper({ positiveTags: '1girl, blue eyes', negativeTags: '' });
    let badges = getSectionBadges(wrapper, 0);

    // 取消选中第一个
    await badges[0].trigger('click');
    await getSectionButton(wrapper, 0, '复制')?.trigger('click');
    expect(wrapper.emitted('copy')![0][0]).toBe('blue eyes');

    // 模拟父组件重新解析后替换 draft
    await wrapper.setProps({
      draft: { positiveTags: 'solo, masterpiece, 1girl', negativeTags: '' },
    });

    badges = getSectionBadges(wrapper, 0);
    expect(badges).toHaveLength(3);

    // 重新变为全选
    await getSectionButton(wrapper, 0, '复制')?.trigger('click');
    expect(wrapper.emitted('copy')![1][0]).toBe('solo, masterpiece, 1girl');
  });
});
