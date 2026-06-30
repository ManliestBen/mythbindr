import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePresence, type Participant } from '../realtime/usePresence';
import { useAuth } from '../auth/AuthProvider';
import { ELEMENT_TYPE_BY_SEGMENT, segmentForType } from '../data/elementTypes';
import {
  useBacklinks,
  useCreateElement,
  useDeleteElement,
  useElement,
  useUpdateElement,
} from '../data/elements';
import ElementForm, {
  type ElementFormResult,
  type ElementFormValues,
} from '../components/ElementForm';
import XpCalculator from '../components/encounter/XpCalculator';
import { useGenerateElement } from '../data/ai';

export default function ElementEditor() {
  const { cid, type: seg, elementId } = useParams();
  const cfg = seg ? ELEMENT_TYPE_BY_SEGMENT[seg] : undefined;
  const isNew = elementId === 'new';
  const navigate = useNavigate();

  const { data: element, isLoading } = useElement(cid ?? '', isNew ? undefined : elementId);
  const create = useCreateElement(cid ?? '');
  const update = useUpdateElement(cid ?? '', elementId ?? '');
  const del = useDeleteElement(cid ?? '');
  const backlinks = useBacklinks(cid ?? '', isNew ? undefined : elementId);
  const participants = usePresence(isNew ? undefined : elementId);
  const { user } = useAuth();
  const generate = useGenerateElement(cid ?? '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [genDefaults, setGenDefaults] = useState<ElementFormValues | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const [conflict, setConflict] = useState(false);

  const backTo = `/campaigns/${cid}/${seg}`;

  if (!cfg || !cfg.available) {
    return <p className="text-sm text-fg-muted">Not available.</p>;
  }
  if (!isNew && isLoading) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }
  if (!isNew && !element) {
    return <p className="text-sm text-red-400">{cfg.label} not found.</p>;
  }

  const onSubmit = (r: ElementFormResult) => {
    if (isNew) {
      create.mutate(
        { type: cfg.type, ...r },
        { onSuccess: () => navigate(backTo) },
      );
    } else {
      update.mutate(
        { ...r, expectedVersion: element?.version },
        {
          onSuccess: () => navigate(backTo),
          onError: (err) => {
            if ((err as { status?: number }).status === 409) setConflict(true);
          },
        },
      );
    }
  };

  const onDelete = () => {
    if (!element) return;
    if (!window.confirm(`Move "${element.name}" to trash?`)) return;
    del.mutate(element.id, { onSuccess: () => navigate(backTo) });
  };

  const mutationError = (isNew ? create.error : update.error) as Error | null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isNew ? `New ${cfg.label}` : `Edit ${cfg.label}`}
        </h1>
        <div className="flex items-center gap-3">
          <PresenceAvatars participants={participants} />
          {!isNew && cfg.type === 'encounter' && (
            <Link
              to={`/campaigns/${cid}/session?from=${elementId}`}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-app-bg hover:bg-brand-bright"
            >
              Run encounter
            </Link>
          )}
          {!isNew && (
            <button
              onClick={onDelete}
              disabled={del.isPending}
              className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {conflict && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-600/40 px-3 py-2 text-sm text-amber-400">
          <span>This element was changed by someone else.</span>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-app-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
          >
            Reload
          </button>
        </div>
      )}

      {isNew && user?.isAdmin && (
        <div className="mt-4 rounded-xl border border-app-border bg-app-surface p-4">
          <div className="flex items-center gap-2">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={`Describe this ${cfg.label.toLowerCase()} for the AI to draft…`}
              className="flex-1 rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={() =>
                aiPrompt.trim() &&
                generate.mutate(
                  { type: cfg.type, prompt: aiPrompt.trim() },
                  {
                    onSuccess: (el) => {
                      setGenDefaults({
                        name: el.name,
                        body: el.body,
                        tagsInput: el.tags.join(', '),
                        secrets: el.secrets,
                        playerVisible: false,
                      });
                      setFormKey((k) => k + 1);
                    },
                  },
                )
              }
              disabled={generate.isPending}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
            >
              {generate.isPending ? 'Generating…' : '✨ Generate'}
            </button>
          </div>
          {generate.error && (
            <p className="mt-2 text-xs text-red-400">
              {generate.error instanceof Error ? generate.error.message : 'Generation failed'}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-app-border bg-app-surface p-5">
        <ElementForm
          key={`form-${formKey}`}
          campaignId={cid ?? ''}
          dataFields={cfg.dataFields}
          relationships={cfg.relationships}
          selfId={element?.id}
          collabElementId={isNew ? undefined : elementId}
          userName={user?.displayName}
          submitLabel={isNew ? `Create ${cfg.label}` : 'Save changes'}
          busy={create.isPending || update.isPending}
          error={mutationError ? mutationError.message : null}
          defaultValues={
            element
              ? {
                  name: element.name,
                  body: element.body,
                  tagsInput: element.tags.join(', '),
                  playerVisible: element.playerVisible,
                  secrets: element.secrets,
                  data: element.data,
                  relationships: element.links
                    .filter((l) => l.source === 'relationship')
                    .map((l) => ({ targetId: l.targetId, relType: l.relType })),
                }
              : genDefaults
          }
          onSubmit={onSubmit}
          onCancel={() => navigate(backTo)}
        />
      </div>

      {cfg.type === 'encounter' && (
        <div className="mt-4">
          <XpCalculator />
        </div>
      )}

      {!isNew && backlinks.data && backlinks.data.length > 0 && (
        <div className="mt-6 rounded-xl border border-app-border bg-app-surface p-4">
          <h3 className="text-sm font-bold">Linked from</h3>
          <ul className="mt-2 space-y-1">
            {backlinks.data.map((b) => {
              const seg = segmentForType(b.type);
              return (
                <li key={b.id} className="flex items-center gap-2">
                  {seg ? (
                    <Link
                      to={`/campaigns/${cid}/${seg}/${b.id}`}
                      className="text-sm text-fg-muted hover:text-brand"
                    >
                      {b.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-fg-muted">{b.name}</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-fg-muted">
                    {b.type}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function PresenceAvatars({ participants }: { participants: Participant[] }) {
  if (participants.length <= 1) return null; // only me here
  return (
    <div className="flex -space-x-2">
      {participants.map((p) => (
        <span
          key={p.userId}
          title={`${p.displayName} is here`}
          className="grid h-7 w-7 place-items-center rounded-full border border-app-surface bg-app-surface2 text-[10px] font-semibold text-fg"
        >
          {p.displayName.slice(0, 2).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
