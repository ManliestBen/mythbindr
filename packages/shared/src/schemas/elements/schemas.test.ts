import { describe, expect, it } from 'vitest';
import { elementRegistry, type ElementType } from './index';

const types = Object.keys(elementRegistry) as ElementType[];

describe('elementRegistry — create schema', () => {
  it('registers at least the known MVP element types', () => {
    expect(types.length).toBeGreaterThan(0);
  });

  it.each(types)('%s: a minimal valid payload passes safeParse', (type) => {
    const schema = elementRegistry[type]!.create;
    const result = schema.safeParse({ type, name: 'Test Name' });
    expect(result.success).toBe(true);
  });

  it.each(types)('%s: missing name fails safeParse', (type) => {
    const schema = elementRegistry[type]!.create;
    const result = schema.safeParse({ type });
    expect(result.success).toBe(false);
  });

  it.each(types)('%s: wrong literal type fails safeParse', (type) => {
    const schema = elementRegistry[type]!.create;
    const result = schema.safeParse({ type: 'not-a-real-type', name: 'Test Name' });
    expect(result.success).toBe(false);
  });
});

describe('per-type data enum checks', () => {
  it('npc.data.status accepts known values and rejects unknown ones', () => {
    const schema = elementRegistry.npc!.create;
    expect(schema.safeParse({ type: 'npc', name: 'N', data: { status: 'alive' } }).success).toBe(true);
    expect(schema.safeParse({ type: 'npc', name: 'N', data: { status: 'zombie' } }).success).toBe(false);
  });

  it('location.data.locType accepts known values and rejects unknown ones', () => {
    const schema = elementRegistry.location!.create;
    expect(schema.safeParse({ type: 'location', name: 'L', data: { locType: 'dungeon' } }).success).toBe(true);
    expect(schema.safeParse({ type: 'location', name: 'L', data: { locType: 'space station' } }).success).toBe(false);
  });

  it('item.data.rarity and itemType accept known values and reject unknown ones', () => {
    const schema = elementRegistry.item!.create;
    expect(
      schema.safeParse({ type: 'item', name: 'I', data: { itemType: 'weapon', rarity: 'rare' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ type: 'item', name: 'I', data: { rarity: 'super rare' } }).success).toBe(false);
    expect(schema.safeParse({ type: 'item', name: 'I', data: { itemType: 'unobtainium' } }).success).toBe(
      false,
    );
  });

  it('encounter.data.encType and status accept known values and reject unknown ones', () => {
    const schema = elementRegistry.encounter!.create;
    expect(
      schema.safeParse({ type: 'encounter', name: 'E', data: { encType: 'combat', status: 'planned' } })
        .success,
    ).toBe(true);
    expect(schema.safeParse({ type: 'encounter', name: 'E', data: { encType: 'dance-off' } }).success).toBe(
      false,
    );
  });

  it('quest.data.status accepts known values and rejects unknown ones', () => {
    const schema = elementRegistry.quest!.create;
    expect(schema.safeParse({ type: 'quest', name: 'Q', data: { status: 'active' } }).success).toBe(true);
    expect(schema.safeParse({ type: 'quest', name: 'Q', data: { status: 'abandoned' } }).success).toBe(
      false,
    );
  });

  it('faction.data.influence accepts known values and rejects unknown ones', () => {
    const schema = elementRegistry.faction!.create;
    expect(schema.safeParse({ type: 'faction', name: 'F', data: { influence: 'powerful' } }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ type: 'faction', name: 'F', data: { influence: 'omnipotent' } }).success,
    ).toBe(false);
  });
});
