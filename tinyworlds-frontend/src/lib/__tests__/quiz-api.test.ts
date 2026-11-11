import { afterEach, describe, expect, it, vi } from "vitest";
import { ANSWER, answerRequest, parseTally, sendAnswer } from "../quiz-api";

const VISIT = "0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10";
const input = {
  world: "tinynyc",
  sightId: "b1",
  choice: "b2",
  choices: ["b3", "b1", "b2", "b4"],
  level: "medium" as const,
  locale: "pt-BR" as const,
};
const tally = { answers: 2, picks: [{ choice: "b2", count: 2 }] };

/** A fetch that answers this body with this status, and remembers what it was asked. */
function answering(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

afterEach(() => vi.useRealTimers());

describe("answerRequest", () => {
  it("sends the answer with the visit", () => {
    expect(answerRequest({ ...input, visitId: VISIT })).toEqual({
      query: ANSWER,
      variables: { input: { ...input, level: "MEDIUM", visitId: VISIT } },
    });
  });

  it("says which four names were offered, so only those are counted", () => {
    expect(answerRequest({ ...input, visitId: VISIT }).variables.input.choices).toEqual([
      "b3",
      "b1",
      "b2",
      "b4",
    ]);
  });

  it("leaves the visit out when it is not counted", () => {
    expect(answerRequest({ ...input, visitId: null }).variables.input).not.toHaveProperty(
      "visitId",
    );
  });
});

describe("parseTally", () => {
  it("reads the tally out of the answer", () => {
    expect(parseTally({ data: { answerQuiz: tally } })).toEqual(tally);
  });

  it("finds none in an answer with errors or another shape", () => {
    expect(parseTally({ errors: [{ message: "Too Many Requests" }], data: null })).toBeNull();
    expect(parseTally({ data: { answerQuiz: { answers: "2", picks: [] } } })).toBeNull();
    expect(
      parseTally({ data: { answerQuiz: { answers: 2, picks: [{ choice: 3, count: 1 }] } } }),
    ).toBeNull();
    expect(parseTally(null)).toBeNull();
  });
});

describe("sendAnswer", () => {
  it("posts the answer to the API and gives back the tally", async () => {
    const { fetch, calls } = answering({ data: { answerQuiz: tally } });
    await expect(
      sendAnswer(input, { fetch, apiUrl: "/api/graphql", visitId: VISIT }),
    ).resolves.toEqual(tally);
    expect(calls[0].url).toBe("/api/graphql");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(
      answerRequest({ ...input, visitId: VISIT }),
    );
  });

  it("gives none when the API fails or refuses", async () => {
    expect(
      await sendAnswer(input, { ...answering({}, 500), apiUrl: "/api", visitId: VISIT }),
    ).toBeNull();
    expect(
      await sendAnswer(input, {
        ...answering({ errors: [{ message: "no" }] }),
        apiUrl: "/api",
        visitId: VISIT,
      }),
    ).toBeNull();
    const broken = (() => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch;
    expect(await sendAnswer(input, { fetch: broken, apiUrl: "/api", visitId: VISIT })).toBeNull();
  });

  it("asks nothing without an API", async () => {
    const { fetch, calls } = answering({ data: { answerQuiz: tally } });
    expect(await sendAnswer(input, { fetch, apiUrl: "", visitId: VISIT })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("gives up on an API that does not answer in time", async () => {
    vi.useFakeTimers();
    const silent = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;
    const answer = sendAnswer(input, {
      fetch: silent,
      apiUrl: "/api",
      visitId: VISIT,
      timeoutMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5001);
    await expect(answer).resolves.toBeNull();
  });
});
