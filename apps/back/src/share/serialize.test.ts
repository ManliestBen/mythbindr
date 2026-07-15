import { describe, expect, it } from 'vitest';
import type { ElementDoc } from '../models/Element';
import { sharedElement } from './serialize';

function fixture(overrides: Partial<ElementDoc> = {}): ElementDoc {
  return {
    _id: '65aabbccddeeff0011223300',
    type: 'npc',
    name: 'Test Element',
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Meet ' },
            {
              type: 'mention',
              attrs: { id: '65aabbccddeeff0011223344', label: 'Villain' },
            },
            { type: 'text', text: ' at the tavern.' },
          ],
        },
      ],
    },
    tags: ['tag1'],
    data: {},
    soundtrack: 'ominous-theme.mp3',
    secrets: 'HIDDEN',
    links: [{ targetId: 'someid', source: 'mention' }],
    playerVisible: true,
    updatedBy: 'u1',
    version: 3,
    ...overrides,
  } as unknown as ElementDoc;
}

describe('sharedElement', () => {
  it('returns exactly the whitelisted key set — future-proofing guardrail', () => {
    const out = sharedElement(fixture());
    expect(Object.keys(out).sort()).toEqual(['body', 'data', 'id', 'name', 'soundtrack', 'tags', 'type']);
  });

  it('never leaks secrets, links, playerVisible, or updatedBy', () => {
    const out = sharedElement(fixture());
    expect(out).not.toHaveProperty('secrets');
    expect(out).not.toHaveProperty('links');
    expect(out).not.toHaveProperty('playerVisible');
    expect(out).not.toHaveProperty('updatedBy');
    expect(out).not.toHaveProperty('version');
  });

  it('rewrites mention nodes to plain text and strips the mentioned id entirely', () => {
    const out = sharedElement(fixture());
    const json = JSON.stringify(out);
    expect(json).not.toContain('mention');
    expect(json).not.toContain('65aabbccddeeff0011223344');
    expect(json).toContain('@Villain');
  });

  it('strips quest.data.consequences but keeps other data keys', () => {
    const out = sharedElement(
      fixture({
        type: 'quest',
        data: { consequences: 'secret fallout', objectives: ['find the mcguffin'] },
      }),
    );
    expect(out.data).not.toHaveProperty('consequences');
    expect(out.data).toEqual({ objectives: ['find the mcguffin'] });
  });

  it('strips encounter.data combatants/outcome/trigger but keeps other keys', () => {
    const out = sharedElement(
      fixture({
        type: 'encounter',
        data: {
          combatants: [{ name: 'Goblin' }],
          outcome: 'the party wins',
          trigger: 'when players enter the room',
          description: 'A dank cave',
        },
      }),
    );
    expect(out.data).not.toHaveProperty('combatants');
    expect(out.data).not.toHaveProperty('outcome');
    expect(out.data).not.toHaveProperty('trigger');
    expect(out.data).toEqual({ description: 'A dank cave' });
  });

  it('keeps full data for types with no GM-only fields (e.g. npc)', () => {
    const data = { stats: { hp: 10 }, notes: 'flavor text' };
    const out = sharedElement(fixture({ type: 'npc', data }));
    expect(out.data).toEqual(data);
  });
});
