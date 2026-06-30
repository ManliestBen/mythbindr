import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  useChangeRole,
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  type Role,
} from '../data/members';
import { useCreateShareLink, useRevokeShareLink, useShareLinks } from '../data/share';

export default function Members() {
  const { cid } = useParams();
  const { user } = useAuth();
  const members = useMembers(cid ?? '');
  const invites = useInvites(cid ?? '');
  const createInvite = useCreateInvite(cid ?? '');
  const revokeInvite = useRevokeInvite(cid ?? '');
  const changeRole = useChangeRole(cid ?? '');
  const removeMember = useRemoveMember(cid ?? '');
  const shareLinks = useShareLinks(cid ?? '');
  const createShareLink = useCreateShareLink(cid ?? '');
  const revokeShareLink = useRevokeShareLink(cid ?? '');
  const [copied, setCopied] = useState<string | null>(null);

  const myRole = members.data?.find((m) => m.userId === user?.id)?.role;
  const isOwner = myRole === 'owner';

  const copy = (url: string, id: string) => {
    navigator.clipboard?.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Members</h1>

      <section className="mt-6">
        <h2 className="font-heading text-lg font-bold">People</h2>
        <div className="mt-3 space-y-2">
          {members.data?.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between rounded-xl border border-app-border bg-app-surface p-3"
            >
              <div>
                <span className="font-medium">{m.displayName}</span>
                {m.userId === user?.id && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-fg-muted">
                    you
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.userId !== user?.id ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        changeRole.mutate({ userId: m.userId, role: e.target.value as Role })
                      }
                      className="rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand"
                    >
                      <option value="owner">owner</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${m.displayName}?`)) removeMember.mutate(m.userId);
                      }}
                      className="rounded-lg border border-app-border px-2 py-1 text-sm text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-app-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
                    {m.role}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isOwner && (
        <section className="mt-8">
          <h2 className="font-heading text-lg font-bold">Invite a co-GM</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Generate a link and send it to someone. They accept it while signed in.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => createInvite.mutate('editor')}
              disabled={createInvite.isPending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
            >
              Invite editor
            </button>
            <button
              onClick={() => createInvite.mutate('viewer')}
              disabled={createInvite.isPending}
              className="rounded-lg border border-app-border px-4 py-2 text-sm text-fg hover:border-fg-muted"
            >
              Invite viewer
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {invites.data?.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface p-3"
              >
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wide text-fg-muted">
                    {inv.role}
                  </span>
                  <div className="truncate text-xs text-fg-muted">{inv.url}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => copy(inv.url, inv.id)}
                    className="rounded-lg border border-app-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
                  >
                    {copied === inv.id ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id)}
                    className="rounded-lg border border-app-border px-2 py-1 text-xs text-red-400 hover:text-red-300"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {invites.data?.length === 0 && (
              <p className="text-sm text-fg-muted">No pending invites.</p>
            )}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="mt-8">
          <h2 className="font-heading text-lg font-bold">Share with players</h2>
          <p className="mt-1 text-sm text-fg-muted">
            A public read-only link showing only elements marked “visible in the player share
            view”. GM secrets are never included.
          </p>
          <button
            onClick={() => createShareLink.mutate()}
            disabled={createShareLink.isPending}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
          >
            Create share link
          </button>
          <div className="mt-4 space-y-2">
            {shareLinks.data?.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface p-3"
              >
                <div className="truncate text-xs text-fg-muted">{l.url}</div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => copy(l.url, l.id)}
                    className="rounded-lg border border-app-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
                  >
                    {copied === l.id ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => revokeShareLink.mutate(l.id)}
                    className="rounded-lg border border-app-border px-2 py-1 text-xs text-red-400 hover:text-red-300"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {shareLinks.data?.length === 0 && (
              <p className="text-sm text-fg-muted">No share links yet.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
