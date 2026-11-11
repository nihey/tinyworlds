import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { isPublicUrl } from './link-url.js';
import { isPublicAddress } from './public-address.js';

/** Why something was not fetched: a rule of this file, not the network's failure. */
export class FetchRefused extends Error {}

export interface Fetched {
  /** Where the answer came from, redirects followed. */
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
}

export interface FetchOptions {
  accept: string;
  /** The most bytes of the body that are read, once unpacked. */
  maxBytes: number;
  /** A longer body is cut there (a page's head is at its start), or refused whole. */
  longer: 'cut' | 'refuse';
  /** When to give up, in epoch milliseconds: one moment for every hop together. */
  deadline: number;
}

export type Fetcher = (url: string, options: FetchOptions) => Promise<Fetched>;

/** How many times an answer may send the fetch somewhere else. */
export const REDIRECTS_MAX = 3;

/** Who asks. A browser's shape, since many sites answer nothing else; no address, no name of anyone. */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; tinyworlds-link-preview/1.0)';

/** A host name's addresses, all of them. */
export type Resolve = (host: string) => Promise<LookupAddress[]>;

const resolveAll: Resolve = (host) =>
  new Promise((resolve, reject) => {
    dnsLookup(host, { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

/**
 * The lookup a connection is made with: it gives the socket the host's addresses only when
 * every one of them is on the public internet. Because the socket connects to what this
 * answers, and to nothing it looks up again, a name cannot be public when it is checked and
 * private when it is connected to.
 */
export function guardedLookup(resolve: Resolve = resolveAll): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (all) => {
        const wanted =
          options.family === 4 || options.family === 6
            ? all.filter((a) => a.family === options.family)
            : all;
        if (
          wanted.length === 0 ||
          !all.every((a) => isPublicAddress(a.address))
        ) {
          callback(
            new FetchRefused(`${hostname} is not on the public internet`),
            [],
          );
          return;
        }
        if (options.all) callback(null, wanted);
        else callback(null, wanted[0].address, wanted[0].family);
      },
      (error: NodeJS.ErrnoException) => callback(error, []),
    );
  };
}

export interface FetcherSettings {
  /** How a host name becomes addresses: the system's, unless a test says. */
  resolve?: Resolve;
  /**
   * Tests only: plain http, to wherever `allowed` says (a server the test started on this
   * machine), without the lookup's guard. Every hop is still asked of `allowed`.
   */
  test?: { allowed: (url: URL) => boolean };
}

type Answer = { fetched: Fetched } | { location: string };

/**
 * A GET that can be pointed at an address a stranger typed. It asks only public https pages
 * on the default port (`isPublicUrl`), connects only to public addresses (`guardedLookup`),
 * checks every redirect the same way and follows a few, reads no more than it was told to,
 * unpacked, and gives up at the deadline. Certificates are checked as usual.
 */
export function createFetcher(settings: FetcherSettings = {}): Fetcher {
  const allowed = settings.test?.allowed ?? isPublicUrl;
  const lookup = settings.test ? undefined : guardedLookup(settings.resolve);
  const transport = settings.test ? http : https;

  const ask = (url: URL, options: FetchOptions): Promise<Answer> =>
    new Promise((resolve, reject) => {
      const left = options.deadline - Date.now();
      if (left <= 0) {
        reject(new FetchRefused('out of time'));
        return;
      }
      const request = transport.request(
        url,
        {
          method: 'GET',
          // one connection for one question: nothing is kept open or shared
          agent: false,
          lookup,
          signal: AbortSignal.timeout(left),
          headers: {
            accept: options.accept,
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': USER_AGENT,
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const { location } = res.headers;
          if (status >= 300 && status < 400 && location) {
            res.destroy();
            resolve({ location });
            return;
          }
          if (
            options.longer === 'refuse' &&
            Number(res.headers['content-length']) > options.maxBytes
          ) {
            res.destroy();
            reject(new FetchRefused('too large'));
            return;
          }
          const encoding = String(res.headers['content-encoding'] ?? '')
            .trim()
            .toLowerCase();
          const unpack =
            encoding === 'gzip' || encoding === 'x-gzip'
              ? createGunzip()
              : encoding === 'deflate'
                ? createInflate()
                : encoding === 'br'
                  ? createBrotliDecompress()
                  : null;
          if (encoding && encoding !== 'identity' && !unpack) {
            res.destroy();
            reject(new FetchRefused(`packed as ${encoding}`));
            return;
          }
          const body: Readable = unpack ? res.pipe(unpack) : res;
          if (unpack) res.on('error', (error) => unpack.destroy(error));

          const chunks: Buffer[] = [];
          let size = 0;
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve({
              fetched: {
                url: url.href,
                status,
                contentType: res.headers['content-type'] ?? null,
                body: Buffer.concat(chunks),
              },
            });
          };
          const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            res.destroy();
            reject(error);
          };
          body.on('data', (chunk: Buffer) => {
            if (settled) return;
            const room = options.maxBytes - size;
            if (chunk.length <= room) {
              chunks.push(chunk);
              size += chunk.length;
            } else if (options.longer === 'cut') {
              chunks.push(chunk.subarray(0, room));
              done();
              res.destroy();
            } else fail(new FetchRefused('too large'));
          });
          body.on('end', done);
          body.on('error', fail);
          body.on('close', () => fail(new FetchRefused('cut off')));
        },
      );
      request.on('error', reject);
      request.end();
    });

  return async (start, options) => {
    let url = new URL(start);
    for (let hop = 0; hop <= REDIRECTS_MAX; hop++) {
      if (!allowed(url))
        throw new FetchRefused(`not a public https page: ${url.host}`);
      const answer = await ask(url, options);
      if ('fetched' in answer) return answer.fetched;
      try {
        url = new URL(answer.location, url);
      } catch {
        throw new FetchRefused('sent to nowhere');
      }
    }
    throw new FetchRefused('sent on too many times');
  };
}
