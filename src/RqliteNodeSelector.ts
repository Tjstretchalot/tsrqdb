import {
  REDIRECT_STATUS_CODES,
  type RqliteConcreteConnectionOptions,
} from './RqliteConnection';
import { createRandomRangeFunction } from './createRandomRangeFunction';
import { createRandomShuffleFunction } from './createRandomPermutationFunction';
import type { DeepReadonly } from './DeepReadonly';
import { RqliteCanceledError, RqliteHostsExhaustedError } from './errors';

export type RqliteNodeFailureTimeout = {
  type: 'timeout';
};

export type RqliteNodeFailureFetchError = {
  type: 'fetchError';
};

export type RqliteNodeFailureRedirect = {
  type: 'redirect';
  /**
   * The location they are redirecting us to.
   */
  location: string;
  /**
   * The response that was received. This is guarranteed _not_ to have
   * been consumed yet, though the original fetch is set to abort if
   * the query is aborted.
   */
  response: Response;
};

export type RqliteNodeFailureNonOKResponse = {
  type: 'nonOKResponse';
  /**
   * `status` means the status code is why we didn't understand the response,
   * `body` means the body was not well-formatted (e.g., not JSON or missing
   * required fields)
   */
  subtype: 'status' | 'body';
  response: Response;
};

export type RqliteNodeNonRedirectFailure =
  | RqliteNodeFailureTimeout
  | RqliteNodeFailureFetchError
  | RqliteNodeFailureNonOKResponse;

export type RqliteQueryNodeSelector = {
  /**
   * Used to select the next node to try. This is the first function called
   * after construction, which is then followed by one (or many) callbacks. If
   * the final callback is `onFailure`, then this function is repeated.
   *
   * The chain ends either on `onSuccess` or when `selectNode` rejects (usually
   * with `RqliteHostsExhaustedError`)
   */
  selectNode: () => Promise<string>;

  /**
   * Callback for if the query to the node succeeds
   */
  onSuccess: () => Promise<void>;

  /**
   * Callback for if the query to the node fails because we accessed the
   * wrong node. Should return a promise that indicates whether or not
   * to follow the redirect.
   *
   * @param redirect The redirect information
   * @returns Resolve to indicate if we should continue to another node
   *   (`follow: true`), potentially override the node we are following
   *   to (`overrideFollowTarget: 'http://...'`), and if we should log
   *   the standard reason. If `follow` is `false` and `log` is `true`,
   *   we log that we exceeded the maximum number of redirects. If
   *   `follow` is `true` and `log` is true, we log using `followRedirect`.
   *   If `log` is false, you should handle logging yourself
   */
  onRedirect: (redirect: RqliteNodeFailureRedirect) => Promise<{
    follow: boolean;
    overrideFollowTarget?: string;
    log: boolean;
  }>;

  /**
   * Callback for if the query to the node fails
   * @param failure
   * @returns
   */
  onFailure: (failure: RqliteNodeNonRedirectFailure) => Promise<void>;
};

/**
 * Describes something capable of managing the order of nodes to connect
 * to for queries.
 */
export type RqliteConcreteNodeSelector = {
  /**
   * Creates a node selector for managing a single query
   *
   * @param strength The strength that is required to execute the query. For
   *   non-mutating queries, this is the read consistency. For mutating queries,
   *   this is always 'strong'
   * @param freshness The freshness, if the strength is `'none'`
   * @param signal The signal that will be set to abort the query. The node selector
   *   should reject with RqliteCanceledError if the signal is set, as soon as possible.
   * @param path the endpoint that is being attempted; this can be used to change the
   *   behavior of the node selector, e.g, for differentiating backups vs. queries
   */
  createNodeSelectorForQuery: (
    strength: 'none' | 'weak' | 'strong',
    freshness: string,
    signal: AbortSignal,
    path: string
  ) => RqliteQueryNodeSelector;
};

export type RqliteNodeSelector = (
  hosts: ReadonlyArray<string>,
  args: DeepReadonly<RqliteConcreteConnectionOptions>
) => RqliteConcreteNodeSelector;

/**
 * Creates a function that will backoff before starting the next pass,
 * respecting the abort signal.
 */
const makePassBackoff = () => {
  const backoffRandomness = createRandomRangeFunction(256);

  return (passes: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new RqliteCanceledError());
        return;
      }

      let done = false;
      let timeout: NodeJS.Timeout | undefined = undefined;

      const cleanup = () => {
        done = true;
        if (timeout !== undefined) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        if (done) {
          return;
        }
        cleanup();
        reject(new RqliteCanceledError());
      };

      const onTimeout = () => {
        timeout = undefined;
        if (done) {
          return;
        }

        cleanup();
        resolve();
      };

      signal.addEventListener('abort', onAbort);
      timeout = setTimeout(onTimeout, 1000 * 2 ** passes + backoffRandomness());
    });
};

/**
 * There is really only one reasonable way to handle a cluster with a single node;
 * retry until we hit the maximum number of attempts per host, with exponential
 * backoff
 */
const RqliteSingleNodeSelector: RqliteNodeSelector = (
  hosts,
  args
): RqliteConcreteNodeSelector => {
  if (hosts.length !== 1) {
    throw new Error('hosts must have length 1');
  }

  const backoff = makePassBackoff();
  return {
    createNodeSelectorForQuery: (_strength, _freshness, signal) => {
      let passes = 0;
      let redirects = 0;

      return {
        selectNode: async () => {
          if (passes >= args.maxAttemptsPerHost - 1) {
            throw new RqliteHostsExhaustedError(true);
          }

          redirects = 0;
          passes++;
          return hosts[0];
        },
        onSuccess: () => Promise.resolve(),
        onRedirect: async () => {
          if (redirects >= args.maxRedirects) {
            return {
              log: true,
              follow: false,
            };
          }

          redirects++;
          return {
            follow: true,
            log: true,
          };
        },
        onFailure: () => backoff(passes, signal),
      };
    },
  };
};

/**
 * For weak or higher consistency, this attempts each host up to the maximum
 * number of times with a weak no-op query in order to discover the leader,
 * then directs the query initially to the leader.
 *
 * This is primarily not intended to be used by itself; it can be used as
 * an implementation detail of other node selectors to e.g., handle backups.
 * Backups on rqlite v8.15 are substantially faster when they are directed
 * to the leader.
 */
export const RqliteExplicitLeaderDiscoveryNodeSelector: RqliteNodeSelector = (
  hosts,
  args
): RqliteConcreteNodeSelector => {
  if (hosts.length === 1) {
    return RqliteSingleNodeSelector(hosts, args);
  }

  const initialNodeSelector = RqliteRandomNodeSelector(hosts, args);
  return {
    createNodeSelectorForQuery: (strength, freshness, signal, path) => {
      if (strength === 'none') {
        return initialNodeSelector.createNodeSelectorForQuery(
          strength,
          freshness,
          signal,
          path
        );
      }

      const selector = initialNodeSelector.createNodeSelectorForQuery(
        strength,
        freshness,
        signal,
        path
      );
      let delegatingTo: RqliteQueryNodeSelector | null = null;

      return {
        selectNode: async (): Promise<string> => {
          if (delegatingTo !== null) {
            return delegatingTo.selectNode();
          }

          while (true) {
            if (signal.aborted) {
              throw new RqliteCanceledError();
            }

            const nextNode = await selector.selectNode();
            try {
              const response = await fetch(
                `${nextNode}/db/query?level=weak&redirect`,
                {
                  headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                  },
                  body: '[["SELECT 1"]]',
                  signal,
                  redirect: 'manual',
                }
              );
              if (signal.aborted) {
                await selector.onFailure({
                  type: 'timeout',
                });
                throw new RqliteCanceledError();
              }
              if (REDIRECT_STATUS_CODES.includes(response.status)) {
                const location = response.headers.get('Location');
                if (location === null) {
                  await selector.onFailure({
                    type: 'nonOKResponse',
                    subtype: 'status',
                    response,
                  });
                  continue;
                }

                const decision = await selector.onRedirect({
                  type: 'redirect',
                  location,
                  response,
                });

                const urlToTarget = decision.overrideFollowTarget ?? location;
                if (!urlToTarget.startsWith('http')) {
                  await selector.onFailure({
                    type: 'nonOKResponse',
                    subtype: 'body',
                    response,
                  });
                  continue;
                }

                const pathSepIdx = urlToTarget.indexOf('/', 'https://'.length);
                const urlWithoutPath =
                  pathSepIdx < 0
                    ? urlToTarget
                    : urlToTarget.slice(0, pathSepIdx);
                await selector.onSuccess();
                return urlWithoutPath;
              }

              if (!response.ok) {
                await selector.onFailure({
                  type: 'nonOKResponse',
                  subtype: 'status',
                  response,
                });
                continue;
              }
            } catch (e) {
              if (signal.aborted) {
                await selector.onFailure({
                  type: 'timeout',
                });
                throw new RqliteCanceledError();
              }
              await selector.onFailure({
                type: 'fetchError',
              });
            }
          }
        },
        onSuccess: async () => {
          if (delegatingTo === null) {
            return;
          }
          return delegatingTo.onSuccess();
        },
        onFailure: async (failure) => {
          if (delegatingTo === null) {
            delegatingTo = initialNodeSelector.createNodeSelectorForQuery(
              strength,
              freshness,
              signal,
              path
            );
            return;
          }
          return delegatingTo.onFailure(failure);
        },
        onRedirect: async (redirect) => {
          if (delegatingTo === null) {
            delegatingTo = initialNodeSelector.createNodeSelectorForQuery(
              strength,
              freshness,
              signal,
              path
            );
            return {
              follow: false,
              log: true,
            };
          }

          return delegatingTo.onRedirect(redirect);
        },
      };
    },
  };
};

// This is a class primarily to benefit from prototype performance for the
// common production case, rather than regenerating the function pointers
class _RqliteRandomNodeSelectorImpl {
  private readonly hosts: ReadonlyArray<string>;
  private readonly args: DeepReadonly<RqliteConcreteConnectionOptions>;
  private readonly signal: AbortSignal;

  /**
   * Prior to the second call to selectNode(), this is undefined. Then
   * this is initialized to a permutation of hosts.
   */
  private shuffledHosts: string[] | undefined;
  /**
   * The next index which should be used from shuffledHosts. If shuffledHosts is
   * undefined, then shuffledHosts can be imagined as an array which starts with
   * `hosts[initialIndex]`; if `nextIndexInShuffledHosts` is 0, then the
   * conceptual `shuffledHosts[0]` for the next node is `hosts[initialIndex]`.
   * If `nextIndexInShuffledHosts` is 1 and `shuffledHosts` is undefined, then
   * we need to actually shuffle the hosts array.
   */
  private nextIndexInShuffledHosts: number;
  /**
   * The number of loops we've made through shuffledHosts already, for backoff
   * and hosts exhausted purposes.
   */
  private loopsThroughShuffledHosts: number;
  /**
   * The number of times onRedirect has been called since the last call to
   * selectNode
   */
  private redirects: number;
  /**
   * A precomputed, optimized function that returns a random number between
   * 0 (inclusive) and the length of hosts (exclusive)
   */
  private randomHostIndex: () => number;
  /**
   * A precomputed, optimized function that returns a random permutation of
   * the integers between 0 (inclusive) and hosts.length - 2 (inclusive)
   */
  private firstPassRandomShuffle: () => number[];
  /**
   * A precomputed, optimized function that returns a random permutation of
   * the integers between 0 (inclusive) and hosts.length - 1 (inclusive)
   */
  private repeatedPassRandomShuffle: () => number[];
  /**
   * The backoff function to use between passes
   */
  private backoff: (passes: number, signal: AbortSignal) => Promise<void>;
  /**
   * The first host that we will return in selectNode; used to avoid having
   * to shuffle hosts for the most common case where the first node succeeds
   * (or redirects to success)
   */
  private initialIndex: number;

  constructor(
    hosts: ReadonlyArray<string>,
    args: DeepReadonly<RqliteConcreteConnectionOptions>,
    signal: AbortSignal,
    // precomputable
    randomHostIndex: () => number,
    firstPassRandomShuffle: () => number[],
    repeatedPassRandomShuffle: () => number[],
    backoff: (passes: number, signal: AbortSignal) => Promise<void>
  ) {
    this.hosts = hosts;
    this.args = args;
    this.signal = signal;
    this.shuffledHosts = undefined;
    this.nextIndexInShuffledHosts = 0;
    this.loopsThroughShuffledHosts = 0;
    this.redirects = 0;
    this.randomHostIndex = randomHostIndex;
    this.firstPassRandomShuffle = firstPassRandomShuffle;
    this.repeatedPassRandomShuffle = repeatedPassRandomShuffle;
    this.backoff = backoff;
    this.initialIndex = this.randomHostIndex();
  }

  async selectNode() {
    this.redirects = 0;
    if (this.shuffledHosts === undefined) {
      if (this.nextIndexInShuffledHosts === 0) {
        this.nextIndexInShuffledHosts = 1;
        return this.hosts[this.initialIndex];
      }

      const permutation = this.firstPassRandomShuffle();
      this.shuffledHosts = new Array<string>(this.hosts.length);
      this.shuffledHosts[0] = this.hosts[this.initialIndex];
      for (let i = 0; i < this.hosts.length - 1; i++) {
        let permIndex = permutation[i];
        if (permIndex >= this.initialIndex) {
          permIndex++;
        }
        this.shuffledHosts[i + 1] = this.hosts[permIndex];
      }
    }

    if (this.nextIndexInShuffledHosts >= this.shuffledHosts.length) {
      if (this.loopsThroughShuffledHosts >= this.args.maxAttemptsPerHost - 1) {
        throw new RqliteHostsExhaustedError(true);
      }

      this.loopsThroughShuffledHosts++;
      const permutation = this.repeatedPassRandomShuffle();
      for (let i = 0; i < this.hosts.length; i++) {
        let permIndex = permutation[i];
        if (permIndex >= this.initialIndex) {
          permIndex++;
        }
        this.shuffledHosts[i] = this.hosts[permIndex];
      }
      this.nextIndexInShuffledHosts = 0;
    }

    const result = this.shuffledHosts[this.nextIndexInShuffledHosts];
    this.nextIndexInShuffledHosts++;
    return result;
  }

  async onSuccess() {}

  async onRedirect() {
    if (this.redirects >= this.args.maxRedirects) {
      return {
        log: true,
        follow: false,
      };
    }

    this.redirects++;
    return {
      follow: true,
      log: true,
    };
  }

  onFailure() {
    if (this.nextIndexInShuffledHosts >= this.hosts.length) {
      return this.backoff(this.loopsThroughShuffledHosts, this.signal);
    }
    return Promise.resolve();
  }
}

/**
 * For each query, repeatedly select a node at random without replacement
 * until all nodes have been attempted, backoff, then repeat until the maximum
 * number of attempts per node has been reached.
 *
 * This is a mathematically simple to analyze algorithm for selecting nodes. As
 * with almost all methods, the worst case is a tarpit node, i.e., one where we
 * have to timeout to determine it's non-responsive. Nodes which actively reject
 * are generally not going to cause any significant issues with this technique.
 *
 * @param hosts The hosts that can be tried
 * @param args The connection options
 */
export const RqliteRandomNodeSelector: RqliteNodeSelector = (
  hosts,
  args
): RqliteConcreteNodeSelector => {
  if (hosts.length === 0) {
    throw new Error('hosts must not be empty');
  }

  if (hosts.length === 1) {
    return RqliteSingleNodeSelector(hosts, args);
  }

  const randomHostIndex = createRandomRangeFunction(hosts.length);

  // since most of the time we will only need one node, we will select
  // the first node first, and only if that fails will we actually copy
  // and shuffle the hosts array.
  const firstPassRandomShuffle = createRandomShuffleFunction(hosts.length - 1);
  const repeatedPassRandomShuffle = createRandomShuffleFunction(hosts.length);
  const backoff = makePassBackoff();

  return {
    createNodeSelectorForQuery: (_strength, freshness, signal, path) => {
      return new _RqliteRandomNodeSelectorImpl(
        hosts,
        args,
        signal,
        randomHostIndex,
        firstPassRandomShuffle,
        repeatedPassRandomShuffle,
        backoff
      );
    },
  };
};

/**
 * The current default node selector. This implementation is subject to change, but
 * currently works as follows:
 *
 * - For queries, this acts like the random node selector
 * - For backups, this acts like the explicit leader discovery node selector
 *
 * @param hosts The hosts that can be tried
 * @param args The connection options
 */
export const RqliteDefaultNodeSelector: RqliteNodeSelector = (
  host,
  args
): RqliteConcreteNodeSelector => {
  const querySelector = RqliteRandomNodeSelector(host, args);
  // we will initialize the backup selector on-demand as it's rarely used

  return {
    createNodeSelectorForQuery(strength, freshness, signal, path) {
      if (path.startsWith('/db/backup')) {
        return RqliteExplicitLeaderDiscoveryNodeSelector(
          host,
          args
        ).createNodeSelectorForQuery(strength, freshness, signal, path);
      }

      return querySelector.createNodeSelectorForQuery(
        strength,
        freshness,
        signal,
        path
      );
    },
  };
};
