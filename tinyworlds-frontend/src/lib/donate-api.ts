import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import {
  API_TIMEOUT,
  API_URL,
  isCheckoutUrl,
  parseMilestones,
  withTimeout,
  type CheckoutInput,
  type CityMilestone,
} from "./donate";

/**
 * The donations API, through Apollo Client. This module is only ever imported dynamically, by
 * the donate sign when it opens, so Apollo is not in the bundle the map starts with. No sign-in,
 * and nothing kept between visits: both calls go to the network every time.
 */

let client: ApolloClient | null = null;

function apollo(): ApolloClient {
  client ??= new ApolloClient({ link: new HttpLink({ uri: API_URL }), cache: new InMemoryCache() });
  return client;
}

const MILESTONES = gql`
  query CityMilestones {
    cityMilestones {
      id
      slug
      name
      raisedCents
      goalCents
      donations
      benefactorCount
      status
      worldId
      waiting
    }
  }
`;

const CREATE_CHECKOUT = gql`
  mutation CreateDonationCheckout($input: CreateDonationCheckoutInput!) {
    createDonationCheckout(input: $input) {
      url
    }
  }
`;

/** The cities being funded, most raised first (the API's order). Rejects on any failure or after five seconds. */
export async function fetchMilestones(): Promise<CityMilestone[]> {
  const result = await withTimeout(
    apollo().query<{ cityMilestones: unknown }>({
      query: MILESTONES,
      fetchPolicy: "no-cache",
      context: { fetchOptions: { signal: AbortSignal.timeout(API_TIMEOUT) } },
    }),
    API_TIMEOUT,
  );
  if (!result.data || !Array.isArray(result.data.cityMilestones))
    throw new Error("no city milestones in the answer");
  return parseMilestones(result.data.cityMilestones);
}

/** Opens a checkout for the donor's choice and answers its address. Rejects on any failure or after five seconds. */
export async function createCheckout(input: CheckoutInput): Promise<string> {
  const result = await withTimeout(
    apollo().mutate<{ createDonationCheckout: { url: unknown } }>({
      mutation: CREATE_CHECKOUT,
      variables: { input },
      fetchPolicy: "no-cache",
      context: { fetchOptions: { signal: AbortSignal.timeout(API_TIMEOUT) } },
    }),
    API_TIMEOUT,
  );
  const url = result.data?.createDonationCheckout?.url;
  if (!isCheckoutUrl(url)) throw new Error("no checkout address in the answer");
  return url;
}
