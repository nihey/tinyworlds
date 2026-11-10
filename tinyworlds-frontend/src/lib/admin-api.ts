import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { Locale } from "@/i18n/locale";
import { authUrl, parseFunnel, sessionOf, type AdminSession, type DonationFunnel } from "./admin";
import { API_URL, withTimeout } from "./donate";

/**
 * The admin pages' side of the API. Signing in is REST (as auth is everywhere in these
 * projects); the numbers are GraphQL through Apollo Client, with the session in the
 * `Authorization` header. Only ever imported dynamically, by the admin page.
 */

/** How long the admin pages wait for the API: longer than a donor is made to. */
const TIMEOUT = 15_000;

/** Why a call failed, as far as the page tells them apart. */
export type AdminFailure = "unauthorized" | "too-many" | "failed";

export class AdminApiError extends Error {
  constructor(readonly kind: AdminFailure) {
    super(kind);
  }
}

async function post(route: "magic-link" | "verify", body: unknown): Promise<unknown> {
  const url = authUrl(API_URL, route);
  if (!url) throw new AdminApiError("failed");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    throw new AdminApiError("failed");
  }
  if (response.status === 401) throw new AdminApiError("unauthorized");
  if (response.status === 429) throw new AdminApiError("too-many");
  if (!response.ok) throw new AdminApiError("failed");
  return response.json().catch(() => null);
}

/**
 * Asks for a sign-in link to be mailed. The API answers the same whether or not the address is
 * an admin's, so this resolving says only that the request arrived.
 */
export async function requestLink(email: string, returnUrl: string, locale: Locale): Promise<void> {
  await post("magic-link", { email, returnUrl, locale });
}

/** Trades the token of a sign-in link for a session; "unauthorized" when the link is spent or stale. */
export async function verifyLink(token: string): Promise<AdminSession> {
  const session = sessionOf(await post("verify", { token }));
  if (!session) throw new AdminApiError("failed");
  return session;
}

let client: { token: string; apollo: ApolloClient } | null = null;

/** One client per session: a new sign-in never reads what the last one cached. */
function apollo(token: string): ApolloClient {
  if (client?.token !== token)
    client = {
      token,
      apollo: new ApolloClient({
        link: new HttpLink({ uri: API_URL, headers: { authorization: `Bearer ${token}` } }),
        cache: new InMemoryCache(),
      }),
    };
  return client.apollo;
}

const COUNTS = gql`
  fragment Counts on FunnelCounts {
    visits
    donateOpened
    checkoutStarted
    checkoutCancelled
    donations
    raisedCents
  }
`;

const FUNNEL = gql`
  query DonationFunnel($input: DonationFunnelInput!) {
    donationFunnel(input: $input) {
      timeZone
      totals {
        ...Counts
      }
      worlds {
        world
        visits
        donateOpened
        checkoutStarted
        checkoutCancelled
        donations
        raisedCents
      }
      days {
        day
        visits
        donateOpened
        checkoutStarted
        checkoutCancelled
        donations
        raisedCents
      }
      recentDonations {
        id
        createdAt
        amountCents
        currency
        city
        world
        locale
      }
    }
  }
  ${COUNTS}
`;

/** The donation funnel over a period, with days counted in the admin's own time zone. */
export async function fetchFunnel(
  session: AdminSession,
  range: { from: Date; to: Date },
  timeZone: string,
): Promise<DonationFunnel> {
  try {
    const result = await withTimeout(
      apollo(session.accessToken).query<{ donationFunnel: unknown }>({
        query: FUNNEL,
        variables: {
          input: { from: range.from.toISOString(), to: range.to.toISOString(), timeZone },
        },
        fetchPolicy: "no-cache",
        context: { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT) } },
      }),
      TIMEOUT,
    );
    if (!result.data?.donationFunnel) throw new AdminApiError("failed");
    return parseFunnel(result.data.donationFunnel);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    const unauthorized =
      CombinedGraphQLErrors.is(error) &&
      error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED");
    throw new AdminApiError(unauthorized ? "unauthorized" : "failed");
  }
}
