import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { AdminSession } from "./admin";
import {
  parseCityBenefactors,
  parseGiving,
  type CityBenefactors,
  type MyGiving,
} from "./benefactors";
import { API_TIMEOUT, API_URL, withTimeout } from "./donate";
import { SignInError } from "./sign-in-api";

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

// ---------------------------------------------------------------------------------------------
// the donor's own calls ("Your cities"): a signed-in donor's session in the Authorization header
// ---------------------------------------------------------------------------------------------

/** How long the donor's page waits for the API: a little longer than the public sign does. */
const DONOR_TIMEOUT = 15_000;

let donorClient: { token: string; apollo: ApolloClient } | null = null;

/** One client per session: a new sign-in never reads what the last one cached. */
function donorApollo(token: string): ApolloClient {
  if (donorClient?.token !== token)
    donorClient = {
      token,
      apollo: new ApolloClient({
        link: new HttpLink({ uri: API_URL, headers: { authorization: `Bearer ${token}` } }),
        cache: new InMemoryCache(),
      }),
    };
  return donorClient.apollo;
}

/** "unauthorized" (expired, or not a donor's session) ends the session; anything else is "failed". */
function donorFailure(error: unknown): SignInError {
  if (error instanceof SignInError) return error;
  const refused =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) => e.extensions?.code === "UNAUTHENTICATED" || e.extensions?.code === "FORBIDDEN",
    );
  return new SignInError(refused ? "unauthorized" : "failed");
}

const MY_GIVING = gql`
  query MyGiving {
    myGiving {
      displayName
      projectCents
      cities {
        slug
        name
        status
        worldId
        goalCents
        raisedCents
        givenCents
        founderNumber
        stones
        firstStone
        keystone
        listed
      }
    }
  }
`;

const SET_LISTING = gql`
  mutation SetListing($input: SetListingInput!) {
    setListing(input: $input)
  }
`;

const SET_DISPLAY_NAME = gql`
  mutation SetDisplayName($input: SetDisplayNameInput!) {
    setDisplayName(input: $input)
  }
`;

/** What the signed-in donor has given, city by city. Rejects with a `SignInError`. */
export async function fetchGiving(session: AdminSession): Promise<MyGiving> {
  try {
    const result = await withTimeout(
      donorApollo(session.accessToken).query<{ myGiving: unknown }>({
        query: MY_GIVING,
        fetchPolicy: "no-cache",
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
    const giving = parseGiving(result.data?.myGiving);
    if (!giving) throw new SignInError("failed");
    return giving;
  } catch (error) {
    throw donorFailure(error);
  }
}

/** Names the donor in a city's benefactors, or takes the name off. Rejects with a `SignInError`. */
export async function setListing(
  session: AdminSession,
  slug: string,
  listed: boolean,
): Promise<void> {
  try {
    await withTimeout(
      donorApollo(session.accessToken).mutate({
        mutation: SET_LISTING,
        variables: { input: { city: slug, listed } },
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
  } catch (error) {
    throw donorFailure(error);
  }
}

/** Sets the donor's name; answers with it as the API kept it (cleaned). Rejects with a `SignInError`. */
export async function setDisplayName(session: AdminSession, name: string): Promise<string> {
  try {
    const result = await withTimeout(
      donorApollo(session.accessToken).mutate<{ setDisplayName: unknown }>({
        mutation: SET_DISPLAY_NAME,
        variables: { input: { name } },
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
    const kept = result.data?.setDisplayName;
    if (typeof kept !== "string") throw new SignInError("failed");
    return kept;
  } catch (error) {
    throw donorFailure(error);
  }
}
