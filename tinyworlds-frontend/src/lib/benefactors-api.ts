import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { parseCityBenefactors, type CityBenefactors } from "./benefactors";
import { API_TIMEOUT, API_URL, withTimeout } from "./donate";

/**
 * A city's stones, founders and benefactors, through Apollo Client. Only ever imported
 * dynamically, by the benefactors sign when it opens, like `donate-api.ts`.
 */

let client: ApolloClient | null = null;

function apollo(): ApolloClient {
  client ??= new ApolloClient({ link: new HttpLink({ uri: API_URL }), cache: new InMemoryCache() });
  return client;
}

const CITY_BENEFACTORS = gql`
  query CityBenefactors($input: CityBenefactorsInput!) {
    cityBenefactors(input: $input) {
      slug
      name
      status
      worldId
      goalCents
      raisedCents
      stones
      founders {
        number
        name
        amountCents
        stones
        firstStone
        keystone
      }
      benefactors {
        rank
        name
        amountCents
      }
    }
  }
`;

/**
 * The city by its slug or by its world; null for one the API does not know or keeps hidden.
 * Rejects on any failure, on an answer that is not the contract's, or after five seconds.
 */
export async function fetchCityBenefactors(
  by: { slug: string } | { world: string },
): Promise<CityBenefactors | null> {
  const result = await withTimeout(
    apollo().query<{ cityBenefactors: unknown }>({
      query: CITY_BENEFACTORS,
      variables: { input: by },
      fetchPolicy: "no-cache",
      context: { fetchOptions: { signal: AbortSignal.timeout(API_TIMEOUT) } },
    }),
    API_TIMEOUT,
  );
  const answer = result.data?.cityBenefactors;
  if (answer === null) return null;
  const parsed = parseCityBenefactors(answer);
  if (!parsed) throw new Error("the benefactors answer is not what the contract says");
  return parsed;
}
