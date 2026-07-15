/** Pulsing placeholder rows shown while a list/page loads. */
export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl border border-app-border bg-app-surface"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}
