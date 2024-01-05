import type { DeepReadonly } from './DeepReadonly';
import { RqliteCursor } from './RqliteCursor';
import { RqliteConcreteLogOptions, RqliteLogOptions } from './RqliteLogOptions';
import { type RqliteNodeSelector, type RqliteConcreteNodeSelector } from './RqliteNodeSelector';
import type { RqliteReadConsistency } from './RqliteReadConsistency';
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
export type RqliteConcreteConnectionOptions = Required<Omit<RqliteConnectionOptions, 'log'>> & {
    log: RqliteConcreteLogOptions;
};
export declare const REDIRECT_STATUS_CODES: ReadonlyArray<number>;
/**
 * The main class from this module. Initialized with the hosts to connect to,
 * use cursor() to create another object (with more specific configuration,
 * if required, usually for setting strength) that can be used to execute
 * queries.
 *
 * You are intended to initialize this once and reuse it for the lifetime of
 * the application.
 */
export declare class RqliteConnection {
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
    constructor(hosts: string[], options?: RqliteConnectionOptions);
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
    fetchResponse<T extends object>(strength: 'none' | 'weak' | 'strong', freshness: string, method: 'GET' | 'POST', path: string, body: BodyInit | undefined, headers: Record<string, string> | undefined, signal: AbortSignal | undefined, parseResponse: (response: Response, signal: AbortSignal) => Promise<T>, requestBytes?: boolean): Promise<T>;
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
    backup(format: 'sql' | 'binary', consumer: (response: Response, signal: AbortSignal) => Promise<void>, signal?: AbortSignal, consistency?: 'none' | 'weak', freshness?: string): Promise<void>;
    /**
     * Backs up the database to the given file. This is a convenience wrapper
     * around `backup`.
     */
    backupToFile(format: 'sql' | 'binary', path: string, signal?: AbortSignal): Promise<void>;
    /**
     * Creates a new cursor which can be used to execute commands. Each cursor
     * can override the default read consistency and freshness, which is a
     * convenient way to group related queries under consistent settings.
     */
    cursor(readConsistency?: RqliteReadConsistency, freshness?: string): RqliteCursor;
}
//# sourceMappingURL=RqliteConnection.d.ts.map