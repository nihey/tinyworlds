import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { API_TIMEOUT, API_URL, isCheckoutUrl, withTimeout, type CheckoutInput } from "./donate";

/**
 * The checkout, through Apollo Client. This module is only ever imported dynamically, by the
 * donate sign when a donor asks for the checkout, so Apollo is not in the bundle a page starts
 * with. The list of cities is a plain `fetch` (`milestones.ts`). No sign-in, and nothing kept
 * between visits.
 */

let client: ApolloClient | null = null;

function apollo(): ApolloClient {
  client ??= new ApolloClient({ link: new HttpLink({ uri: API_URL }), cache: new InMemoryCache() });
  return client;
}

const CREATE_CHECKOUT = gql`
  mutation CreateDonationCheckout($input: CreateDonationCheckoutInput!) {
    createDonationCheckout(input: $input) {
      url
    }
  }
`;

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
