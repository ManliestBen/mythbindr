import { useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite, useInvitePreview } from '../data/invites';

export default function AcceptInvite() {
  const { token } = useParams();
  const preview = useInvitePreview(token ?? '');
  const accept = useAcceptInvite(token ?? '');
  const navigate = useNavigate();

  const onAccept = () =>
    accept.mutate(undefined, {
      onSuccess: (r) => navigate(`/campaigns/${r.campaignId}`),
    });

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="rounded-xl border border-app-border bg-app-surface p-6 text-center">
        {preview.isLoading && <p className="text-sm text-fg-muted">Loading invite…</p>}
        {preview.error && (
          <p className="text-sm text-red-400">This invite is invalid or has expired.</p>
        )}
        {preview.data && (
          <>
            <h1 className="font-heading text-xl font-bold">
              Join “{preview.data.campaignName}”
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              {preview.data.inviterName} invited you as <strong>{preview.data.role}</strong>.
            </p>
            {accept.error && (
              <p className="mt-2 text-sm text-red-400">
                {accept.error instanceof Error ? accept.error.message : 'Could not accept'}
              </p>
            )}
            <button
              onClick={onAccept}
              disabled={accept.isPending}
              className="mt-4 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
            >
              {accept.isPending ? 'Joining…' : 'Accept invite'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
