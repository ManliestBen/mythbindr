/** Shared random tables for improvised content (quick NPCs, pregen parties…). */

export const NPC_FIRST = ['Bram', 'Sella', 'Torv', 'Mira', 'Oskar', 'Hild', 'Jasper', 'Nyssa', 'Corin', 'Vada', 'Rurik', 'Elba', 'Fenwick', 'Isolde', 'Garrick', 'Petra', 'Aldous', 'Wren', 'Dorn', 'Liet'];
export const NPC_LAST = ['Thistledown', 'Blackbriar', 'Copperkettle', 'Marsh', 'Vane', 'Holloway', 'Grimsbane', 'Fairweather', 'Stonebrook', 'Ashford', 'Nettlebee', 'Duskwalker', 'Pyke', 'Amberhill', 'Crowley', 'Tanner'];

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomName(): string {
  return `${pick(NPC_FIRST)} ${pick(NPC_LAST)}`;
}

// ── Quick NPC (mid-session improv) ──────────────────────────────────────────

export const NPC_ROLE = ['innkeeper', 'town guard', 'traveling merchant', 'street urchin', 'dockworker', 'gravedigger', 'apprentice mage', 'off-duty soldier', 'fortune teller', 'stable hand', 'tax collector', 'itinerant priest', 'rat catcher', 'minstrel', 'midwife', 'smuggler'];
export const NPC_QUIRK = ['talks to an invisible “friend”', 'collects teeth — don’t ask', 'laughs at the wrong moments', 'is aggressively superstitious', 'quotes a dead philosopher constantly', 'smells faintly of lavender and smoke', 'never blinks during conversation', 'keeps a ferret in one pocket', 'is owed money by half the town', 'lies about small, pointless things', 'hums sea shanties under their breath', 'is convinced the party are famous heroes', 'writes everything down in a tiny ledger', 'has an identical twin nobody mentions'];
export const NPC_WANT = ['wants protection from a local gang', 'is desperate to leave town tonight', 'needs a rare herb for a sick child', 'wants gossip about the nobility', 'is looking for a lost sibling', 'wants to sell something clearly stolen', 'needs witnesses for a duel at dawn', 'is recruiting for a “completely safe” job', 'wants the party to deliver a letter, no questions', 'is hiding from someone in the party’s last town'];
export const NPC_VOICE = ['gravelly and slow', 'high and rapid-fire', 'overly formal', 'whispery, leans in close', 'booming, stands too far away', 'bored monotone', 'thick rural drawl', 'sing-song and cheerful', 'clipped military cadence', 'perpetually out of breath'];

export interface QuickNpcResult {
  name: string;
  role: string;
  quirk: string;
  want: string;
  voice: string;
}

export function rollQuickNpc(): QuickNpcResult {
  return {
    name: randomName(),
    role: pick(NPC_ROLE),
    quirk: pick(NPC_QUIRK),
    want: pick(NPC_WANT),
    voice: pick(NPC_VOICE),
  };
}

// ── Pregen party (SRD-legal basics) ─────────────────────────────────────────

interface ClassSpec {
  name: string;
  role: string;
  hitDie: number;
  /** Ability priority for the standard array, best → worst. */
  priority: ('str' | 'dex' | 'con' | 'int' | 'wis' | 'cha')[];
  /** Baseline AC from typical starting gear (dex-independent estimate noted). */
  ac: (dexMod: number) => number;
  perceptionProficient: boolean;
}

const CLASSES: ClassSpec[] = [
  { name: 'Fighter', role: 'tank', hitDie: 10, priority: ['str', 'con', 'dex', 'wis', 'cha', 'int'], ac: () => 18, perceptionProficient: false }, // chain mail + shield
  { name: 'Cleric', role: 'healer', hitDie: 8, priority: ['wis', 'con', 'str', 'dex', 'cha', 'int'], ac: () => 18, perceptionProficient: true }, // chain mail + shield
  { name: 'Rogue', role: 'damage', hitDie: 8, priority: ['dex', 'con', 'int', 'wis', 'cha', 'str'], ac: (d) => 11 + d, perceptionProficient: true }, // leather
  { name: 'Wizard', role: 'utility', hitDie: 6, priority: ['int', 'con', 'dex', 'wis', 'cha', 'str'], ac: (d) => 10 + d, perceptionProficient: false },
  { name: 'Bard', role: 'face', hitDie: 8, priority: ['cha', 'dex', 'con', 'wis', 'int', 'str'], ac: (d) => 11 + d, perceptionProficient: true }, // leather
  { name: 'Ranger', role: 'damage', hitDie: 10, priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'], ac: (d) => 14 + Math.min(d, 2), perceptionProficient: true }, // scale mail
];

const RACES = ['Human', 'Hill Dwarf', 'High Elf', 'Lightfoot Halfling', 'Half-Orc', 'Rock Gnome', 'Tiefling', 'Dragonborn'];

const PC_FLAWS = ['can\'t resist a wager', 'trusts nobody with their real name', 'always runs toward the danger', 'is hopelessly sentimental about home', 'never forgives a slight', 'spends gold the moment it lands'];
const PC_BONDS = ['owes their life to a stranger they\'re still searching for', 'carries a sibling\'s unfinished letter', 'swore an oath to a dying mentor', 'protects a secret that could topple a noble house', 'is the last of their order'];
const PC_HOOKS = ['A family debt has finally been called in.', 'Someone from their past is hunting them — or warning them.', 'They dream of a place they have never been, and it is on the party\'s route.', 'Their old company was wiped out; the culprit\'s sigil keeps appearing.', 'A letter promises answers about their origin if they reach the next city.'];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const mod = (score: number) => Math.floor((score - 10) / 2);

export interface PregenPc {
  name: string;
  race: string;
  klass: string;
  level: number;
  ac: number;
  hpMax: number;
  passivePerception: number;
  flawsBonds: string;
  backstoryHooks: string;
  role: string;
}

/** N SRD-legal characters with a viable role mix (tank/healer/damage/face…). */
export function generateParty(n: number, level: number): PregenPc[] {
  const lvl = Math.min(Math.max(level, 1), 20);
  const prof = 2 + Math.floor((lvl - 1) / 4);
  // Lead with the core four so any party size is viable, then vary.
  const order = [0, 1, 2, 3, 4, 5];
  const out: PregenPc[] = [];
  for (let i = 0; i < n; i++) {
    const spec = CLASSES[order[i % order.length]];
    const scores: Record<string, number> = {};
    spec.priority.forEach((ab, j) => (scores[ab] = STANDARD_ARRAY[j]));
    const conMod = mod(scores.con);
    const dexMod = mod(scores.dex);
    const wisMod = mod(scores.wis);
    // Level 1 = max die; later levels use the fixed average (die/2 + 1).
    const hpMax = spec.hitDie + conMod + (lvl - 1) * (spec.hitDie / 2 + 1 + conMod);
    out.push({
      name: randomName(),
      race: pick(RACES),
      klass: spec.name,
      level: lvl,
      ac: spec.ac(dexMod),
      hpMax: Math.max(Math.round(hpMax), lvl),
      passivePerception: 10 + wisMod + (spec.perceptionProficient ? prof : 0),
      flawsBonds: `Flaw: ${pick(PC_FLAWS)}. Bond: ${pick(PC_BONDS)}.`,
      backstoryHooks: pick(PC_HOOKS),
      role: spec.role,
    });
  }
  return out;
}
