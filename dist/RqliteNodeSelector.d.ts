import type { RqliteConcreteConnectionOptions } from './RqliteConnection';
import type { DeepReadonly } from './DeepReadonly';
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
export type RqliteNodeNonRedirectFailure = RqliteNodeFailureTimeout | RqliteNodeFailureFetchError | RqliteNodeFailureNonOKResponse;
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
     * wrong node. Shoul
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
     */
    createNodeSelectorForQuery: (strength: 'none' | 'weak' | 'strong', freshness: string, signal: AbortSignal) => RqliteQueryNodeSelector;
};
export type RqliteNodeSelector = (hosts: ReadonlyArray<string>, args: DeepReadonly<RqliteConcreteConnectionOptions>) => RqliteConcreteNodeSelector;
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
export declare const RqliteRandomNodeSelector: RqliteNodeSelector;
//# sourceMappingURL=RqliteNodeSelector.d.ts.map