export type RqliteLogLevel = 'debug' | 'info' | 'warning' | 'error';
type RqliteLogMessageConfigConfigured = {
    /**
     * The function which will be called to log a formatted message.
     *
     * @param message The message to write
     * @param error If an error is associated with the message, the error
     *   that occurred. By default this is ignored as it will be
     *   already included in the message, but it is included here in case
     *   a single formatter is insufficient for your purposes and thus you
     *   need the message broken out from the error.
     * @default `(msg) => console.log(msg)`
     */
    method?: (message: string, error?: any) => void;
    /**
     * The level to format this message as. Only relevant if the formatter
     * respects the level; if you need more detailed controls, you can ignore
     * this and utilize the method implementation.
     * @default 'debug'
     */
    level?: RqliteLogLevel;
    /**
     * If specified and not undefined, this is the approximate maximum length
     * of the message to send to method. This is implemented slightly differently
     * depending on the exact method, and generally only effects the part of the
     * message that will be long. For example, in readResponse, this will restrict
     * the length of the raw response body included in the message
     * @default varies
     */
    maxLength?: number | undefined;
};
export type RqliteLogMessageConfig = boolean | RqliteLogMessageConfigConfigured;
export type RqliteConcreteLogMessageConfig = Required<Omit<RqliteLogMessageConfigConfigured, 'maxLength'>> & {
    maxLength: number | undefined;
    enabled: boolean;
};
export type RqliteLogMeta = {
    /**
     * The function responsible for formatting a message for logging. This
     * is intended for e.g. adding a timestamp or color.
     *
     * @param level The level the message was logged at
     * @param message The message that was sent
     * @param error If an error occurred related to the message, the related error
     * @returns The formatted message to send to the log method, or undefined to suppress the message
     */
    format: (level: RqliteLogLevel, message: string, error?: any) => string | undefined;
};
export type RqliteLogOptions = {
    /**
     * Log options shared by all log messages
     */
    meta?: RqliteLogMeta;
    /**
     * The message to log when `cursor.execute` is called with a SELECT or EXPLAIN
     * query, prior to attempting a connection.
     */
    readStart?: RqliteLogMessageConfig;
    /**
     * The message to log when `cursor.execute` is called with a SELECT or EXPLAIN
     * query, and the response is received from the server.
     */
    readResponse?: RqliteLogMessageConfig;
    /**
     * The message to log when `cursor.execute` is called with a SELECT or EXPLAIN
     * query, the response is received from the server, but rather than getting
     * the data we are informed by the server that we must retry because the data
     * is not sufficiently fresh on the node we connected to. Only occurs on reads
     * with a `none` read consistency.
     */
    readStale?: RqliteLogMessageConfig;
    /**
     * The message to log when `cursor.execute` is called with a mutating query
     * (everything except SELECT and EXPLAIN), prior to attempting a connection.
     */
    writeStart?: RqliteLogMessageConfig;
    /**
     * The message to log when `cursor.execute` is called with a mutating query
     * (everything except SELECT and EXPLAIN), and the response is received from
     * the server.
     */
    writeResponse?: RqliteLogMessageConfig;
    /**
     * The message to log when following a redirect suggested by a node,
     * prior to attempting a connection.
     */
    followRedirect?: RqliteLogMessageConfig;
    /**
     * The message to log when we fail to establish a proper connection with
     * one of the nodes, for example, because it actively refuses the connection
     * or isn't a valid HTTP server.
     *
     * This is the desired response from a node thats down for maintenance.
     */
    fetchError?: RqliteLogMessageConfig;
    /**
     * The message to log when we give up on a connection to one of the nodes
     * because it is taking too long to connect. This may result in duplicate
     * execution of the query.
     *
     * This specifically refers to a timeout set right before fetch, cleared
     * after a response is received but before parsing the response body.
     */
    connectTimeout?: RqliteLogMessageConfig;
    /**
     * The message to log when we give up on reading the response from one of
     * the nodes because it is taking too long to close the connection. This
     * will result in duplicate execution of the query.
     *
     * This specifically refers to a timeout after getting an OK response from
     * fetch, but before reading the entire response body.
     *
     * This usually indicates that the query was too large for the server to
     * process, e.g., selecting from a large table without a limit.
     */
    readTimeout?: RqliteLogMessageConfig;
    /**
     * The message to log when we are giving up on a query and are about to reject
     * because we have exhausted all attempts on all nodes. This implies either
     * the cluster is, as a whole, unresponsive, or:
     * - if the query is non-mutating and the read consistency is `none`, then
     *   we cannot reach any responsive nodes with sufficient freshness
     * - if the query is mutating or the read consistency is not `none`, then
     *   we cannot reach the current leader, or the leader changed pathologically
     *   during our sweep
     */
    hostsExhausted?: RqliteLogMessageConfig;
    /**
     * The message to log when we get a response from the server that is neither
     * OK, nor a redirect when a redirect is expected, nor a stale read when a
     * stale read is expected. This includes excessive redirects, 502/503 while a
     * node is starting, or a 500 when a node is in a bad state.
     */
    nonOkResponse?: RqliteLogMessageConfig;
    /**
     * The message to log when conn.backup() is called, prior to attempting a
     * connection.
     */
    backupStart?: RqliteLogMessageConfig;
    /**
     * The message to log when conn.backup() is called, and the entire response
     * has been received from the server.
     */
    backupEnd?: RqliteLogMessageConfig;
};
export type RqliteConcreteLogOptions = {
    meta: RqliteLogMeta;
} & {
    [k in keyof Omit<RqliteLogOptions, 'meta'>]-?: RqliteConcreteLogMessageConfig;
};
type SQLCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'EXPLAIN';
export declare const defaultColors: Record<RqliteLogLevel | 'timestamp' | 'errorDetails' | SQLCommand | 'BULK', (v: string) => string>;
export declare const defaultFormatter: RqliteLogMeta['format'];
export declare const defaultLogOptions: RqliteConcreteLogOptions;
export declare const deepCopyLogOptions: (opts: RqliteConcreteLogOptions) => RqliteConcreteLogOptions;
export declare const assignLogOptions: (mutate: RqliteConcreteLogOptions, opts: RqliteLogOptions | undefined) => void;
export {};
//# sourceMappingURL=RqliteLogOptions.d.ts.map