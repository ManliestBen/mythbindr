import type { CampaignDoc } from '../models/Campaign';
import type { ElementDoc } from '../models/Element';
import { publicCampaign } from '../models/Campaign';
import { publicElement } from '../models/Element';

/** Export order + headings for the Markdown prep packet. */
const TYPE_ORDER: [string, string][] = [
  ['quest', 'Quests'],
  ['npc', 'NPCs'],
  ['location', 'Locations'],
  ['encounter', 'Encounters'],
  ['item', 'Items'],
  ['faction', 'Factions'],
  ['pc', 'Party'],
  ['note', 'Notes'],
];

/** Human labels for the per-type data keys worth printing. */
const DATA_LABELS: Record<string, string> = {
  race: 'Race',
  role: 'Role',
  alignment: 'Alignment',
  status: 'Status',
  location: 'Location',
  faction: 'Faction',
  summary: 'Summary',
  traits: 'Traits',
  ideal: 'Ideal',
  bond: 'Bond',
  flaw: 'Flaw',
  mannerism: 'Mannerism',
  catchphrase: 'Catchphrase',
  locType: 'Type',
  features: 'Notable features',
  readAloud: 'Read aloud',
  encType: 'Type',
  trigger: 'Trigger',
  objective: 'Objective',
  combatants: 'Combatants',
  xp: 'XP',
  gold: 'Gold',
  rewards: 'Rewards',
  outcome: 'Outcome',
  itemType: 'Type',
  rarity: 'Rarity',
  attunement: 'Attunement',
  ownership: 'Ownership',
  value: 'Value (gp)',
  weight: 'Weight',
  effect: 'Effect',
  giver: 'Quest giver',
  hook: 'Hook',
  objectives: 'Objectives',
  consequences: 'Consequences',
  goals: 'Goals',
  leader: 'Leader',
  headquarters: 'Headquarters',
  influence: 'Influence',
  members: 'Members',
  alliesEnemies: 'Allies & enemies',
  playerName: 'Player',
  klass: 'Class',
  level: 'Level',
  ac: 'AC',
  hpMax: 'Max HP',
  passivePerception: 'Passive Perception',
  flawsBonds: 'Flaws & bonds',
  backstoryHooks: 'Backstory hooks',
};

/** Recursively collect text from a ProseMirror node, keeping paragraph breaks. */
function pmProse(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  const inner = Array.isArray(n.content) ? n.content.map(pmProse).join('') : '';
  if (n.type === 'paragraph' || n.type === 'heading') return inner + '\n\n';
  if (n.type === 'listItem') return '- ' + inner;
  return inner;
}

function bodyProse(body: unknown): string {
  if (typeof body === 'string') return body.trim();
  if (body && typeof body === 'object') return pmProse(body).replace(/\n{3,}/g, '\n\n').trim();
  return '';
}

export function exportJson(campaign: CampaignDoc, elements: ElementDoc[]) {
  return {
    format: 'mythbindr-campaign',
    version: 1,
    exportedAt: new Date().toISOString(),
    campaign: publicCampaign(campaign),
    elements: elements.map(publicElement),
  };
}

/** A readable prep packet: campaign header, then every element grouped by type. */
export function exportMarkdown(campaign: CampaignDoc, elements: ElementDoc[]): string {
  const lines: string[] = [];
  lines.push(`# ${campaign.name}`);
  if (campaign.hook) lines.push('', `> ${campaign.hook}`);
  const meta: string[] = [];
  if (campaign.settingName) meta.push(`Setting: ${campaign.settingName}`);
  meta.push(`Levels ${campaign.startLevel}–${campaign.endLevel}`);
  lines.push('', meta.join(' · '));
  if (campaign.storySoFar) lines.push('', '## Story so far', '', campaign.storySoFar);

  const byType = new Map<string, ElementDoc[]>();
  for (const el of elements) {
    const list = byType.get(el.type) ?? [];
    list.push(el);
    byType.set(el.type, list);
  }

  for (const [type, heading] of TYPE_ORDER) {
    const els = byType.get(type);
    if (!els?.length) continue;
    lines.push('', `## ${heading}`);
    for (const el of els) {
      lines.push('', `### ${el.name}`);
      if (el.tags?.length) lines.push('', `_Tags: ${el.tags.join(', ')}_`);
      const data = (el.data ?? {}) as Record<string, unknown>;
      const rows = Object.entries(data).filter(
        ([, v]) => v !== '' && v !== null && v !== undefined,
      );
      if (rows.length) {
        lines.push('');
        for (const [k, v] of rows) {
          lines.push(`- **${DATA_LABELS[k] ?? k}:** ${String(v).replace(/\n/g, ' / ')}`);
        }
      }
      const prose = bodyProse(el.body);
      if (prose) lines.push('', prose);
      if (el.secrets) {
        lines.push('', `> **GM only:** ${el.secrets.replace(/\n/g, ' ')}`);
      }
    }
  }

  lines.push('', '---', `_Exported from MythBindr on ${new Date().toISOString().slice(0, 10)}_`);
  return lines.join('\n') + '\n';
}
