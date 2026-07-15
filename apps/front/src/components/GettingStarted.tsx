import { useState } from 'react';
import { Link } from 'react-router-dom';

export interface StartStep {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  /** Route to send the GM to for this step (omit for callback steps). */
  to?: string;
  onClick?: () => void;
}

/**
 * New-GM checklist on the campaign overview. Driven by real campaign state,
 * dismissible per campaign, and it disappears on its own once everything is
 * checked — veterans never have to see it twice.
 */
export default function GettingStarted({
  campaignId,
  steps,
}: {
  campaignId: string;
  steps: StartStep[];
}) {
  const storageKey = `mythbindr:getting-started-dismissed:${campaignId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === '1');

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  if (dismissed || allDone) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <section className="mt-6 rounded-xl border border-brand/30 bg-app-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-base font-bold">Getting started</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            A campaign needs surprisingly little to be playable. Work through these and
            you&rsquo;re ready for session one.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs font-semibold text-fg-muted">
            {doneCount}/{steps.length}
          </span>
          <button
            onClick={dismiss}
            className="text-xs text-fg-muted hover:text-fg"
            title="Hide this checklist"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-surface2">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${Math.max(4, (doneCount / steps.length) * 100)}%` }}
        />
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const inner = (
            <>
              <span
                className={[
                  'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
                  s.done
                    ? 'border-brand bg-brand text-app-bg'
                    : 'border-app-border text-fg-muted',
                ].join(' ')}
                aria-hidden
              >
                {s.done ? '✓' : ''}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    'block text-sm font-medium',
                    s.done ? 'text-fg-muted line-through decoration-fg-muted/40' : 'text-fg',
                  ].join(' ')}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">{s.detail}</span>
              </span>
            </>
          );
          const cls =
            'flex items-start gap-2.5 rounded-lg border border-transparent p-2 text-left hover:border-app-border hover:bg-app-surface2/50';
          return (
            <li key={s.key}>
              {s.to ? (
                <Link to={s.to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={s.onClick} className={`${cls} w-full`}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
