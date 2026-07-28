import { describe, it, expect } from 'vitest';
import {
  isValidDotSegment,
  formatValueSummary,
  getNodeKind,
  buildVariableTree,
  buildVariableMacro,
  filterVariableTreeNodes,
  collectExpandedKeys,
} from '@/panel/components/prompt-variable-picker';

describe('prompt-variable-picker pure functions', () => {
  it('validates dot segments correctly', () => {
    expect(isValidDotSegment('user')).toBe(true);
    expect(isValidDotSegment('0')).toBe(true);
    expect(isValidDotSegment('my_var')).toBe(true);

    expect(isValidDotSegment('')).toBe(false);
    expect(isValidDotSegment('user.name')).toBe(false);
    expect(isValidDotSegment('a b')).toBe(false);
    expect(isValidDotSegment('a::b')).toBe(false);
  });

  it('formats value summaries for various types', () => {
    expect(getNodeKind('hello')).toBe('string');
    expect(getNodeKind(123)).toBe('number');
    expect(getNodeKind(true)).toBe('boolean');
    expect(getNodeKind(null)).toBe('null');
    expect(getNodeKind(undefined)).toBe('undefined');
    expect(getNodeKind([])).toBe('array');
    expect(getNodeKind({})).toBe('object');

    expect(formatValueSummary(null)).toBe('null');
    expect(formatValueSummary(undefined)).toBe('undefined');
    expect(formatValueSummary([1, 2, 3])).toBe('');
    expect(formatValueSummary({ a: 1, b: 2 })).toBe('');
    expect(formatValueSummary('hello world')).toBe('"hello world"');
    expect(formatValueSummary(42)).toBe('42');
    expect(formatValueSummary(true)).toBe('true');
  });

  it('builds variable tree from raw data', () => {
    const raw = {
      user: {
        profile: {
          name: 'Alice',
          tags: ['admin', 'dev'],
        },
      },
    };

    const tree = buildVariableTree(raw, 'global');
    expect(tree).toHaveLength(1);
    const userNode = tree[0];
    expect(userNode.key).toBe('global:["user"]');
    expect(userNode.path).toBe('user');
    expect(userNode.kind).toBe('object');
    expect(userNode.children).toHaveLength(1);

    const profileNode = userNode.children![0];
    expect(profileNode.path).toBe('user.profile');

    const tagsNode = profileNode.children![1];
    expect(tagsNode.path).toBe('user.profile.tags');
    expect(tagsNode.kind).toBe('array');
    expect(tagsNode.children).toHaveLength(2);
    expect(tagsNode.children![0].path).toBe('user.profile.tags.0');
  });

  it('generates standard macro format', () => {
    expect(buildVariableMacro('global', ['user', 'profile', 'name'])).toBe(
      '{{get_global_variable::user.profile.name}}',
    );
    expect(buildVariableMacro('character', ['inventory', '0'])).toBe(
      '{{get_character_variable::inventory.0}}',
    );
    expect(buildVariableMacro('message', ['stat', 'hp'])).toBe(
      '{{get_message_variable::stat.hp}}',
    );
  });

  it('disables non-insertable nodes with invalid dot keys', () => {
    const raw = {
      'invalid.key': { child: 1 },
    };

    const tree = buildVariableTree(raw, 'global');
    const invalidNode = tree[0];
    expect(invalidNode.insertable).toBe(false);
    expect(invalidNode.disableReason).toBeDefined();

    const childNode = invalidNode.children![0];
    expect(childNode.insertable).toBe(false);
  });

  it('filters variable tree preserving parent subtree when parent matches', () => {
    const raw = {
      user: {
        name: 'Alice',
        age: 20,
      },
      system: {
        version: '1.0',
      },
    };

    const tree = buildVariableTree(raw, 'global');
    const filtered = filterVariableTreeNodes(tree, 'user');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toBe('user');
    expect(filtered[0].children).toHaveLength(2);
  });

  it('filters variable tree keeping ancestor chain for nested matches', () => {
    const raw = {
      user: {
        profile: {
          targetKey: 'found',
        },
        other: 'ignored',
      },
      system: 'ignored',
    };

    const tree = buildVariableTree(raw, 'global');
    const filtered = filterVariableTreeNodes(tree, 'targetKey');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toBe('user');
    expect(filtered[0].children).toHaveLength(1);
    expect(filtered[0].children![0].label).toBe('profile');
    expect(filtered[0].children![0].children![0].label).toBe('targetKey');
  });

  it('collects expanded keys for all container nodes', () => {
    const raw = {
      a: { b: 1 },
      c: [10, 20],
    };
    const tree = buildVariableTree(raw, 'chat');
    const keys = collectExpandedKeys(tree);
    expect(keys).toEqual({
      'chat:["a"]': true,
      'chat:["c"]': true,
    });
  });
});
