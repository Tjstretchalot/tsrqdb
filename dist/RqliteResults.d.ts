/**
 * A raw item from the rqlite API for the result of a single query.
 */
export type RawRqliteResultItem = {
    /**
     * The result rows, if any. Undefined or unset if a mutating query was
     * executed.
     */
    values?: any[][] | undefined | null;
    /**
     * The id of the last inserted row on the server-side connection used to
     * execute the query. For mutating queries, this can be meaningful if a row
     * was actually inserted. Otherwise, this MAY or MAY NOT be set, and when
     * it is set it will be effectively meaningless.
     */
    last_insert_id?: number | undefined | null;
    /**
     * If this was a mutating query, the number of rows that were affected. If
     * not a mutating query, this MAY or MAY NOT be set, and when it is set it
     * will be effectively meaningless.
     */
    rows_affected?: number | undefined | null;
    /**
     * If a SQL error occurred, this will be set to the error message. Otherwise,
     * this will be undefined or null.
     */
    error?: string | undefined | null;
};
/**
 * An item from the rqlite API for the result of a single query,
 * adapted to use lowerCamelCase for the fields.
 */
export type AdaptedRqliteResultItem = {
    /**
     * If a non-mutating query, the results, one array per row. Undefined or unset
     * if a mutating query was executed.
     */
    readonly results?: ReadonlyArray<ReadonlyArray<any>> | undefined;
    /**
     * The id of the last inserted row on the server-side connection used to
     * execute the query. For mutating queries, this can be meaningful if a row
     * was actually inserted. Otherwise, this MAY or MAY NOT be set, and when
     * it is set it will be effectively meaningless.
     */
    readonly lastInsertId?: number | undefined;
    /**
     * If this was a mutating query, the number of rows that were affected. If
     * not a mutating query, this MAY or MAY NOT be set, and when it is set it
     * will be effectively meaningless.
     */
    readonly rowsAffected?: number | undefined;
    /**
     * If a SQL error occurred, this will be set to the error message. Otherwise,
     * this will be undefined.
     */
    readonly error?: string | undefined;
};
/**
 * A basic class which takes a single raw rqlite result and provides
 * getters using lowerCamelCase for the fields, without eagerly copying the
 * data
 */
export declare class RqliteResultItemAdapter {
    raw: RawRqliteResultItem;
    constructor(raw: RawRqliteResultItem);
    get results(): ReadonlyArray<ReadonlyArray<any>> | undefined;
    get lastInsertId(): number | undefined;
    get rowsAffected(): number | undefined;
    get error(): string | undefined;
}
/**
 * Convenience function to raise with a wrapped error if the result contains an
 * error. Assumes index 0 in the error.
 */
export declare const raiseIfSQLError: (result: AdaptedRqliteResultItem | RawRqliteResultItem) => void;
/**
 * The raw bulk result from the API
 */
export type RqliteBulkResultRaw = {
    /**
     * The result of the queries that were executed, in order. There may be fewer
     * than were requested if a SQL error was raised.
     */
    results: RawRqliteResultItem[];
};
/**
 * The result of queries executed via executeMany2 or executeMany3. Note that
 * if a SQL error was raised, the result may contain fewer items than the
 * number of queries that were executed.
 */
export type RqliteBulkResult = {
    /**
     * The items that were returned, as they were returned. This can be useful
     * if you are expecting a large number of items and want to avoid adapting
     * costs.
     */
    readonly itemsRaw: RawRqliteResultItem[];
    /**
     * The items that were returned, adapted to use lowerCamelCase for the
     * fields. Lazily initialized. Note that this is a shallow copy of
     * itemsRaw, i.e., Object.is(itemsRaw[0].values, items[0].results) will be
     * true.
     */
    readonly items: ReadonlyArray<AdaptedRqliteResultItem>;
};
/**
 * Adapts the raw result from the API, providing a lazily adapted items
 * implementation.
 */
export declare class RqliteBulkResultAdapter {
    readonly itemsRaw: RawRqliteResultItem[];
    private adaptedItems;
    constructor(raw: RqliteBulkResultRaw);
    get items(): AdaptedRqliteResultItem[];
}
/**
 * Convenience function to raise with a wrapped error if any of the results
 * contain an error.
 */
export declare const raiseIfAnySQLError: (result: RqliteBulkResult) => void;
//# sourceMappingURL=RqliteResults.d.ts.map