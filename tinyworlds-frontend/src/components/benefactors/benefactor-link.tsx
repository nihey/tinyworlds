"use client";

import { ArrowUpRight, Link2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { LINK_REL, hostOf, type BenefactorLink } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * A site's icon, on a white tile: many are dark marks on nothing, drawn for a browser's light
 * tab, and would vanish on a sign. A plain link mark where a site has none, or where it does
 * not load. `className` sizes the tile (20 px unless it says).
 */
export function LinkIcon({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src)
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
        onError={() => setBroken(src)}
        className="size-[80%] rounded-[2px] object-contain"
      />
    </span>
  );
}

/** A fixed frame for a page's picture at its original proportions. */
export function LinkPicture({
  src,
  className,
  fallback = <LinkIcon src={null} />,
}: {
  src: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span
      className={cn(
        "relative block aspect-[1.91/1] overflow-hidden rounded-[5px] bg-white/[0.045]",
        className,
      )}
    >
      {broken === src ? (
        <span className="absolute inset-0 grid place-items-center">{fallback}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a small file from the API, no optimizer in a static export
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(src)}
          className="absolute inset-0 size-full object-contain p-1.5"
        />
      )}
    </span>
  );
}

type LinkLook = "card" | "row" | "strip";

/** Picture, title and destination share one link. The card has room for a larger picture. */
export function BenefactorLinkItem({
  link,
  look,
  className,
}: {
  link: BenefactorLink;
  look: LinkLook;
  className?: string;
}) {
  const { t } = useI18n();
  const host = hostOf(link.url);
  const title =
    host === "youtube.com" && link.title.startsWith(`${host}/`) ? "YouTube" : link.title;
  const icon = <LinkIcon src={link.icon} />;
  return (
    <a
      href={link.url}
      target="_blank"
      rel={LINK_REL}
      title={link.description ?? undefined}
      aria-label={t.benefactors.linkLabel.replace("{title}", title).replace("{host}", host)}
      className={cn(
        "group/link block rounded-md border border-sign-line bg-white/[0.025] p-1.5 outline-none transition-colors hover:border-taxi/45 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-taxi",
        look !== "card" && "flex min-h-11 items-center gap-2",
        className,
      )}
    >
      {link.image && (
        <LinkPicture
          src={link.image}
          fallback={icon}
          className={look === "card" ? "mb-1.5 w-full max-h-28" : "w-16 shrink-0"}
        />
      )}
      <span
        className={cn("flex min-w-0 flex-1 items-center gap-2", look === "card" && "px-1 py-0.5")}
      >
        {(look === "card" || !link.image) && icon}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-paper group-hover/link:text-taxi">
            {title}
          </span>
          <span className="block truncate text-[11px] text-paper-dim">{host}</span>
        </span>
        <ArrowUpRight
          aria-hidden
          className="size-3.5 shrink-0 text-paper-dim group-hover/link:text-taxi"
        />
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
  look: LinkLook;
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <ul className={cn(look === "strip" ? "flex gap-2" : "space-y-1.5", className)}>
      {links.map((link) => (
        <li key={link.url} className={look === "strip" ? "w-52 shrink-0" : undefined}>
          <BenefactorLinkItem link={link} look={look} />
        </li>
      ))}
    </ul>
  );
}
