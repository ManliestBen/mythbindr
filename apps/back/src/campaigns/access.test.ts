import { describe, expect, it } from 'vitest';
import { roleAtLeast } from './access';

describe('roleAtLeast', () => {
  it('covers the full owner>editor>viewer matrix', () => {
    expect(roleAtLeast('owner', 'viewer')).toBe(true);
    expect(roleAtLeast('owner', 'editor')).toBe(true);
    expect(roleAtLeast('owner', 'owner')).toBe(true);
    expect(roleAtLeast('editor', 'viewer')).toBe(true);
    expect(roleAtLeast('editor', 'editor')).toBe(true);
    expect(roleAtLeast('editor', 'owner')).toBe(false);
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast('viewer', 'owner')).toBe(false);
  });
});
