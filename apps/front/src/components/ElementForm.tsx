import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import RichTextEditor from './RichTextEditor';
import CollaborativeEditor from './CollaborativeEditor';
import { useElements } from '../data/elements';
import type { DataField } from '../data/elementTypes';

const inputCls =
  'mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand';
const labelCls = 'block text-xs font-medium text-fg-muted';

export const elementFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  body: z.any().optional(),
  tagsInput: z.string().optional(),
  playerVisible: z.boolean().optional(),
  secrets: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
  relationships: z
    .array(z.object({ targetId: z.string(), relType: z.string().optional() }))
    .optional(),
});
export type ElementFormValues = z.infer<typeof elementFormSchema>;

export interface ElementFormResult {
  name: string;
  body: unknown;
  tags: string[];
  playerVisible: boolean;
  secrets: string;
  data: Record<string, unknown>;
  relationships: { targetId: string; relType: string }[];
}

export default function ElementForm({
  defaultValues,
  onSubmit,
  submitLabel,
  busy,
  onCancel,
  error,
  campaignId,
  dataFields = [],
  relationships = false,
  selfId,
  collabElementId,
  userName,
}: {
  defaultValues?: ElementFormValues;
  onSubmit: (result: ElementFormResult) => void;
  submitLabel: string;
  busy?: boolean;
  onCancel?: () => void;
  error?: string | null;
  campaignId: string;
  dataFields?: DataField[];
  relationships?: boolean;
  selfId?: string;
  /** When set, the body is co-edited in real time (Yjs) instead of via the form. */
  collabElementId?: string;
  userName?: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ElementFormValues>({
    resolver: zodResolver(elementFormSchema),
    defaultValues: { relationships: [], data: {}, ...defaultValues },
  });

  const relArray = useFieldArray({ control, name: 'relationships' });
  const { data: allElements } = useElements(campaignId, {});
  const targets = (allElements ?? []).filter((e) => e.id !== selfId);

  const submit = (v: ElementFormValues) =>
    onSubmit({
      name: v.name.trim(),
      // In collab mode Yjs owns the body server-side — don't submit it via REST.
      body: collabElementId ? undefined : v.body ?? null,
      tags: (v.tagsInput ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      playerVisible: v.playerVisible ?? false,
      secrets: v.secrets ?? '',
      data: v.data ?? {},
      relationships: (v.relationships ?? [])
        .filter((r) => r.targetId)
        .map((r) => ({ targetId: r.targetId, relType: r.relType ?? '' })),
    });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className={labelCls}>Name</label>
        <input className={inputCls} {...register('name')} placeholder="Name" />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
      </div>

      {dataFields.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dataFields.map((f) => (
            <div key={f.key} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className={labelCls}>{f.label}</label>
              {f.kind === 'select' ? (
                <select className={inputCls} {...register(`data.${f.key}`)}>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.kind === 'textarea' ? (
                <textarea rows={3} className={inputCls} {...register(`data.${f.key}`)} />
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  className={inputCls}
                  {...register(`data.${f.key}`)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <label className={labelCls}>Body</label>
        {collabElementId ? (
          <CollaborativeEditor
            elementId={collabElementId}
            campaignId={campaignId}
            userName={userName ?? 'GM'}
          />
        ) : (
          <Controller
            control={control}
            name="body"
            render={({ field }) => (
              <RichTextEditor
                value={field.value}
                onChange={field.onChange}
                campaignId={campaignId}
              />
            )}
          />
        )}
      </div>

      {relationships && (
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Relationships</label>
            <button
              type="button"
              onClick={() => relArray.append({ targetId: '', relType: '' })}
              className="text-xs text-fg-muted hover:text-fg"
            >
              + Add
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {relArray.fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  className="w-40 rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-brand"
                  placeholder="ally, rival…"
                  {...register(`relationships.${i}.relType`)}
                />
                <select
                  className="flex-1 rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-brand"
                  {...register(`relationships.${i}.targetId`)}
                >
                  <option value="">Select an element…</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => relArray.remove(i)}
                  className="rounded-lg border border-app-border px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Tags (comma-separated)</label>
        <input className={inputCls} {...register('tagsInput')} placeholder="lore, tavern" />
      </div>
      <div>
        <label className={labelCls}>GM secrets (never shown to players)</label>
        <textarea rows={2} className={inputCls} {...register('secrets')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('playerVisible')} className="accent-brand" />
        Visible in the player share view
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-app-border px-4 py-2 text-sm text-fg-muted hover:text-fg"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
