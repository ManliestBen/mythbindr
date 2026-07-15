import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastOptions {
  /** Optional action button (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  kind?: 'info' | 'error';
  /** ms before auto-dismiss; defaults 4000, or 8000 when there's an action. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const Ctx = createContext<((message: string, opts?: ToastOptions) => void) | null>(null);

export function useToast() {
  const t = useContext(Ctx);
  if (!t) throw new Error('useToast must be used within ToastProvider');
  return t;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((cur) => [...cur.slice(-3), { id, message, ...opts }]);
      const ms = opts.duration ?? (opts.actionLabel ? 8000 : 4000);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl',
              t.kind === 'error'
                ? 'border-red-500/40 bg-app-surface text-red-400'
                : 'border-app-border bg-app-surface text-fg',
            ].join(' ')}
          >
            <span className="min-w-0">{t.message}</span>
            <span className="flex shrink-0 items-center gap-2">
              {t.actionLabel && (
                <button
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="rounded-lg border border-app-border px-2.5 py-1 text-xs font-semibold text-brand hover:border-brand"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-xs text-fg-muted hover:text-fg"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
