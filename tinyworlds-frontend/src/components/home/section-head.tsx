/**
 * A section's title on the fog, and a line saying what the section is. The title carries the
 * section's id: the page's links, and the maps' "more cities" banner, lead to it.
 */
export function SectionHead({ id, title, line }: { id: string; title: string; line?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-4">
      <h2
        id={id}
        className="scroll-mt-6 text-[26px] leading-tight font-semibold tracking-[-0.01em] text-[#15171a] dusk:text-paper"
      >
        {title}
      </h2>
      {line && <p className="text-sm leading-snug text-[#15171a]/70 dusk:text-paper-dim">{line}</p>}
    </div>
  );
}
