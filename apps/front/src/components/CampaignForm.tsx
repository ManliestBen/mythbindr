import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { campaignFormSchema, type CampaignFormValues } from '../data/campaigns';

const inputCls =
  'mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand';
const labelCls = 'block text-xs font-medium text-fg-muted';

export default function CampaignForm({
  defaultValues,
  onSubmit,
  submitLabel,
  busy,
  onCancel,
  error,
}: {
  defaultValues?: Partial<CampaignFormValues>;
  onSubmit: (values: CampaignFormValues) => void;
  submitLabel: string;
  busy?: boolean;
  onCancel?: () => void;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: { startLevel: 1, endLevel: 20, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className={labelCls}>Name</label>
        <input className={inputCls} {...register('name')} placeholder="The Shattered Crown" />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
      </div>
      <div>
        <label className={labelCls}>One-line hook</label>
        <input
          className={inputCls}
          {...register('hook')}
          placeholder="A kingdom's crown is shattered and its shards scattered…"
        />
      </div>
      <div>
        <label className={labelCls}>Setting</label>
        <input className={inputCls} {...register('settingName')} placeholder="The Riven Reach" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start level</label>
          <input
            type="number"
            min={1}
            max={20}
            className={inputCls}
            {...register('startLevel', { valueAsNumber: true })}
          />
          {errors.startLevel && (
            <p className="mt-1 text-xs text-red-400">{errors.startLevel.message}</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Target end level</label>
          <input
            type="number"
            min={1}
            max={20}
            className={inputCls}
            {...register('endLevel', { valueAsNumber: true })}
          />
          {errors.endLevel && (
            <p className="mt-1 text-xs text-red-400">{errors.endLevel.message}</p>
          )}
        </div>
      </div>
      <div>
        <label className={labelCls}>Story so far</label>
        <textarea rows={3} className={inputCls} {...register('storySoFar')} />
      </div>

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
