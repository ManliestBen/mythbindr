import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCampaign,
  useDeleteCampaign,
  useDuplicateCampaign,
  useRestoreCampaign,
  useUpdateCampaign,
  type CampaignFormValues,
} from '../data/campaigns';
import { useToast } from '../components/ToastProvider';
import CampaignForm from '../components/CampaignForm';
import GettingStarted from '../components/GettingStarted';
import Skeleton from '../components/Skeleton';
import { useDashboard } from '../data/dashboard';
import { useActivity } from '../data/activity';
import { useSession, useSessionHistory } from '../data/session';
import { useElements } from '../data/elements';
import { questProgress, questStatus } from '../lib/quests';
import { timeAgo } from '../lib/timeAgo';
import {
  ELEMENT_SEGMENTS_ORDERED,
  ELEMENT_TYPE_BY_SEGMENT,
  segmentForType,
} from '../data/elementTypes';

const ELEMENT_TYPES = ELEMENT_SEGMENTS_ORDERED.map((seg) => ({
  type: seg,
  label: ELEMENT_TYPE_BY_SEGMENT[seg].plural,
}));

export default function CampaignHome() {
  const { cid } = useParams();
  const { data: campaign, isLoading, error } = useCampaign(cid);
  const update = useUpdateCampaign(cid ?? '');
  const del = useDeleteCampaign();
  const restoreCampaign = useRestoreCampaign();
  const duplicate = useDuplicateCampaign();
  const toast = useToast();
  const dash = useDashboard(cid ?? '');
  const activity = useActivity(cid ?? '');
  const liveSession = useSession(cid ?? '');
  const quests = useElements(cid ?? '', { type: 'quest' });
  const history = useSessionHistory(cid ?? '');
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton rows={4} />
      </div>
    );
  }
  if (error || !campaign) {
    return (
      <p className="text-sm text-red-400">
        {error instanceof Error ? error.message : 'Campaign not found'}
      </p>
    );
  }

  const onSave = (values: CampaignFormValues) =>
    update.mutate(values, { onSuccess: () => setEditing(false) });

  // Undo via toast replaces the confirm dialog — reversible beats interrogated.
  const onDelete = () => {
    const { id, name } = campaign;
    del.mutate(id, {
      onSuccess: () => {
        navigate('/campaigns');
        toast(`"${name}" moved to trash.`, {
          actionLabel: 'Undo',
          onAction: () => restoreCampaign.mutate(id),
        });
      },
    });
  };

  const onDuplicate = () =>
    duplicate.mutate(campaign.id, {
      onSuccess: (copy) => navigate(`/campaigns/${copy.id}`),
    });

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Edit campaign</h1>
        <div className="mt-5 rounded-xl border border-app-border bg-app-surface p-5">
          <CampaignForm
            campaignId={campaign.id}
            submitLabel="Save changes"
            busy={update.isPending}
            error={update.error instanceof Error ? update.error.message : null}
            defaultValues={{
              name: campaign.name,
              hook: campaign.hook,
              settingName: campaign.settingName,
              startLevel: campaign.startLevel,
              endLevel: campaign.endLevel,
              storySoFar: campaign.storySoFar,
            }}
            onSubmit={onSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">Campaign</p>
      <div className="mt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          {campaign.hook && (
            <p className="mt-2 max-w-prose text-sm text-fg-muted">{campaign.hook}</p>
          )}
          <p className="mt-2 text-[11px] uppercase tracking-wide text-fg-muted">
            {campaign.settingName ? `${campaign.settingName} · ` : ''}Levels{' '}
            {campaign.startLevel}–{campaign.endLevel}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/campaigns/${campaign.id}/session`}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-app-bg hover:bg-brand-bright"
          >
            Run session
          </Link>
          <Link
            to={`/campaigns/${campaign.id}/members`}
            className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
          >
            Members
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
          >
            Edit
          </button>
          <button
            onClick={onDuplicate}
            disabled={duplicate.isPending}
            className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
          >
            Duplicate
          </button>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
              Export ▾
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-app-border bg-app-surface p-1 shadow-lg">
              <a
                href={`/api/campaigns/${campaign.id}/export?format=markdown`}
                download
                className="block rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-app-surface2 hover:text-fg"
              >
                Prep packet (.md)
              </a>
              <a
                href={`/api/campaigns/${campaign.id}/export`}
                download
                className="block rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-app-surface2 hover:text-fg"
              >
                Full backup (.json)
              </a>
            </div>
          </details>
          <button
            onClick={onDelete}
            disabled={del.isPending}
            className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {dash.data && (
        <GettingStarted
          campaignId={campaign.id}
          steps={[
            {
              key: 'stage',
              label: 'Set the stage',
              detail: 'Give the campaign a hook or a "story so far" so everyone knows the pitch.',
              done: Boolean(campaign.hook || campaign.storySoFar),
              onClick: () => setEditing(true),
            },
            {
              key: 'npc',
              label: 'Create your first NPC',
              detail: 'One memorable person with a want and a quirk beats ten stat blocks.',
              done: (dash.data.counts.npc ?? 0) > 0,
              to: `/campaigns/${campaign.id}/npcs/new`,
            },
            {
              key: 'location',
              label: 'Add a location',
              detail: 'Where does session one open? A tavern is a classic for a reason.',
              done: (dash.data.counts.location ?? 0) > 0,
              to: `/campaigns/${campaign.id}/locations/new`,
            },
            {
              key: 'quest',
              label: 'Write a quest',
              detail: 'The thing the party is trying to do. One clear objective is plenty.',
              done: (dash.data.counts.quest ?? 0) > 0,
              to: `/campaigns/${campaign.id}/quests/new`,
            },
            {
              key: 'encounter',
              label: 'Plan an encounter',
              detail: 'A fight, a negotiation, or a puzzle — something to make the night exciting.',
              done: (dash.data.counts.encounter ?? 0) > 0,
              to: `/campaigns/${campaign.id}/encounters/new`,
            },
            {
              key: 'session',
              label: 'Run your first session',
              detail: 'Initiative, HP, dice, and notes in one screen when game night arrives.',
              done: Boolean(liveSession.data),
              to: `/campaigns/${campaign.id}/session`,
            },
          ]}
        />
      )}

      {/* Element-type hub with live counts (dashboard aggregation). */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ELEMENT_TYPES.map((e) => {
          const backendType = ELEMENT_TYPE_BY_SEGMENT[e.type]?.type ?? '';
          const count = dash.data?.counts[backendType] ?? 0;
          return (
            <Link
              key={e.type}
              to={`/campaigns/${campaign.id}/${e.type}`}
              className="rounded-xl border border-app-border bg-app-surface p-4 text-center hover:border-fg-muted"
            >
              <div className="font-heading text-2xl font-bold text-brand">{count}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-fg-muted">
                {e.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick-add: the things a GM reaches for between sessions. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(['npcs', 'quests', 'encounters', 'notes'] as const).map((s) => (
          <Link
            key={s}
            to={`/campaigns/${campaign.id}/${s}/new`}
            className="rounded-lg border border-app-border px-3 py-1.5 text-xs font-semibold text-fg-muted hover:border-brand hover:text-brand"
          >
            + {ELEMENT_TYPE_BY_SEGMENT[s].label}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Open quests: what the party is on the hook for right now. */}
        <div className="rounded-xl border border-app-border bg-app-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Open quests</h3>
            <Link
              to={`/campaigns/${campaign.id}/quests`}
              className="text-xs text-fg-muted hover:text-brand"
            >
              View all →
            </Link>
          </div>
          {(() => {
            const open = (quests.data ?? []).filter((q) =>
              ['active', 'rumored'].includes(questStatus(q)),
            );
            if (open.length === 0) {
              return (
                <p className="mt-3 text-sm text-fg-muted">
                  Nothing open.{' '}
                  <Link
                    to={`/campaigns/${campaign.id}/quests/new`}
                    className="text-brand hover:underline"
                  >
                    Write the first quest
                  </Link>{' '}
                  — one clear objective is plenty.
                </p>
              );
            }
            return (
              <ul className="mt-3 space-y-2.5">
                {open.slice(0, 5).map((q) => {
                  const p = questProgress(q);
                  const status = questStatus(q);
                  return (
                    <li key={q.id}>
                      <Link
                        to={`/campaigns/${campaign.id}/quests/${q.id}`}
                        className="group block"
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium group-hover:text-brand">
                            {q.name}
                          </span>
                          <span
                            className={[
                              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                              status === 'active'
                                ? 'bg-brand/15 text-brand'
                                : 'border border-app-border text-fg-muted',
                            ].join(' ')}
                          >
                            {status}
                          </span>
                        </span>
                        {p && (
                          <span className="mt-1 flex items-center gap-2">
                            <span className="h-1 w-32 overflow-hidden rounded-full bg-app-surface2">
                              <span
                                className="block h-full rounded-full bg-brand"
                                style={{ width: `${(p.done / p.total) * 100}%` }}
                              />
                            </span>
                            <span className="text-[10px] text-fg-muted">
                              {p.done}/{p.total}
                            </span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>

        {/* Recently edited: pick up where you left off. */}
        <div className="rounded-xl border border-app-border bg-app-surface p-5">
          <h3 className="text-sm font-bold">Recently edited</h3>
          {dash.data && dash.data.recent.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {dash.data.recent.slice(0, 6).map((r) => {
                const rseg = segmentForType(r.type);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    {rseg ? (
                      <Link
                        to={`/campaigns/${campaign.id}/${rseg}/${r.id}`}
                        className="min-w-0 truncate text-sm hover:text-brand"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate text-sm">{r.name}</span>
                    )}
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-muted">
                      {r.type} · {timeAgo(r.updatedAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">
              Nothing yet — everything you create shows up here.
            </p>
          )}
        </div>
      </div>

      {campaign.storySoFar && (
        <div className="mt-8 rounded-xl border border-app-border bg-app-surface p-5">
          <h3 className="text-sm font-bold">Story so far</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">
            {campaign.storySoFar}
          </p>
        </div>
      )}

      {history.data && history.data.length > 0 && (
        <div className="mt-8 rounded-xl border border-app-border bg-app-surface p-5">
          <h3 className="text-sm font-bold">Past sessions</h3>
          <ul className="mt-2 space-y-1">
            {history.data.map((s) => (
              <li key={s.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-app-surface2/50 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">
                      {new Date(s.startedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {s.round} round{s.round === 1 ? '' : 's'} · {s.log.length} log{' '}
                      {s.log.length === 1 ? 'entry' : 'entries'}
                    </span>
                    <span className="ml-auto text-xs text-fg-muted group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  {s.log.length > 0 ? (
                    <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto border-l border-app-border py-1 pl-4 text-xs text-fg-muted">
                      {s.log.map((entry, i) => (
                        <li key={i}>
                          {entry.kind === 'roll' ? '🎲 ' : entry.kind === 'event' ? '⚔ ' : '✎ '}
                          {entry.text}
                          {entry.by ? ` — ${entry.by}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 pl-4 text-xs text-fg-muted">No log entries.</p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activity.data && activity.data.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-bold">Activity</h3>
          <ul className="mt-2 space-y-1">
            {activity.data.map((a) => {
              const seg = a.elementType ? segmentForType(a.elementType) : undefined;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
                  <span>
                    <strong className="font-medium text-fg">{a.userName}</strong> {a.action}
                  </span>
                  {a.elementName &&
                    (seg && a.elementId ? (
                      <Link
                        to={`/campaigns/${campaign.id}/${seg}/${a.elementId}`}
                        className="hover:text-brand"
                      >
                        {a.elementName}
                      </Link>
                    ) : (
                      <span>{a.elementName}</span>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
