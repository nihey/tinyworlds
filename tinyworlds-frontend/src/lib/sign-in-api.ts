import type { Locale } from "@/i18n/locale";
import { authUrl, sessionOf, type AdminSession, type Purpose } from "./admin";
import { API_URL } from "./donate";

/**
 * Signing in, for admins and donors alike. REST, as auth is everywhere in these projects:
 * a link or a code is mailed, and either one is traded for a session. Only ever imported
 * dynamically.
 */

/** How long the sign-in pages wait for the API: longer than a donor is made to. */
const TIMEOUT = 15_000;

/** Why a call failed, as far as the page tells them apart. */
export type SignInFailure = "unauthorized" | "too-many" | "failed";

export class SignInError extends Error {
  constructor(readonly kind: SignInFailure) {
    super(kind);
  }
}

export async function post(route: "magic-link" | "verify", body: unknown): Promise<unknown> {
  const url = authUrl(API_URL, route);
  if (!url) throw new SignInError("failed");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    throw new SignInError("failed");
  }
  if (response.status === 401) throw new SignInError("unauthorized");
  if (response.status === 429) throw new SignInError("too-many");
  if (!response.ok) throw new SignInError("failed");
  return response.json().catch(() => null);
}

/**
 * Asks for a sign-in link and code to be mailed. The API answers the same whoever the address
 * belongs to, so this resolving says only that the request arrived. `list` ("*" for new cities,
 * or a city's slug) makes opening the link or typing the code join that list too.
 */
export async function requestLink(
  email: string,
  returnUrl: string,
  locale: Locale,
  purpose: Purpose,
  list?: string,
): Promise<void> {
  await post("magic-link", { email, returnUrl, locale, purpose, ...(list ? { list } : {}) });
}

/** Trades the token of a sign-in link for a session; "unauthorized" when the link is spent or stale. */
export async function verifyLink(token: string, purpose: Purpose): Promise<AdminSession> {
  const session = sessionOf(await post("verify", { token }), purpose);
  if (!session) throw new SignInError("failed");
  return session;
}

/** Trades the code from the mail for a session; "unauthorized" when it is wrong, spent or stale. */
export async function verifyCode(
  email: string,
  code: string,
  purpose: Purpose,
): Promise<AdminSession> {
  const session = sessionOf(await post("verify", { email, code, purpose }), purpose);
  if (!session) throw new SignInError("failed");
  return session;
}
