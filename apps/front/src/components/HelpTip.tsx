/**
 * Inline "?" tooltip for D&D jargon (CR, AC, attunement…). Hover or focus to
 * read; harmless to ignore — aimed at first-time GMs without slowing veterans.
 */
export default function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-app-border text-[10px] font-bold leading-none text-fg-muted group-hover:border-brand group-hover:text-brand"
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-60 -translate-x-1/2 rounded-lg border border-app-border bg-app-surface2 p-2.5 text-xs font-normal normal-case tracking-normal text-fg opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}
