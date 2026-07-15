import { describe, expect, it } from 'vitest';
import type { ElementT } from '../data/elements';
import { questProgress, questStatus } from './quests';

function questEl(data: Record<string, unknown>): ElementT {
  return {
    id: '1',
    campaignId: 'c1',
    type: 'quest',
    name: 'Test Quest',
    body: null,
    tags: [],
    links: [],
    data,
    playerVisible: false,
    secrets: '',
    soundtrack: null,
    version: 1,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('questProgress', () => {
  it('returns null for non-quest elements', () => {
    const el = { ...questEl({ objectives: 'x done\nnot done' }), type: 'npc' };
    expect(questProgress(el)).toBeNull();
  });

  it('returns null when objectives is missing, blank, or whitespace-only', () => {
    expect(questProgress(questEl({}))).toBeNull();
    expect(questProgress(questEl({ objectives: '' }))).toBeNull();
    expect(questProgress(questEl({ objectives: '   \n  ' }))).toBeNull();
  });

  it('counts 0 done of N when no lines are marked', () => {
    const el = questEl({ objectives: 'find the sword\ndefeat the dragon' });
    expect(questProgress(el)).toEqual({ done: 0, total: 2 });
  });

  it('counts some-done correctly ("x " prefix, case-insensitive)', () => {
    const el = questEl({ objectives: 'x find the sword\nX defeat the dragon\nreturn home' });
    expect(questProgress(el)).toEqual({ done: 2, total: 3 });
  });

  it('counts all-done when every line is marked', () => {
    const el = questEl({ objectives: 'x find the sword\nx defeat the dragon' });
    expect(questProgress(el)).toEqual({ done: 2, total: 2 });
  });

  it('ignores blank lines and requires a space after the x marker', () => {
    const el = questEl({ objectives: 'x find the sword\n\nxdefeat the dragon' });
    // "xdefeat the dragon" has no space after x, so it should not count as done.
    expect(questProgress(el)).toEqual({ done: 1, total: 2 });
  });
});

describe('questStatus', () => {
  it('returns the stored status', () => {
    expect(questStatus(questEl({ status: 'active' }))).toBe('active');
  });

  it('defaults to "rumored" when status is missing', () => {
    expect(questStatus(questEl({}))).toBe('rumored');
  });
});
