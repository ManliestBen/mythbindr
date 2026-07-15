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
  /** Plain-language explainer shown as a "?" tooltip — jargon help for new GMs. */
  help?: string;
}

export interface ElementTypeConfig {
  type: string;
  label: string;
  plural: string;
  available: boolean;
  /** One-sentence "what is this & why it matters" shown on the list page + empty state. */
  blurb?: string;
  /** Per-type structured `data` fields rendered by ElementForm. */
  dataFields?: DataField[];
  /** Whether to show the typed-relationships editor. */
  relationships?: boolean;
}

export const ELEMENT_TYPE_BY_SEGMENT: Record<string, ElementTypeConfig> = {
  notes: {
    type: 'note',
    label: 'Note',
    plural: 'Notes',
    available: true,
    blurb:
      'Freeform lore, session prep, and loose ideas. Type @ in the body to link any other element.',
  },
  npcs: {
    type: 'npc',
    label: 'NPC',
    plural: 'NPCs',
    available: true,
    relationships: true,
    blurb:
      'The people your players meet — allies, villains, shopkeepers. Give each one a want and a quirk and they come alive at the table.',
    dataFields: [
      { key: 'race', label: 'Race', kind: 'text' },
      { key: 'role', label: 'Role / occupation', kind: 'text' },
      {
        key: 'alignment',
        label: 'Alignment',
        kind: 'text',
        help: 'Moral shorthand like "Lawful Good" or "Chaotic Neutral". Optional — a clear want and flaw matter far more in play.',
      },
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
      {
        key: 'ideal',
        label: 'Ideal',
        kind: 'text',
        help: 'The principle they would sacrifice for ("Knowledge must be free"). Drives what they say yes to.',
      },
      {
        key: 'bond',
        label: 'Bond',
        kind: 'text',
        help: 'The person, place, or thing they protect. Threaten it and the story moves.',
      },
      {
        key: 'flaw',
        label: 'Flaw',
        kind: 'text',
        help: 'The weakness players can exploit — greed, pride, a debt. Flaws make NPCs negotiable.',
      },
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
    blurb:
      'Places worth visiting — cities, dungeons, taverns, ruins. Link who lives there and what might happen.',
    dataFields: [
      {
        key: 'locType',
        label: 'Type',
        kind: 'select',
        options: ['city', 'dungeon', 'wilderness', 'building', 'plane', 'region', 'other'],
      },
      { key: 'features', label: 'Notable features', kind: 'textarea' },
      {
        key: 'readAloud',
        label: 'Read-aloud boxed text',
        kind: 'textarea',
        help: 'Words you read verbatim when the party arrives. Keep it to 2–4 sensory sentences, then let players ask questions.',
      },
    ],
  },
  encounters: {
    type: 'encounter',
    label: 'Encounter',
    plural: 'Encounters',
    available: true,
    relationships: true,
    blurb:
      'Planned scenes — fights, negotiations, puzzles, traps. Prep the trigger and objective now; hit "Run encounter" on game night.',
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
      {
        key: 'trigger',
        label: 'Trigger',
        kind: 'text',
        help: 'What makes this scene start — "when the party enters the crypt". If it never triggers, that\'s fine; nothing is wasted.',
      },
      { key: 'objective', label: 'Objective', kind: 'textarea' },
      {
        key: 'combatants',
        label: 'Combatants (one per line)',
        kind: 'textarea',
        help: 'List each enemy on its own line, e.g. "2x Goblin" or "Bandit Captain". "Run encounter" loads them into the initiative tracker.',
      },
      {
        key: 'xp',
        label: 'XP reward',
        kind: 'number',
        help: 'Experience points the party earns for overcoming this. Use the difficulty calculator below to sanity-check the fight.',
      },
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
    blurb:
      'Loot, artifacts, and quest MacGuffins. Track who holds what so treasure never vanishes between sessions.',
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
        help: 'How hard the item is to find, common → artifact. A rough guide to its power and price.',
      },
      {
        key: 'attunement',
        label: 'Attunement',
        kind: 'select',
        options: ['no', 'yes'],
        help: 'Attuned items require a character to bond with them over a short rest before the magic works — and each character can attune to at most 3.',
      },
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
  quests: {
    type: 'quest',
    label: 'Quest',
    plural: 'Quests',
    available: true,
    relationships: true,
    blurb:
      'What the party is trying to do and why. Track status and objectives so no thread gets dropped between sessions.',
    dataFields: [
      {
        key: 'status',
        label: 'Status',
        kind: 'select',
        options: ['rumored', 'active', 'completed', 'failed'],
      },
      { key: 'giver', label: 'Quest giver', kind: 'text' },
      {
        key: 'hook',
        label: 'Hook (the lure)',
        kind: 'text',
        help: 'The one-line pitch that pulls players in — a rumor, a plea, a bounty. Lead with what they gain.',
      },
      { key: 'objectives', label: 'Objectives (one per line, start a line with "x " when done)', kind: 'textarea' },
      { key: 'xp', label: 'XP reward', kind: 'number' },
      { key: 'gold', label: 'Gold reward', kind: 'number' },
      { key: 'rewards', label: 'Other rewards', kind: 'textarea' },
      { key: 'consequences', label: 'Consequences / branches', kind: 'textarea' },
    ],
  },
  factions: {
    type: 'faction',
    label: 'Faction',
    plural: 'Factions',
    available: true,
    relationships: true,
    blurb:
      'Groups with agendas — guilds, cults, noble houses. Factions keep the world moving even when the party looks away.',
    dataFields: [
      {
        key: 'influence',
        label: 'Influence',
        kind: 'select',
        options: ['unknown', 'minor', 'established', 'powerful', 'dominant'],
      },
      { key: 'leader', label: 'Leader', kind: 'text' },
      { key: 'headquarters', label: 'Headquarters', kind: 'text' },
      { key: 'goals', label: 'Goals', kind: 'textarea' },
      { key: 'members', label: 'Notable members', kind: 'textarea' },
      { key: 'alliesEnemies', label: 'Allies & enemies', kind: 'textarea' },
    ],
  },
  pcs: {
    type: 'pc',
    label: 'Player Character',
    plural: 'Party',
    available: true,
    relationships: true,
    blurb:
      "Your players' characters. Keep the table numbers (AC, HP, Passive Perception) here and they'll be one glance away during a session.",
    dataFields: [
      { key: 'playerName', label: 'Player name', kind: 'text' },
      { key: 'race', label: 'Race / ancestry', kind: 'text' },
      { key: 'klass', label: 'Class & subclass', kind: 'text' },
      { key: 'level', label: 'Level', kind: 'number' },
      {
        key: 'ac',
        label: 'Armor Class (AC)',
        kind: 'number',
        help: 'Attack rolls must meet or beat this number to hit. Found on the player\'s character sheet.',
      },
      { key: 'hpMax', label: 'Max HP', kind: 'number' },
      {
        key: 'passivePerception',
        label: 'Passive Perception',
        kind: 'number',
        help: 'What the character notices without rolling: 10 + their Perception bonus. Compare a sneaking monster\'s Stealth roll against it.',
      },
      { key: 'flawsBonds', label: 'Flaws & bonds', kind: 'textarea' },
      { key: 'backstoryHooks', label: 'Backstory hooks (things you can weaponize)', kind: 'textarea' },
    ],
  },
};

/** Display order for nav + campaign-home tiles (prep-first: story, people, places…). */
export const ELEMENT_SEGMENTS_ORDERED = [
  'quests',
  'npcs',
  'locations',
  'encounters',
  'items',
  'factions',
  'pcs',
  'notes',
] as const;

/** Reverse lookup: backend element `type` → URL segment (for linking to an element). */
export function segmentForType(type: string): string | undefined {
  return Object.keys(ELEMENT_TYPE_BY_SEGMENT).find(
    (seg) => ELEMENT_TYPE_BY_SEGMENT[seg].type === type,
  );
}
