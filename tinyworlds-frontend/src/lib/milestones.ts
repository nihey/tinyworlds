import { API_TIMEOUT, API_URL, parseMilestones, type CityMilestone } from "./donate";

/**
 * The cities being funded, asked with a plain `fetch`, like the visits and the wall: the front
 * page shows them at once, and downloading Apollo for one query would hold them up. Apollo is
 * left to the checkout (`donate-api.ts`), which only the donate sign asks for.
 */

export const MILESTONES_QUERY = `query CityMilestones { cityMilestones {
  id slug name raisedCents goalCents donations benefactorCount status worldId waiting } }`;

/** The API's answer as the list of cities; throws when there is no list in it. */
export function parseMilestonesAnswer(body: unknown): CityMilestone[] {
  const rows = (body as { data?: { cityMilestones?: unknown } } | null)?.data?.cityMilestones;
  if (!Array.isArray(rows)) throw new Error("no city milestones in the answer");
  return parseMilestones(rows);
}

/** The cities being funded, most raised first (the API's order). Rejects on any failure or after five seconds. */
export async function fetchMilestones(): Promise<CityMilestone[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: MILESTONES_QUERY }),
    signal: AbortSignal.timeout(API_TIMEOUT),
  });
  if (!res.ok) throw new Error(`The API answered ${res.status}`);
  return parseMilestonesAnswer(await res.json());
}
