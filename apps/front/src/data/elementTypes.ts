/**
 * Maps the URL segment (plural, used in routes + sidebar) to the backend element
 * `type` and display labels. `available` flips on as each slice ships its schema
 * + form; until then the section shows a "coming soon" notice.
 */
export interface DataField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'number';
  options?: string[];
}

export interface ElementTypeConfig {
  type: string;
  label: string;
  plural: string;
  available: boolean;
  /** Per-type structured `data` fields rendered by ElementForm. */
  dataFields?: DataField[];
  /** Whether to show the typed-relationships editor. */
  relationships?: boolean;
}

export const ELEMENT_TYPE_BY_SEGMENT: Record<string, ElementTypeConfig> = {
  notes: { type: 'note', label: 'Note', plural: 'Notes', available: true },
  npcs: {
    type: 'npc',
    label: 'NPC',
    plural: 'NPCs',
    available: true,
    relationships: true,
    dataFields: [
      { key: 'race', label: 'Race', kind: 'text' },
      { key: 'role', label: 'Role / occupation', kind: 'text' },
      { key: 'alignment', label: 'Alignment', kind: 'text' },
      {
        key: 'status',
        label: 'Status',
        kind: 'select',
        options: ['alive', 'dead', 'missing', 'unknown'],
      },
      { key: 'location', label: 'Location', kind: 'text' },
      { key: 'faction', label: 'Faction', kind: 'text' },
      { key: 'summary', label: 'One-line summary', kind: 'text' },
      { key: 'traits', label: 'Personality traits', kind: 'textarea' },
      { key: 'ideal', label: 'Ideal', kind: 'text' },
      { key: 'bond', label: 'Bond', kind: 'text' },
      { key: 'flaw', label: 'Flaw', kind: 'text' },
      { key: 'mannerism', label: 'Mannerism / voice', kind: 'text' },
      { key: 'catchphrase', label: 'Catchphrase', kind: 'text' },
    ],
  },
  locations: {
    type: 'location',
    label: 'Location',
    plural: 'Locations',
    available: true,
    relationships: true,
    dataFields: [
      {
        key: 'locType',
        label: 'Type',
        kind: 'select',
        options: ['city', 'dungeon', 'wilderness', 'building', 'plane', 'region', 'other'],
      },
      { key: 'features', label: 'Notable features', kind: 'textarea' },
      { key: 'readAloud', label: 'Read-aloud boxed text', kind: 'textarea' },
    ],
  },
  encounters: {
    type: 'encounter',
    label: 'Encounter',
    plural: 'Encounters',
    available: true,
    relationships: true,
    dataFields: [
      {
        key: 'encType',
        label: 'Type',
        kind: 'select',
        options: ['combat', 'social', 'exploration', 'puzzle', 'trap'],
      },
      {
        key: 'status',
        label: 'Status',
        kind: 'select',
        options: ['planned', 'in-progress', 'completed'],
      },
      { key: 'trigger', label: 'Trigger', kind: 'text' },
      { key: 'objective', label: 'Objective', kind: 'textarea' },
      { key: 'combatants', label: 'Combatants (one per line)', kind: 'textarea' },
      { key: 'xp', label: 'XP reward', kind: 'number' },
      { key: 'gold', label: 'Gold reward', kind: 'number' },
      { key: 'rewards', label: 'Other rewards', kind: 'textarea' },
      { key: 'outcome', label: 'Outcome notes', kind: 'textarea' },
    ],
  },
  items: {
    type: 'item',
    label: 'Item',
    plural: 'Items',
    available: true,
    relationships: true,
    dataFields: [
      {
        key: 'itemType',
        label: 'Type',
        kind: 'select',
        options: ['weapon', 'armor', 'potion', 'wondrous', 'quest', 'currency', 'other'],
      },
      {
        key: 'rarity',
        label: 'Rarity',
        kind: 'select',
        options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
      },
      { key: 'attunement', label: 'Attunement', kind: 'select', options: ['no', 'yes'] },
      {
        key: 'ownership',
        label: 'Ownership',
        kind: 'select',
        options: ['unassigned', 'npc', 'pc', 'stashed'],
      },
      { key: 'value', label: 'Value (gp)', kind: 'number' },
      { key: 'weight', label: 'Weight', kind: 'number' },
      { key: 'effect', label: 'Mechanical effect', kind: 'textarea' },
    ],
  },
};

/** Reverse lookup: backend element `type` → URL segment (for linking to an element). */
export function segmentForType(type: string): string | undefined {
  return Object.keys(ELEMENT_TYPE_BY_SEGMENT).find(
    (seg) => ELEMENT_TYPE_BY_SEGMENT[seg].type === type,
  );
}
