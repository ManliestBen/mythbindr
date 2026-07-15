import type { ElementDoc } from '../models/Element';
import type { SessionDoc } from '../models/Session';

/**
 * Replace @mention nodes in a ProseMirror body with plain text labels, so the
 * public share view never leaks element ids (existence of hidden elements).
 */
function sanitizeBody(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeBody);
  if (node && typeof node === 'object') {
    const n = node as { type?: unknown; attrs?: { label?: unknown }; content?: unknown };
    if (n.type === 'mention') {
      const label = typeof n.attrs?.label === 'string' ? n.attrs.label : '';
      return { type: 'text', text: `@${label}` };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(n)) {
      out[k] = k === 'content' ? sanitizeBody((n as Record<string, unknown>)[k]) : (n as Record<string, unknown>)[k];
    }
    return out;
  }
  return node;
}

/** Data keys that are GM planning info even on a player-shared element. */
const GM_ONLY_DATA: Record<string, string[]> = {
  quest: ['consequences'],
  encounter: ['combatants', 'outcome', 'trigger'],
};

/**
 * Player-facing serialization. **Whitelist only** — never include `secrets`,
 * `links`, `updatedBy`, or any GM-only field. Used exclusively by /api/share/*.
 */
export function sharedElement(e: ElementDoc) {
  const data = { ...((e.data ?? {}) as Record<string, unknown>) };
  for (const k of GM_ONLY_DATA[e.type] ?? []) delete data[k];
  return {
    id: String(e._id),
    type: e.type,
    name: e.name,
    body: sanitizeBody(e.body),
    tags: e.tags,
    data,
    soundtrack: e.soundtrack,
  };
}

/**
 * Player-facing live-session serialization. **Whitelist only** — mirrors
 * sharedElement's discipline; a sibling, not a modification of it. Used
 * exclusively by the `/share` realtime namespace (ShareLink.scope: 'session').
 *
 * Monster HP is hidden ENTIRELY (operator decision 2026-07-14, recorded in
 * docs/design/live-session.md): `isPlayer: false` combatants carry no HP
 * fields at all — no numbers, no descriptive tiers. Never present on this
 * path, for any combatant: `deathSaves`, `notes`, `sourceElementId`. Log
 * entries of `kind: 'note'` (GM scratch notes) are filtered out entirely.
 */
export function sharedSession(s: SessionDoc) {
  return {
    round: s.round,
    turnIndex: s.turnIndex,
    status: s.status,
    combatants: (s.combatants ?? []).map((c) => ({
      cid: c.cid,
      name: c.name,
      initiative: c.initiative,
      isPlayer: c.isPlayer,
      conditions: (c.conditions ?? []).map((x) => ({ name: x.name, rounds: x.rounds ?? null })),
      ...(c.isPlayer ? { currentHp: c.currentHp, maxHp: c.maxHp, tempHp: c.tempHp } : {}),
    })),
    log: (s.log ?? [])
      .filter((l): l is typeof l & { kind: 'roll' | 'event' } => l.kind !== 'note')
      .map((l) => ({ at: l.at, kind: l.kind, text: l.text, by: l.by })),
  };
}
