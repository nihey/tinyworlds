"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { LINK_REL, hostOf, type BenefactorLink } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * A site's icon, on a white tile: many are dark marks on nothing, drawn for a browser's light
 * tab, and would vanish on a sign. A plain link mark where a site has none, or where it does
 * not load. `className` sizes the tile (20 px unless it says).
 */
export function LinkIcon({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <span className={cn("grid size-5 shrink-0 place-items-center", className)}>
        <Link2 aria-hidden className="size-[80%] text-paper-dim" strokeWidth={2.25} />
      </span>
    );
  return (
    <span
      className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] bg-white", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small file from the API, no optimizer in a static export */}
      <img
        src={src}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="size-[80%] rounded-[2px] object-contain"
      />
    </span>
  );
}

/** A page's picture, in a share card's shape; gone if it does not load. */
export function LinkPicture({ src, className }: { src: string; className?: string }) {
  const [there, setThere] = useState(true);
  if (!there) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small file from the API, no optimizer in a static export
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setThere(false)}
      className={cn(
        "aspect-[1.91/1] rounded-md bg-white/[0.04] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.6)]",
        className,
      )}
    />
  );
}

/**
 * One of a benefactor's links: the site's icon, the page's title and where it leads. It opens
 * in a new tab and says `dofollow`, a link a search engine follows (`LINK_REL`). As a
 * `card` its picture, when it has one to show, lies across the top; as a `row` the picture is
 * a small one in the icon's place.
 */
export function BenefactorLinkItem({
  link,
  look,
  className,
}: {
  link: BenefactorLink;
  look: "card" | "row";
  className?: string;
}) {
  const { t } = useI18n();
  const host = hostOf(link.url);
  return (
    <a
      href={link.url}
      target="_blank"
      rel={LINK_REL}
      title={link.description ?? undefined}
      aria-label={t.benefactors.linkLabel.replace("{title}", link.title).replace("{host}", host)}
      className={cn(
        "group/link block rounded-md outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
        className,
      )}
    >
      {look === "card" && link.image && <LinkPicture src={link.image} className="mb-2 w-full" />}
      <span className="flex items-center gap-2">
        {look === "row" && link.image ? (
          <LinkPicture src={link.image} className="w-[68px] shrink-0" />
        ) : (
          <LinkIcon src={link.icon} />
        )}
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-paper group-hover/link:text-taxi">
            {link.title}
          </span>
          <span className="block truncate text-[11px] text-paper-dim">{host}</span>
        </span>
      </span>
    </a>
  );
}

/** A named benefactor's links, one under the other. Draws nothing for none. */
export function BenefactorLinks({
  links,
  look,
  className,
}: {
  links: BenefactorLink[];
  look: "card" | "row";
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <ul className={cn(look === "card" ? "space-y-2.5" : "space-y-1.5", className)}>
      {links.map((link) => (
        <li key={link.url}>
          <BenefactorLinkItem link={link} look={look} />
        </li>
      ))}
    </ul>
  );
}
