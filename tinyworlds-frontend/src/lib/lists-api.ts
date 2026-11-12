import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { Locale } from "@/i18n/locale";
import type { AdminSession } from "./admin";
import { API_TIMEOUT, API_URL, withTimeout } from "./donate";
import { listParam, parseMyLists, type ListKey, type MyLists } from "./lists";
import { SignInError } from "./sign-in-api";

/**
 * The lists' calls: a signed-in donor's own (Apollo, one client per session, as
 * `benefactors-api.ts` does) and the leave link's public one (plain `fetch`). Only ever
 * imported dynamically.
 */

const DONOR_TIMEOUT = 15_000;

let donorClient: { token: string; apollo: ApolloClient } | null = null;

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

const LISTS_FIELDS = `
  newCities
  donated
  cities {
    slug
    name
    status
    raisedCents
    goalCents
    waiting
  }
`;

const MY_LISTS = gql`
  query MyLists {
    myLists {
      ${LISTS_FIELDS}
    }
  }
`;

const JOIN_LIST = gql`
  mutation JoinList($input: ListInput!) {
    joinList(input: $input) {
      ${LISTS_FIELDS}
    }
  }
`;

const LEAVE_LIST = gql`
  mutation LeaveList($input: ListInput!) {
    leaveList(input: $input) {
      ${LISTS_FIELDS}
    }
  }
`;

/** The input for a list: no city for "new cities". */
function listInput(key: ListKey, locale?: Locale): { city?: string; locale?: string } {
  const input: { city?: string; locale?: string } = {};
  if (key.kind === "city") input.city = listParam(key);
  if (locale) input.locale = locale;
  return input;
}

function listsOf(answer: unknown): MyLists {
  const lists = parseMyLists(answer);
  if (!lists) throw new SignInError("failed");
  return lists;
}

/** The donor's lists. Rejects with a `SignInError`. */
export async function fetchMyLists(session: AdminSession): Promise<MyLists> {
  try {
    const result = await withTimeout(
      donorApollo(session.accessToken).query<{ myLists: unknown }>({
        query: MY_LISTS,
        fetchPolicy: "no-cache",
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
    return listsOf(result.data?.myLists);
  } catch (error) {
    throw donorFailure(error);
  }
}

/** Puts the donor on a list (the welcome mail is in `locale`); answers their lists. Rejects with a `SignInError`. */
export async function joinList(
  session: AdminSession,
  key: ListKey,
  locale: Locale,
): Promise<MyLists> {
  try {
    const result = await withTimeout(
      donorApollo(session.accessToken).mutate<{ joinList: unknown }>({
        mutation: JOIN_LIST,
        variables: { input: listInput(key, locale) },
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
    return listsOf(result.data?.joinList);
  } catch (error) {
    throw donorFailure(error);
  }
}

/** Takes the donor off a list; answers their lists. Rejects with a `SignInError`. */
export async function leaveList(session: AdminSession, key: ListKey): Promise<MyLists> {
  try {
    const result = await withTimeout(
      donorApollo(session.accessToken).mutate<{ leaveList: unknown }>({
        mutation: LEAVE_LIST,
        variables: { input: listInput(key) },
        context: { fetchOptions: { signal: AbortSignal.timeout(DONOR_TIMEOUT) } },
      }),
      DONOR_TIMEOUT,
    );
    return listsOf(result.data?.leaveList);
  } catch (error) {
    throw donorFailure(error);
  }
}

const LEAVE_WITH_TOKEN =
  "mutation LeaveListWithToken($input: LeaveListWithTokenInput!) { leaveListWithToken(input: $input) }";

/**
 * Leaves from a mail's link, signed in or not: one list, or all of them. True when the token
 * was good (also when it was used before), false when it is not one of ours. Rejects when the
 * API cannot be reached in five seconds, or answers anything else.
 */
export async function leaveWithToken(token: string, all: boolean): Promise<boolean> {
  if (!API_URL) throw new Error("this build names no API");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: LEAVE_WITH_TOKEN, variables: { input: { token, all } } }),
    signal: AbortSignal.timeout(API_TIMEOUT),
  });
  if (!response.ok) throw new Error(`the API answered ${response.status}`);
  const body = (await response.json()) as { data?: { leaveListWithToken?: unknown } } | null;
  const answer = body?.data?.leaveListWithToken;
  if (typeof answer !== "boolean") throw new Error("not the contract's answer");
  return answer;
}
