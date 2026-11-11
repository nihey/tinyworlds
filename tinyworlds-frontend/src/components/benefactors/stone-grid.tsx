import type { Strings } from "@/i18n";
import { stoneLooks, type FounderRow, type StoneLook } from "@/lib/benefactors";
import { cn } from "@/lib/utils";

const LOOK: Record<StoneLook, string> = {
  gold: "bg-taxi",
  "gold-alt": "bg-[#ffdd6e]",
  anon: "bg-[#5a5d61]",
  empty: "bg-white/[0.08]",
};

/** The city's foundation stones, ten to a row: laid ones take their founder's look, the first and the last are marked. */
export function StoneGrid({
  stones,
  founders,
  t,
}: {
  stones: (number | null)[];
  founders: FounderRow[];
  t: Strings;
}) {
  const looks = stoneLooks(stones, founders);
  const byNumber = new Map(founders.map((f) => [f.number, f]));
  const last = stones.length - 1;
  return (
    <div className="my-3 grid grid-cols-10 gap-[3px]">
      {looks.map((look, i) => {
        const owner = stones[i];
        const founder = owner === null ? undefined : byNumber.get(owner);
        const title =
          owner === null
            ? undefined
            : t.benefactors.stoneTitle
                .replace("{n}", String(i + 1))
                .replace("{name}", founder?.name ?? t.benefactors.anonymous);
        const marked = i === 0 || i === last;
        return (
          <span
            key={i}
            title={title}
            className={cn(
              "relative aspect-square rounded-[2px] shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]",
              LOOK[look],
              marked &&
                "after:absolute after:inset-[30%] after:rotate-45 after:rounded-[1px] after:bg-taxi-ink after:content-['']",
            )}
          />
        );
      })}
    </div>
  );
}
