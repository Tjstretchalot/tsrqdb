import type { DeepReadonly } from './DeepReadonly';
import { RqliteCursor } from './RqliteCursor';
import {
  RqliteConcreteLogOptions,
  RqliteLogOptions,
  assignLogOptions,
  deepCopyLogOptions,
  defaultLogOptions,
} from './RqliteLogOptions';
import {
  RqliteDefaultNodeSelector,
  type RqliteNodeSelector,
  type RqliteConcreteNodeSelector,
} from './RqliteNodeSelector';
import type { RqliteReadConsistency } from './RqliteReadConsistency';
import { RqliteCanceledError, RqliteHostsExhaustedError } from './errors';
import fs from 'fs';

export type RqliteConnectionOptions = {
  /**
   * The timeout for a initializing a fetch to a single node, in milliseconds.
   *
   * @default 5000
   */
  timeoutMs?: number;

  /**
   * The timeout for reading a response from a successful fetch to a single node,
   * in milliseconds.
   *
   * @default 60000
   */
  responseTimeoutMs?: number;

  /**
   * The maximum number of redirects to follow for a single query
   *
   * @default 2
   */
  maxRedirects?: number;

  /**
   * The maximum number of attempts to a single host to make for a single
   * query before giving up
   *
   * @default 2
   */
  maxAttemptsPerHost?: number;

  /**
   * The default read consistency for cursors created by the connections
   * cursor() method.
   *
   * @see https://rqlite.io/docs/api/read-consistency/
   * @default 'weak'
   */
  readConsistency?: RqliteReadConsistency;

  /**
   * The default freshness to use for `'none'` read consistency in
   * cursors created by the connections cursor() method.
   *
   * @see https://rqlite.io/docs/api/read-consistency/#limiting-read-staleness
   * @default '5m'
   */
  freshness?: string;

  /**
   * Configures how to log queries. Defaults to console.log with basic timestamps,
   * and color support if chalk is installed.
   */
  log?: RqliteLogOptions;

  /**
   * The node selector to use. Defaults to `RqliteDefaultNodeSelector`, as if by
   * ```ts
   * import { RqliteConnection, RqliteDefaultNodeSelector } from 'rqdb';
   *
   * const connection = new RqliteConnection(['127.0.0.1:4001'], {
   *   nodeSelector: RqliteDefaultNodeSelector,
   * })
   * ```
   *
   * This interface is intended to be powerful enough that if you choose you can
   * implement leader-aware/down-aware node selection. Such node selectors are
   * not currently provided by this repo, although PRs would be accepted.
   */
  nodeSelector?: RqliteNodeSelector;
};

export type RqliteConcreteConnectionOptions = Required<
  Omit<RqliteConnectionOptions, 'log'>
> & { log: RqliteConcreteLogOptions };

export const REDIRECT_STATUS_CODES: ReadonlyArray<number> = [
  301, 302, 303, 307, 308,
];

/**
 * The main class from this module. Initialized with the hosts to connect to,
 * use cursor() to create another object (with more specific configuration,
 * if required, usually for setting strength) that can be used to execute
 * queries.
 *
 * You are intended to initialize this once and reuse it for the lifetime of
 * the application.
 */
export class RqliteConnection {
  /**
   * The base URLs (e.g., `http://127.0.0.1:4001`) of the nodes that we try to
   * connect to. This can be ignored if the connection options inclode a node
   * selector that ignores this.
   */
  readonly hosts: ReadonlyArray<string>;
  /**
   * The options for this connection.
   */
  readonly options: DeepReadonly<RqliteConcreteConnectionOptions>;

  /**
   * The concrete node selector we are using, which may have precomputed
   * information about the hosts to allow for faster selection.
   */
  readonly selector: Readonly<RqliteConcreteNodeSelector>;

  constructor(hosts: string[], options?: RqliteConnectionOptions) {
    this.hosts = hosts;

    const logOptions =
      options?.log === undefined
        ? defaultLogOptions
        : (() => {
            const cp = deepCopyLogOptions(defaultLogOptions);
            assignLogOptions(cp, options.log);
            return cp;
          })();

    this.options = {
      timeoutMs: 5000,
      responseTimeoutMs: 60000,
      maxRedirects: 2,
      maxAttemptsPerHost: 2,
      readConsistency: 'weak',
      freshness: '5m',
      ...options,
      log: logOptions,
      nodeSelector: options?.nodeSelector ?? RqliteDefaultNodeSelector,
    };
    this.selector = this.options.nodeSelector(this.hosts, this.options);
  }

  /**
   * Fetches a response from the cluster. This uses the node selector to
   * iterate through the nodes in the cluster. This handles the following
   * log options:
   *
   * - followRedirect
   * - fetchError
   * - connectTimeout
   * - hostsExhausted
   * - nonOkResponse
   *
   * This rejects when the node selector rejects, which is intended to be for
   * RqliteHostsExhaustedError or RqliteCanceledError. It will never reject with
   * the raw fetch error.
   *
   * @param strength The strength required for the cluster to respond, used
   *   as a hint to the node selector.
   * @param freshness The freshness required for the cluster to respond, used
   *   as a hint to the node selector
   * @param method The HTTP method to use
   * @param path The path to fetch
   * @param body The body to send in the request
   * @param headers The headers to send in the request
   * @param signal The signal to abort the attempt. This will abort the node selector,
   *   if it's running, or in-progress fetches, if any.
   * @param parseResponse A function that parses the response. This is called
   *   only if response.ok. It is passed the same abort signal that is used for
   *   the fetch, so generally it only needs to be handled if there is some kind
   *   of cancelable action besides loading data from the response.
   */
  async fetchResponse<T extends object>(
    strength: 'none' | 'weak' | 'strong',
    freshness: string,
    method: 'GET' | 'POST',
    path: string,
    body: BodyInit | undefined,
    headers: Record<string, string> | undefined,
    signal: AbortSignal | undefined,
    parseResponse: (response: Response, signal: AbortSignal) => Promise<T>,
    requestBytes?: boolean
  ): Promise<T> {
    if (signal?.aborted) {
      throw new RqliteCanceledError();
    }

    const topLevelAbortController = new AbortController();
    const topLevelAbortSignal = topLevelAbortController.signal;
    let cleaningUp = false;
    const cleanup: (() => void)[] = [];

    if (signal !== undefined) {
      const onAbort = () => {
        if (!cleaningUp) {
          topLevelAbortController.abort();
        }
      };

      signal.addEventListener('abort', onAbort);
      cleanup.push(() => {
        signal.removeEventListener('abort', onAbort);
      });
    }

    try {
      const selector = this.selector.createNodeSelectorForQuery(
        strength,
        freshness,
        topLevelAbortSignal,
        path
      );
      let followingHost: string | undefined = undefined;
      while (true) {
        if (topLevelAbortSignal.aborted) {
          throw new RqliteCanceledError();
        }
        let nextNode: string;
        try {
          nextNode = followingHost ?? (await selector.selectNode());
        } catch (e) {
          if (e instanceof RqliteHostsExhaustedError) {
            if (this.options.log.hostsExhausted.enabled) {
              const msg = this.options.log.meta.format(
                this.options.log.hostsExhausted.level,
                'All hosts exhausted',
                e
              );
              if (msg !== undefined) {
                this.options.log.hostsExhausted.method(msg, e);
              }
            }
          }
          throw e;
        }

        followingHost = undefined;
        if (topLevelAbortSignal.aborted) {
          throw new RqliteCanceledError();
        }

        const fetchAbortController = new AbortController();
        const fetchAbortSignal = fetchAbortController.signal;
        let fetchTimeout: NodeJS.Timeout | undefined = undefined;
        let fetchTimeoutReached: boolean = false;
        const onFetchTimeout = () => {
          fetchTimeout = undefined;
          fetchTimeoutReached = true;
          fetchAbortController.abort();
        };
        const onTopLevelAbort = () => {
          if (fetchTimeout !== undefined) {
            clearTimeout(fetchTimeout);
            fetchTimeout = undefined;
          }
          fetchAbortController.abort();
        };
        cleanup.push(() => {
          if (fetchTimeout !== undefined) {
            clearTimeout(fetchTimeout);
            fetchTimeout = undefined;
          }
          topLevelAbortSignal.removeEventListener('abort', onTopLevelAbort);
        });
        topLevelAbortSignal.addEventListener('abort', onTopLevelAbort);
        fetchTimeout = setTimeout(onFetchTimeout, this.options.timeoutMs);

        let response: Response | undefined = undefined;
        let responseBody: T | undefined = undefined;
        let startedReadingResponse = false;
        try {
          response = await fetch(`${nextNode}${path}`, {
            method,
            body,
            headers,
            signal: fetchAbortSignal,
            redirect: 'manual',
          });
          if (
            response.ok &&
            fetchTimeout !== undefined &&
            !topLevelAbortSignal.aborted
          ) {
            clearTimeout(fetchTimeout);
            fetchTimeout = setTimeout(
              onFetchTimeout,
              this.options.responseTimeoutMs
            );
            startedReadingResponse = true;
            responseBody = await parseResponse(response, fetchAbortSignal);
          }
          cleanup.pop()!();
        } catch (e) {
          if (topLevelAbortSignal.aborted) {
            throw new RqliteCanceledError();
          }
          cleanup.pop()!();
          if (fetchTimeoutReached) {
            if (startedReadingResponse) {
              if (this.options.log.readTimeout.enabled) {
                const msg = this.options.log.meta.format(
                  this.options.log.readTimeout.level,
                  `Timeout reading response from ${nextNode}${path}`,
                  e
                );
                if (msg !== undefined) {
                  this.options.log.readTimeout.method(msg, e);
                }
              }
            } else if (this.options.log.connectTimeout.enabled) {
              const msg = this.options.log.meta.format(
                this.options.log.connectTimeout.level,
                `Timeout fetching from ${nextNode}${path}`,
                e
              );
              if (msg !== undefined) {
                this.options.log.connectTimeout.method(msg, e);
              }
            }
            await selector.onFailure({
              type: 'timeout',
            });
          } else {
            if (this.options.log.fetchError.enabled) {
              const msg = this.options.log.meta.format(
                this.options.log.fetchError.level,
                `Error fetching from ${nextNode}${path}`,
                e
              );
              if (msg !== undefined) {
                this.options.log.fetchError.method(msg, e);
              }
            }
            await selector.onFailure({
              type: 'fetchError',
            });
          }
          continue;
        }

        cleanup.push(() => {
          fetchAbortController.abort();
        });

        if (topLevelAbortSignal.aborted) {
          throw new RqliteCanceledError();
        }

        if (REDIRECT_STATUS_CODES.includes(response.status)) {
          const redirectLocation = response.headers.get('location');
          if (redirectLocation === null) {
            if (this.options.log.nonOkResponse.enabled) {
              const msg = this.options.log.meta.format(
                this.options.log.nonOkResponse.level,
                `Redirect response missing location header from ${nextNode}${path} despite status code ${response.status}`
              );
              if (msg !== undefined) {
                this.options.log.nonOkResponse.method(msg);
              }
            }
            await selector.onFailure({
              type: 'nonOKResponse',
              subtype: 'body',
              response,
            });
            cleanup.pop()!();
            continue;
          }

          const decision = await selector.onRedirect({
            type: 'redirect',
            location: redirectLocation,
            response,
          });
          if (topLevelAbortSignal.aborted) {
            throw new RqliteCanceledError();
          }

          if (decision.follow) {
            followingHost = decision.overrideFollowTarget ?? redirectLocation;
            const pathSepIdx = followingHost.indexOf(
              '/',
              followingHost.startsWith('http') ? 'https://'.length : 0
            );
            if (pathSepIdx >= 0) {
              followingHost = followingHost.substring(0, pathSepIdx);
            }

            if (this.options.log.followRedirect.enabled) {
              const msg = this.options.log.meta.format(
                this.options.log.followRedirect.level,
                `Following redirect from ${nextNode}${path} to ${followingHost}`
              );
              if (msg !== undefined) {
                this.options.log.followRedirect.method(msg);
              }
            }
          } else if (this.options.log.nonOkResponse.enabled) {
            const msg = this.options.log.meta.format(
              this.options.log.nonOkResponse.level,
              `Exceeded max redirects, last host: ${nextNode}${path}, last location: ${redirectLocation}`
            );
            if (msg !== undefined) {
              this.options.log.nonOkResponse.method(msg);
            }
          }
          cleanup.pop()!();
          continue;
        }

        if (!response.ok) {
          if (this.options.log.nonOkResponse.enabled) {
            const msg = this.options.log.meta.format(
              this.options.log.nonOkResponse.level,
              `Non-OK response from ${nextNode}${path}: ${response.status} ${response.statusText}`
            );
            if (msg !== undefined) {
              this.options.log.nonOkResponse.method(msg);
            }
          }
          await selector.onFailure({
            type: 'nonOKResponse',
            subtype: 'status',
            response,
          });
          if (topLevelAbortSignal.aborted) {
            throw new RqliteCanceledError();
          }
          cleanup.pop()!();
          continue;
        }

        if (responseBody === undefined) {
          throw new Error(
            'parseResponse returned undefined, despite not being aborted'
          );
        }

        return responseBody;
      }
    } finally {
      cleaningUp = true;
      for (const c of cleanup) {
        c();
      }
    }
  }

  /**
   * Backs up the database to the given stream. This is the general-purpose
   * implementation, it is often more convenient to use backupToFile to write
   * to a file.
   *
   * @param format The format to use for the backup, either 'sql' for raw SQL
   *   (may be very large uncompressed) or 'binary' for a binary format
   *   (faster, smaller)
   * @param consumer The function capable of consuming the response after we have
   *   verified it's OK.
   * @param signal The signal to abort the backup
   * @param consistency The consistency hint to the node selector. Note that this
   *   is not handled by the underlying rqlite cluster, and thus requires a separate
   *   request, which could race. Note that performance is significantly enhanced
   *   when performing the backup on the leader node, and the default settings will
   *   cause the leader to be discovered and used.
   * @param freshness The freshness hint to the node selector. Note that this is not
   *   handled by the underlying rqlite cluster, and the default node selector will
   *   ignore it.
   */
  async backup(
    format: 'sql' | 'binary',
    consumer: (response: Response, signal: AbortSignal) => Promise<void>,
    signal?: AbortSignal,
    consistency?: 'none' | 'weak',
    freshness?: string
  ): Promise<void> {
    const readConsistencyHint = consistency ?? 'weak';
    const freshnessHint = freshness ?? this.options.freshness;
    const path = '/db/backup' + (format === 'sql' ? '?fmt=sql' : '');

    const requestId = Math.random().toString(36).substring(2);
    const backupStart = this.options.log.backupStart;
    if (backupStart.enabled) {
      const message = this.options.log.meta.format(
        backupStart.level,
        `  [RQLITE BACKUP {${requestId}} format=${format}] Starting backup...`
      );
      if (message !== undefined) {
        backupStart.method(message);
      }
    }

    const requestStartedAt = performance.now();
    await this.fetchResponse<object>(
      readConsistencyHint,
      freshnessHint,
      'GET',
      path,
      undefined,
      undefined,
      signal,
      async (response, signal) => {
        if (signal.aborted) {
          throw new RqliteCanceledError();
        }
        await consumer(response, signal);
        return {};
      }
    );
    const requestEndedAt = performance.now();
    const backupEnd = this.options.log.backupEnd;
    if (backupEnd.enabled) {
      const timeTakenSeconds = (requestEndedAt - requestStartedAt) / 1000;
      const message = this.options.log.meta.format(
        backupEnd.level,
        `  [RQLITE BACKUP {${requestId}} format=${format}] Backup complete in ${timeTakenSeconds.toLocaleString(
          undefined,
          {
            maximumFractionDigits: 3,
          }
        )}s`
      );
      if (message !== undefined) {
        backupEnd.method(message);
      }
    }
  }

  /**
   * Backs up the database to the given file. This is a convenience wrapper
   * around `backup`.
   */
  backupToFile(
    format: 'sql' | 'binary',
    path: string,
    signal?: AbortSignal
  ): Promise<void> {
    return this.backup(
      format,
      async (response, signal) => {
        if (response.body === null) {
          throw new Error('Response body is null');
        }
        const body = response.body;

        const out = fs.createWriteStream(path);
        try {
          let byobReader: ReadableStreamBYOBReader | undefined = undefined;
          try {
            byobReader = body.getReader({ mode: 'byob' });
          } catch (e) {}

          if (byobReader !== undefined) {
            const buffer = new Uint8Array(16 * 1024);
            while (true) {
              if (signal.aborted) {
                throw new RqliteCanceledError();
              }
              const { value, done } = await byobReader.read(buffer);
              if (value !== undefined) {
                await new Promise<void>((resolve, reject) =>
                  out.write(value, (e) => {
                    if (e === undefined || e === null) {
                      resolve();
                    } else {
                      reject(e);
                    }
                  })
                );
              }
              if (done) {
                break;
              }
            }
          } else {
            const reader = body.getReader();
            while (true) {
              if (signal.aborted) {
                throw new RqliteCanceledError();
              }
              const { value, done } = await reader.read();
              if (value !== undefined) {
                await new Promise<void>((resolve, reject) =>
                  out.write(value, (e) => {
                    if (e === undefined || e === null) {
                      resolve();
                    } else {
                      reject(e);
                    }
                  })
                );
              }
              if (done) {
                break;
              }
            }
          }
        } finally {
          out.close();
        }
      },
      signal,
      'none',
      undefined
    );
  }

  /**
   * Creates a new cursor which can be used to execute commands. Each cursor
   * can override the default read consistency and freshness, which is a
   * convenient way to group related queries under consistent settings.
   */
  cursor(readConsistency?: RqliteReadConsistency, freshness?: string) {
    return new RqliteCursor(
      this,
      readConsistency === undefined && freshness === undefined
        ? undefined
        : { readConsistency, freshness }
    );
  }
}
