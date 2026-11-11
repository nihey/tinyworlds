import fs from "node:fs";
import path from "node:path";
import type { Http } from "./wiki.js";

/**
 * How famous a sight is: how many people read its English Wikipedia article over the last twelve
 * complete months (Wikimedia's pageviews API, human readers only). Fetched through the `wiki`
 * cache, so a rerun asks nothing; the window is kept on first use, so reruns ask the same
 * addresses until forced.
 */

export interface ViewsWindow {
  /** YYYYMM0100: the first day of the first month */
  start: string;
  /** YYYYMMDD00: the last day of the last month */
  end: string;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** The last twelve complete months before `today` (UTC). */
export function viewsWindow(today: Date): ViewsWindow {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth(); // 0-based: the current month, not complete
  const lastDay = new Date(Date.UTC(y, m, 0)); // the last day of the previous month
  const first = new Date(Date.UTC(y - 1, m, 1));
  return {
    start: `${first.getUTCFullYear()}${pad(first.getUTCMonth() + 1)}0100`,
    end: `${lastDay.getUTCFullYear()}${pad(lastDay.getUTCMonth() + 1)}${pad(lastDay.getUTCDate())}00`,
  };
}

/** The article title an English Wikipedia address names, written as the address writes it. */
export function titleOf(url: string): string | null {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/.exec(url);
  return m ? m[1] : null;
}

/** Each title's views over the window; a missing page or a failed request counts as none. */
export async function pageViews(
  http: Http,
  titles: string[],
  window: ViewsWindow,
  log: (m: string) => void = (m) => console.log(m),
): Promise<Map<string, number>> {
  const views = new Map<string, number>();
  let failed = 0;
  for (const title of titles) {
    const url =
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/" +
      `${title}/monthly/${window.start}/${window.end}`;
    try {
      const body = (await http.get(url)) as { items?: { views?: number }[] } | null;
      views.set(
        title,
        (body?.items ?? []).reduce((sum, item) => sum + (item.views ?? 0), 0),
      );
    } catch {
      failed++;
      views.set(title, 0);
    }
  }
  if (failed) log(`quiz: ${failed} page view counts failed (counted as none; run again)`);
  return views;
}

/** The window kept in `file`, or a new one (written there) on first use or when forced. */
export function loadWindow(file: string, today: Date, force: boolean): ViewsWindow {
  if (!force && fs.existsSync(file)) {
    const kept = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ViewsWindow>;
    if (typeof kept.start === "string" && typeof kept.end === "string")
      return { start: kept.start, end: kept.end };
  }
  const window = viewsWindow(today);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(window));
  return window;
}
