/**
 * The buttons the front page and "Your cities" share, as class lists: one place for each look,
 * so a Donate button is the same wherever a city can be funded.
 */

/** The page's main action: a filled pill in the accent. */
export const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-taxi px-5 text-[15px] font-semibold whitespace-nowrap text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]";

/** A second action beside it: the same pill, outlined. */
export const ACTION_QUIET =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-paper/25 px-5 text-[15px] font-semibold whitespace-nowrap text-paper transition-colors outline-none hover:border-taxi hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]";

const PILL =
  "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-[color,background-color,border-color,filter] outline-none focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)]";

/** A card's Donate: outlined in the accent, filled under the pointer. */
export const PILL_DONATE = `${PILL} border-taxi/55 text-taxi hover:border-taxi hover:bg-taxi hover:text-taxi-ink`;

/** A card's quieter action (Benefactors). */
export const PILL_GHOST = `${PILL} border-paper/20 text-paper hover:border-paper`;

/** A card's action that is already on (Explore, on a built city). */
export const PILL_SOLID = `${PILL} border-transparent bg-taxi text-taxi-ink hover:brightness-110`;

/** A link in a sign's running text: quiet, underlined. */
export const QUIET =
  "rounded-sm text-[13px] font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";
