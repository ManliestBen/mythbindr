import type { SrdResource } from '../../data/srd';

/* eslint-disable @typescript-eslint/no-explicit-any */

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? '+' : ''}${m}`;
}

function fmtSpeed(speed: any): string {
  if (!speed) return '—';
  if (typeof speed === 'string') return speed;
  return Object.entries(speed)
    .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
    .join(', ');
}

function Block({ items }: { items: { name: string; desc: string }[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((a, i) => (
        <p key={i} className="text-sm">
          <span className="font-semibold italic">{a.name}.</span>{' '}
          <span className="text-fg-muted whitespace-pre-line">{a.desc}</span>
        </p>
      ))}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="font-semibold">{label}:</span>{' '}
      <span className="text-fg-muted">{String(value)}</span>
    </p>
  );
}

function Monster({ d }: { d: any }) {
  const abilities: [string, number][] = [
    ['STR', d.strength],
    ['DEX', d.dexterity],
    ['CON', d.constitution],
    ['INT', d.intelligence],
    ['WIS', d.wisdom],
    ['CHA', d.charisma],
  ];
  return (
    <div>
      <p className="text-sm italic text-fg-muted">
        {[d.size, d.type, d.subtype && `(${d.subtype})`].filter(Boolean).join(' ')}
        {d.alignment ? `, ${d.alignment}` : ''}
      </p>
      <div className="mt-2 space-y-0.5">
        <StatLine label="Armor Class" value={d.armor_class} />
        <StatLine label="Hit Points" value={d.hit_points && `${d.hit_points} (${d.hit_dice})`} />
        <StatLine label="Speed" value={fmtSpeed(d.speed)} />
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1 text-center">
        {abilities.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-app-border py-1">
            <div className="text-[10px] uppercase tracking-wide text-fg-muted">{k}</div>
            <div className="text-sm font-semibold">
              {v} <span className="text-fg-muted">({mod(v)})</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-0.5">
        <StatLine label="Saving Throws" value={d.saving_throws} />
        <StatLine label="Skills" value={d.skills} />
        <StatLine label="Damage Resistances" value={d.damage_resistances} />
        <StatLine label="Damage Immunities" value={d.damage_immunities} />
        <StatLine label="Condition Immunities" value={d.condition_immunities} />
        <StatLine label="Senses" value={d.senses} />
        <StatLine label="Languages" value={d.languages} />
        <StatLine label="Challenge" value={d.challenge_rating} />
      </div>
      {Array.isArray(d.special_abilities) && d.special_abilities.length > 0 && (
        <Block items={d.special_abilities} />
      )}
      {Array.isArray(d.actions) && d.actions.length > 0 && (
        <>
          <h4 className="mt-3 border-b border-app-border pb-1 font-heading text-sm font-bold text-brand">
            Actions
          </h4>
          <Block items={d.actions} />
        </>
      )}
      {Array.isArray(d.legendary_actions) && d.legendary_actions.length > 0 && (
        <>
          <h4 className="mt-3 border-b border-app-border pb-1 font-heading text-sm font-bold text-brand">
            Legendary Actions
          </h4>
          <Block items={d.legendary_actions} />
        </>
      )}
    </div>
  );
}

function Spell({ d }: { d: any }) {
  return (
    <div>
      <p className="text-sm italic text-fg-muted">
        {d.level_int === 0 ? `${d.school} cantrip` : `Level ${d.level_int} ${d.school}`}
      </p>
      <div className="mt-2 space-y-0.5">
        <StatLine label="Casting Time" value={d.casting_time} />
        <StatLine label="Range" value={d.range} />
        <StatLine label="Components" value={d.components} />
        <StatLine label="Duration" value={d.duration} />
        <StatLine label="Classes" value={d.dnd_class} />
      </div>
      {d.desc && <p className="mt-3 whitespace-pre-line text-sm text-fg-muted">{d.desc}</p>}
      {d.higher_level && (
        <p className="mt-2 text-sm">
          <span className="font-semibold italic">At Higher Levels.</span>{' '}
          <span className="text-fg-muted">{d.higher_level}</span>
        </p>
      )}
    </div>
  );
}

export default function ResourceView({ resource }: { resource: SrdResource }) {
  const d = resource.data ?? {};
  return (
    <div>
      <h3 className="font-heading text-lg font-bold">{resource.name}</h3>
      <div className="mt-2">
        {resource.category === 'monsters' ? (
          <Monster d={d} />
        ) : resource.category === 'spells' ? (
          <Spell d={d} />
        ) : (
          <div>
            {(d.type || d.rarity) && (
              <p className="text-sm italic text-fg-muted">
                {[d.type, d.rarity].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="mt-2 whitespace-pre-line text-sm text-fg-muted">
              {resource.desc ?? d.desc ?? 'No description.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
