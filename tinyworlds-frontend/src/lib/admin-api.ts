import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { parseFunnel, type AdminSession, type DonationFunnel } from "./admin";
import { API_URL, withTimeout } from "./donate";
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
