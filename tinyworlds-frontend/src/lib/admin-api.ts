import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import {
  parseFunnel,
  parseListCounts,
  parseNames,
  type AdminSession,
  type BenefactorName,
  type DonationFunnel,
  type ListCounts,
} from "./admin";
import { API_URL, withTimeout } from "./donate";
import { apiOrigin } from "./links";
import { SignInError as AdminApiError } from "./sign-in-api";

/**
 * The admin pages' side of the API. Signing in lives in `sign-in-api.ts`; the numbers are GraphQL through Apollo Client, with the session in the
 * `Authorization` header. Only ever imported dynamically, by the admin page.
 */

/** How long the admin pages wait for the API: longer than a donor is made to. */
const TIMEOUT = 15_000;

export { SignInError as AdminApiError } from "./sign-in-api";

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

/** Maps what went wrong with a request to the kinds the admin page tells apart. */
function failure(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) return error;
  const unauthorized =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED");
  return new AdminApiError(unauthorized ? "unauthorized" : "failed");
}

const NAMES = gql`
  query BenefactorNames {
    benefactorNames {
      donorId
      name
      hidden
      cities
      lastGiftAt
      linksHidden
      links {
        url
        title
        description
        icon
        image
      }
    }
  }
`;

/** The names on the benefactors' pages, newest gift first (at most 100), hidden ones included. */
export async function fetchNames(session: AdminSession): Promise<BenefactorName[]> {
  try {
    const result = await withTimeout(
      apollo(session.accessToken).query<{ benefactorNames: unknown }>({
        query: NAMES,
        fetchPolicy: "no-cache",
        context: { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT) } },
      }),
      TIMEOUT,
    );
    if (!Array.isArray(result.data?.benefactorNames)) throw new AdminApiError("failed");
    return parseNames(result.data.benefactorNames, apiOrigin());
  } catch (error) {
    throw failure(error);
  }
}

const SET_NAME_HIDDEN = gql`
  mutation SetNameHidden($input: SetNameHiddenInput!) {
    setNameHidden(input: $input)
  }
`;

/** Hides a donor's name from every benefactors list, or shows it again. */
export async function setNameHidden(
  session: AdminSession,
  donorId: string,
  hidden: boolean,
): Promise<void> {
  try {
    const result = await withTimeout(
      apollo(session.accessToken).mutate<{ setNameHidden: boolean }>({
        mutation: SET_NAME_HIDDEN,
        variables: { input: { donorId, hidden } },
        context: { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT) } },
      }),
      TIMEOUT,
    );
    if (result.data?.setNameHidden !== true) throw new AdminApiError("failed");
  } catch (error) {
    throw failure(error);
  }
}

const SET_LINKS_HIDDEN = gql`
  mutation SetLinksHidden($input: SetLinksHiddenInput!) {
    setLinksHidden(input: $input)
  }
`;

/** Takes a donor's links off every list, or puts them back; the name is left as it is. */
export async function setLinksHidden(
  session: AdminSession,
  donorId: string,
  hidden: boolean,
): Promise<void> {
  try {
    const result = await withTimeout(
      apollo(session.accessToken).mutate<{ setLinksHidden: boolean }>({
        mutation: SET_LINKS_HIDDEN,
        variables: { input: { donorId, hidden } },
        context: { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT) } },
      }),
      TIMEOUT,
    );
    if (result.data?.setLinksHidden !== true) throw new AdminApiError("failed");
  } catch (error) {
    throw failure(error);
  }
}

const LIST_COUNTS = gql`
  query ListCounts {
    listCounts {
      cities {
        name
        slug
        waiting
      }
      newCities
    }
  }
`;

/** How many people wait on each city's list and on "new cities": counts, never addresses. */
export async function fetchListCounts(session: AdminSession): Promise<ListCounts> {
  try {
    const result = await withTimeout(
      apollo(session.accessToken).query<{ listCounts: unknown }>({
        query: LIST_COUNTS,
        fetchPolicy: "no-cache",
        context: { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT) } },
      }),
      TIMEOUT,
    );
    const counts = parseListCounts(result.data?.listCounts);
    if (counts === null) throw new AdminApiError("failed");
    return counts;
  } catch (error) {
    throw failure(error);
  }
}
