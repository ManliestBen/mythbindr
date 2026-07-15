import { describe, expect, it } from 'vitest';
import type { ElementDoc } from '../models/Element';
import type { SessionDoc } from '../models/Session';
import { sharedElement, sharedSession } from './serialize';

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

function sessionFixture(overrides: Partial<SessionDoc> = {}): SessionDoc {
  return {
    _id: '65aabbccddeeff0011223300',
    campaignId: '65aabbccddeeff0011223301',
    status: 'active',
    sourceEncounterId: null,
    round: 2,
    turnIndex: 1,
    combatants: [
      {
        cid: 'c1',
        name: 'Goblin',
        initiative: 15,
        maxHp: 7,
        currentHp: 3,
        tempHp: 0,
        conditions: [{ name: 'prone', rounds: 2 }],
        deathSaves: { successes: 0, failures: 0 },
        isPlayer: false,
        sourceElementId: 'elid1',
        notes: 'secretly a doppelganger',
      },
      {
        cid: 'c2',
        name: 'Aria',
        initiative: 12,
        maxHp: 20,
        currentHp: 14,
        tempHp: 2,
        conditions: [],
        deathSaves: { successes: 1, failures: 0 },
        isPlayer: true,
        sourceElementId: null,
        notes: '',
      },
    ],
    log: [
      { at: new Date('2026-07-14T00:00:00Z'), kind: 'roll', text: 'Aria rolls 18 to hit', by: 'Aria' },
      { at: new Date('2026-07-14T00:01:00Z'), kind: 'note', text: 'The goblin is a doppelganger', by: 'GM' },
      { at: new Date('2026-07-14T00:02:00Z'), kind: 'event', text: 'Round 2 begins', by: '' },
    ],
    startedBy: 'u1',
    endedAt: null,
    createdAt: new Date('2026-07-14T00:00:00Z'),
    updatedAt: new Date('2026-07-14T00:00:00Z'),
    ...overrides,
  } as unknown as SessionDoc;
}

describe('sharedSession', () => {
  it('monster combatant exposes exactly the whitelisted key set — no HP fields at all', () => {
    const out = sharedSession(sessionFixture());
    const goblin = out.combatants.find((c) => c.cid === 'c1')!;
    expect(Object.keys(goblin).sort()).toEqual([
      'cid',
      'conditions',
      'initiative',
      'isPlayer',
      'name',
    ]);
  });

  it('PC combatant additionally exposes currentHp/maxHp/tempHp', () => {
    const out = sharedSession(sessionFixture());
    const pc = out.combatants.find((c) => c.cid === 'c2')!;
    expect(Object.keys(pc).sort()).toEqual([
      'cid',
      'conditions',
      'currentHp',
      'initiative',
      'isPlayer',
      'maxHp',
      'name',
      'tempHp',
    ]);
  });

  it('filters out `note` log entries, keeps roll/event', () => {
    const out = sharedSession(sessionFixture());
    expect(out.log).toHaveLength(2);
    expect(out.log.map((l) => l.kind).sort()).toEqual(['event', 'roll']);
  });

  it('never leaks deathSaves, notes, or sourceElementId anywhere in the output', () => {
    const out = sharedSession(sessionFixture());
    const json = JSON.stringify(out);
    expect(json).not.toContain('deathSaves');
    expect(json).not.toContain('notes');
    expect(json).not.toContain('sourceElementId');
    // The GM-only note log entry and the GM-only combatant notes field both
    // mention "doppelganger" — neither should survive into the player view.
    expect(json).not.toContain('doppelganger');
  });

  it('exposes round/turnIndex/status at the top level', () => {
    const out = sharedSession(sessionFixture());
    expect(out.round).toBe(2);
    expect(out.turnIndex).toBe(1);
    expect(out.status).toBe('active');
  });
});
