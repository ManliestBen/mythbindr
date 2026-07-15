import { useState } from 'react';

const DICE = [4, 6, 8, 10, 12, 20, 100];

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Parse "8d6+3", "d20-1", "3d8" (whitespace/case tolerant). */
function parseFormula(raw: string): { count: number; sides: number; mod: number } | null {
  const m = raw.replace(/\s+/g, '').toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = Math.min(Math.max(parseInt(m[1] || '1', 10), 1), 100);
  const sides = parseInt(m[2], 10);
  if (sides < 2 || sides > 1000) return null;
  return { count, sides, mod: m[3] ? parseInt(m[3], 10) : 0 };
}

export default function DiceRoller({ onRoll }: { onRoll: (text: string) => void }) {
  const [mod, setMod] = useState('');
  const [count, setCount] = useState('1');
  const [adv, setAdv] = useState<'none' | 'adv' | 'dis'>('none');
  const [formula, setFormula] = useState('');
  const [formulaError, setFormulaError] = useState(false);

  const rollFormula = () => {
    const parsed = parseFormula(formula);
    if (!parsed) {
      setFormulaError(formula.trim().length > 0);
      return;
    }
    setFormulaError(false);
    const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides));
    const sum = rolls.reduce((x, y) => x + y, 0) + parsed.mod;
    const modStr = parsed.mod ? `${parsed.mod > 0 ? '+' : ''}${parsed.mod}` : '';
    onRoll(
      `${parsed.count}d${parsed.sides}${modStr} [${rolls.join(', ')}] = ${sum}`,
    );
    setFormula('');
  };

  const roll = (sides: number) => {
    const m = parseInt(mod, 10) || 0;
    const c = Math.min(Math.max(parseInt(count, 10) || 1, 1), 20);
    const modStr = m ? `${m > 0 ? '+' : ''}${m}` : '';

    if (sides === 20 && adv !== 'none') {
      const a = rollDie(20);
      const b = rollDie(20);
      const pick = adv === 'adv' ? Math.max(a, b) : Math.min(a, b);
      onRoll(`d20 ${adv === 'adv' ? '(adv)' : '(dis)'} [${a}, ${b}]${modStr} = ${pick + m}`);
      return;
    }
    const rolls = Array.from({ length: c }, () => rollDie(sides));
    const sum = rolls.reduce((x, y) => x + y, 0) + m;
    onRoll(`${c}d${sides}${modStr} [${rolls.join(', ')}] = ${sum}`);
  };

  const inputCls =
    'w-14 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand';

  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {DICE.map((d) => (
          <button
            key={d}
            onClick={() => roll(d)}
            className="rounded-lg border border-app-border px-2.5 py-1 text-sm font-semibold hover:border-brand hover:text-brand"
          >
            d{d}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-fg-muted">
          ×
          <input
            className={inputCls}
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-fg-muted">
          mod
          <input
            className={inputCls}
            type="number"
            placeholder="+0"
            value={mod}
            onChange={(e) => setMod(e.target.value)}
          />
        </label>
        <div className="flex gap-1">
          {(['none', 'adv', 'dis'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAdv(a)}
              className={[
                'rounded-lg border px-2 py-1 text-xs',
                adv === a ? 'border-brand text-brand' : 'border-app-border text-fg-muted',
              ].join(' ')}
            >
              {a === 'none' ? 'normal' : a}
            </button>
          ))}
          <span className="self-center text-[10px] text-fg-muted">(d20)</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={formula}
          onChange={(e) => {
            setFormula(e.target.value);
            setFormulaError(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && rollFormula()}
          placeholder="Formula, e.g. 8d6+3"
          className={[
            'flex-1 rounded-lg border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand',
            formulaError ? 'border-red-500/60' : 'border-app-border',
          ].join(' ')}
          aria-label="Dice formula"
        />
        <button
          onClick={rollFormula}
          className="rounded-lg border border-app-border px-2.5 py-1 text-sm font-semibold hover:border-brand hover:text-brand"
        >
          Roll
        </button>
      </div>
      {formulaError && (
        <p className="mt-1 text-[11px] text-red-400">
          Use NdS±M — like 8d6+3, d20-1, or 2d10.
        </p>
      )}
    </div>
  );
}
