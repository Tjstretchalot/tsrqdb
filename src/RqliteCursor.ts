import { RqliteConnection } from './RqliteConnection';
import { RqliteReadConsistency } from './RqliteReadConsistency';
import {
  AdaptedRqliteResultItem,
  RqliteResultItemAdapter,
  type RawRqliteResultItem,
  raiseIfSQLError,
  RqliteBulkResultAdapter,
  raiseIfAnySQLError,
  RqliteBulkResult,
} from './RqliteResults';
import {
  ExplainQueryPlan,
  FormatExplainQueryPlanOptions,
  formatExplainQueryPlan,
  parseExplainQueryPlan,
} from './explain';
import { getSqlCommand } from './getSqlCommand';

export type RqliteParameter = string | number | boolean | null;
export type RqliteCursorOptions = {
  /**
   * The read consistency for this cursor, which overrides the connection's
   * read consistency and can be overriden by specifying a read consistency
   * in the `execute`/`executeMany2`/`executeMany3` methods.
   */
  readonly readConsistency?: RqliteReadConsistency;

  /**
   * The freshness for `none`-level read consistency, which overrides the
   * connection's freshness and can be overriden by specifying a freshness
   * in the `execute`/`executeMany2`/`executeMany3` methods.
   */
  readonly freshness?: string;
};

export type RqliteExecuteOptions = {
  /**
   * If unspecified or true, an error is raised (RqliteSQLError) if any
   * of the indicated operations cause a SQL error.
   */
  readonly raiseOnError?: boolean;
  /**
   * A signal which can be used to abort the operation. Note that although this
   * stops client-side work, e.g., servicing the network request or additional
   * retries, it cannot be used to guarrantee the operation was not received
   * or processed by the server.
   */
  readonly signal?: AbortSignal;
};

export type RqliteConsistencyOptions = {
  /**
   * The read consistency for the operations, which overrides the cursor's
   * read consistency
   */
  readonly readConsistency?: RqliteReadConsistency;
  /**
   * The freshness for `none`-level read consistency, which overrides the
   * cursor's freshness.
   */
  readonly freshness?: string;
};

export type RqliteTransactionOptions = {
  /**
   * If a SQL transaction should be used to execute the operations. If
   * unspecified, defaults to true.
   *
   * Enabling this ensures that if a SQL error occurs part-way through,
   * the earlier operations will be immediately rolled back. If disabled,
   * then the operations up to and not including the error will be committed.
   *
   * Note that transactions are not effective for schema changes, e.g.,
   * `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, etc.
   *
   * Note that all operations are executed within a single Raft entry either
   * way, and so either all the operations will be committed to the raft log
   * or none of them, regardless of this setting.
   */
  transaction?: boolean;
};

export type RqliteExplainOptions = {
  /**
   * Ignored unless `out` is specified. If specified, then the options for
   * how to format the query plan.
   */
  format?: FormatExplainQueryPlanOptions;

  /**
   * If specified, then we will format the query plan using the format options
   * and then pass the result to this function. Otherwise, the query plan is
   * not formatted.
   */
  out?: (v: string) => string;
};

type RqliteRawResponse = {
  error?: string;
  results?: RawRqliteResultItem[];
};

const parseResponse = async (
  response: Response
): Promise<[Response, RqliteRawResponse]> => {
  return [response, await response.json()];
};

/**
 * A cursor, which is a stateless object typically created by RqliteConnections
 * `cursor` method and used to actually execute queries. Generally it makes
 * sense to specify the read consistency and freshness at this level, rather
 * than during every query or at the connection level, though all three are
 * supported and can come in handy in different situations.
 *
 * Cursors are expected to be relatively short-lived objects, created only
 * for a specific operation or set of related operations.
 */
export class RqliteCursor {
  /**
   * The connection this is delegating to for fetching results.
   */
  readonly connection: RqliteConnection;

  /**
   * The options for this cursor, which take precedence over the connection's
   * options.
   */
  readonly options?: RqliteCursorOptions;

  constructor(connection: RqliteConnection, options?: RqliteCursorOptions) {
    this.connection = connection;
    this.options = options;
  }

  /**
   * Performs the given SQL operation with the given parameters, returning
   * the adapted result.
   *
   * Example:
   *
   * ```ts
   * import { RqliteCursor } from 'rqdb';
   *
   * declare const cursor: RqliteCursor;
   * declare const email: string;
   *
   * const response = await cursor.execute(
   *   'SELECT users.uid, users.name FROM users WHERE users.email = ?',
   *   [email]
   * );
   *
   * if (response.results === undefined || response.results.length < 1) {
   *   throw new Error('User not found');
   * }
   * const [userUid, userName] = response.results[0];
   * console.log(`Found user with email ${email}: ${userName} (${userUid})`);
   * ```
   *
   *
   * This is the only method that can be used for
   * reads, however, this is rarely a restriction in practice since if you have
   * two SELECT queries like so:
   *
   * ```ts
   * const a = await cursor.execute('SELECT foo.uid FROM foo WHERE foo.name = ? ORDER BY foo.uid ASC LIMIT 1', ['foouid']);
   * const b = await cursor.execute('SELECT bar.uid FROM bar WHERE bar.name = ? ORDER BY bar.uid ASC LIMIT 1', ['baruid']);
   *
   * // do something with a and b
   * ```
   *
   * You can combine them into a single query in many different ways, e.g.,
   * for the same result columns:
   *
   * ```ts
   * const response = await cursor.execute(
   *   `
   * SELECT foo.uid FROM foo WHERE foo.name = ? ORDER BY foo.uid ASC LIMIT 1
   * UNION ALL
   * SELECT bar.uid FROM bar WHERE bar.name = ? ORDER BY bar.uid ASC LIMIT 1
   *   `,
   *   ['foouid', 'baruid']
   * );
   * ```
   *
   * Or if there is only one column in each:
   *
   * ```ts
   * const response = await cursor.execute(
   *   `
   * SELECT
   *   (SELECT foo.uid FROM foo WHERE foo.name = ? ORDER BY foo.uid ASC LIMIT 1),
   *   (SELECT bar.uid FROM bar WHERE bar.name = ? ORDER BY bar.uid ASC LIMIT 1)
   *   `,
   *   ['foouid', 'baruid']
   * );
   * ```
   *
   * And sometimes, if `none` level consistency is enough, you actually do want
   * to split the load across nodes:
   *
   * ```ts
   * const [a, b] = await Promise.all([
   *   cursor.execute(
   *     'SELECT foo.uid FROM foo WHERE foo.name = ? ORDER BY foo.uid ASC LIMIT 1',
   *     ['foouid'],
   *     { readConsistency: 'none' }
   *   ),
   *   cursor.execute(
   *     'SELECT bar.uid FROM bar WHERE bar.name = ? ORDER BY bar.uid ASC LIMIT 1',
   *     ['baruid'],
   *     { readConsistency: 'none' }
   *   ),
   * ])
   * ```
   *
   * @param operation The SQL operation to perform
   * @param parameters The parameters to use in the operation
   * @param executeOptions The options for this execution, which take precedence
   *   over the cursor options.
   */
  async execute(
    operation: string,
    parameters?: ReadonlyArray<RqliteParameter>,
    executeOptions?: RqliteExecuteOptions & RqliteConsistencyOptions
  ): Promise<AdaptedRqliteResultItem> {
    const raiseOnError = executeOptions?.raiseOnError ?? true;
    const readConsistency =
      executeOptions?.readConsistency ??
      this.options?.readConsistency ??
      this.connection.options.readConsistency;
    const freshness =
      executeOptions?.freshness ??
      this.options?.freshness ??
      this.connection.options.freshness;
    const params = parameters ?? [];

    const command = getSqlCommand(operation);
    const isRead = command === 'SELECT' || command === 'EXPLAIN';
    const requestId = Math.random().toString(36).substring(2);

    let requestStartedAt: number;
    let response: Promise<[Response, RqliteRawResponse]>;
    if (isRead) {
      const readStart = this.connection.options.log.readStart;
      if (readStart.enabled) {
        let abridgedQuery = operation;
        if (
          readStart.maxLength !== undefined &&
          abridgedQuery.length > readStart.maxLength
        ) {
          abridgedQuery =
            abridgedQuery.substring(0, readStart.maxLength) + '...';
        }

        let abridgedParameters = JSON.stringify(params);
        if (
          readStart.maxLength !== undefined &&
          abridgedParameters.length > readStart.maxLength
        ) {
          abridgedParameters =
            abridgedParameters.substring(0, readStart.maxLength) + '...';
        }

        let freshnessStr = '';
        if (readConsistency === 'none') {
          freshnessStr = `, freshness="${freshness}"`;
        }

        const rawMessage = `  [RQLITE ${command} @ ${readConsistency}${freshnessStr} {${requestId}}] - ${JSON.stringify(
          abridgedQuery
        )}; ${abridgedParameters}`;
        const message = this.connection.options.log.meta.format(
          readStart.level,
          rawMessage
        );
        if (message !== undefined) {
          readStart.method(message);
        }
      }

      requestStartedAt = performance.now();
      response = this.connection.fetchResponse(
        readConsistency,
        freshness,
        'POST',
        '/db/query?level=' +
          readConsistency +
          (readConsistency === 'none' ? '&freshness=' + freshness : '') +
          (readConsistency !== 'none' ? '&redirect' : ''),
        JSON.stringify([[operation, ...params]]),
        { 'Content-Type': 'application/json; charset=UTF-8' },
        executeOptions?.signal,
        parseResponse
      );
    } else {
      const writeStart = this.connection.options.log.writeStart;
      if (writeStart.enabled) {
        let abridgedQuery = operation;
        if (
          writeStart.maxLength !== undefined &&
          abridgedQuery.length > writeStart.maxLength
        ) {
          abridgedQuery =
            abridgedQuery.substring(0, writeStart.maxLength) + '...';
        }

        let abridgedParameters = JSON.stringify(params);
        if (
          writeStart.maxLength !== undefined &&
          abridgedParameters.length > writeStart.maxLength
        ) {
          abridgedParameters =
            abridgedParameters.substring(0, writeStart.maxLength) + '...';
        }

        const rawMessage = `  [RQLITE ${command} {${requestId}}] - ${JSON.stringify(
          abridgedQuery
        )}; ${abridgedParameters}`;
        const message = this.connection.options.log.meta.format(
          writeStart.level,
          rawMessage
        );
        if (message !== undefined) {
          writeStart.method(message);
        }
      }

      requestStartedAt = performance.now();
      response = this.connection.fetchResponse(
        'strong',
        freshness,
        'POST',
        '/db/execute?redirect',
        JSON.stringify([[operation, ...params]]),
        { 'Content-Type': 'application/json; charset=UTF-8' },
        executeOptions?.signal,
        parseResponse
      );
    }

    const [rawResponseObj, rawResponse] = await response;
    const requestTime = performance.now() - requestStartedAt;

    const responseLog = isRead
      ? this.connection.options.log.readResponse
      : this.connection.options.log.writeResponse;
    if (responseLog.enabled) {
      let abridgedPayload = JSON.stringify(rawResponse);
      if (
        responseLog.maxLength !== undefined &&
        abridgedPayload.length > responseLog.maxLength
      ) {
        abridgedPayload =
          abridgedPayload.substring(0, responseLog.maxLength) + '...';
      }

      const requestTimeSeconds = requestTime / 1000;
      const rawMessage = `    {${requestId}} in ${requestTimeSeconds.toLocaleString(
        undefined,
        { maximumFractionDigits: 3 }
      )}s via ${rawResponseObj.url} - ${abridgedPayload}`;
      const message = this.connection.options.log.meta.format(
        responseLog.level,
        rawMessage
      );
      if (message !== undefined) {
        responseLog.method(message);
      }
    }

    if (rawResponse.error !== undefined) {
      const errorCleaned =
        typeof rawResponse.error === 'string'
          ? rawResponse.error
          : JSON.stringify(rawResponse.error);

      if (
        isRead &&
        errorCleaned === 'stale read' &&
        readConsistency === 'none'
      ) {
        const readStale = this.connection.options.log.readStale;
        if (readStale.enabled) {
          const rawMessage = `    {${requestId}} ->> stale read, retrying with weak consistency`;
          const message = this.connection.options.log.meta.format(
            readStale.level,
            rawMessage
          );
          if (message !== undefined) {
            readStale.method(message);
          }
        }
        return await this.execute(operation, parameters, {
          ...executeOptions,
          readConsistency: 'weak',
        });
      }
      throw new Error(errorCleaned);
    }

    if (rawResponse.results === undefined) {
      throw new Error('No results returned');
    }

    if (rawResponse.results.length !== 1) {
      throw new Error('Unexpected number of results returned');
    }

    const rawResult = rawResponse.results[0];
    const result = new RqliteResultItemAdapter(rawResult);
    if (raiseOnError) {
      raiseIfSQLError(result);
    }
    return result;
  }

  /**
   * Executes multiple operations within a single request and, by default, within
   * a transaction.
   *
   * Regardless of what type of operations are passed in, they will be executed
   * as if they are mutating, i.e., they will be executed on all nodes, no
   * result nodes will be returned, and the operations will be committed to the
   * Raft log.
   *
   * This is essentially the same method as `executeMany3` but with a slightly
   * different signature (operations first, then parameters).
   *
   * Generally this should only be used if:
   * - you have no parameters
   * - you have very consistent parameters across all operations
   * - you already broke out the parameters for other reasons
   *
   * Otherwise, prefer `executeMany3`, which keeps the parameters near their
   * respective operations.
   *
   * Example:
   *
   * ```tsx
   * import { RqliteCursor } from 'rqdb';
   *
   * declare const cursor: RqliteCursor;
   * declare const uid: string;
   * declare const name: string;
   * declare const createdAt: Date;
   *
   * const params = [uid, name, createdAt];
   * const response = await cursor.executeMany2([
   *   'INSERT INTO users (uid, name, created_at) VALUES (?, ?, ?)',
   *   'INSERT INTO users_log (uid, name, created_at) VALUES (?, ?, ?)',
   * ], [0, 1].map((v) => params));
   * const [userResult, userLogResult] = response.items;
   * if (userResult.rowsAffected !== 1 || userLogResult.rowsAffected !== 1) {
   *   throw new Error(
   *     `Expected to insert 1 user (actual: ${userResult.rowsAffected}) ` +
   *       `and 1 user log (actual: ${userLogResult.rowsAffected})`
   *   );
   * }
   * ```
   *
   * @param operations The operations to execute
   * @param parameters For each operation, the parameters to use in the operation
   * @param executeOptions The options for this execution, which take precedence
   *   over the cursor options.
   * @returns The result of each operation, in order. If a SQL error occurs, then
   *   there may be fewer results than operations.
   */
  async executeMany2(
    operations: ReadonlyArray<string>,
    parameters?: ReadonlyArray<ReadonlyArray<RqliteParameter>>,
    executeOptions?: RqliteExecuteOptions & RqliteTransactionOptions
  ): Promise<RqliteBulkResult> {
    const raiseOnError = executeOptions?.raiseOnError ?? true;
    const params = parameters ?? operations.map(() => []);
    const transaction = executeOptions?.transaction ?? true;

    if (operations.length !== params.length) {
      throw new Error('operations and parameters must be the same length');
    }

    const path = '/db/execute?redirect' + (transaction ? '&transaction' : '');
    const requestId = Math.random().toString(36).substring(2);

    const combinedRequest = [
      ...operations.map((operation, idx) => [operation, ...params[idx]]),
    ];

    const writeStart = this.connection.options.log.writeStart;
    if (writeStart.enabled) {
      let abridgedRequest = JSON.stringify(combinedRequest, null, 2);
      if (
        writeStart.maxLength !== undefined &&
        abridgedRequest.length > writeStart.maxLength
      ) {
        abridgedRequest =
          abridgedRequest.substring(0, writeStart.maxLength) + '...';
      }

      const rawMessage = `  [RQLITE BULK {${requestId}}] - ${abridgedRequest}`;
      const message = this.connection.options.log.meta.format(
        writeStart.level,
        rawMessage
      );
      if (message !== undefined) {
        writeStart.method(message);
      }
    }

    const requestStartedAt = performance.now();
    const [rawResponseObj, rawResponse] = await this.connection.fetchResponse(
      'strong',
      this.connection.options.freshness,
      'POST',
      path,
      JSON.stringify(combinedRequest),
      { 'Content-Type': 'application/json; charset=UTF-8' },
      executeOptions?.signal,
      parseResponse
    );
    const requestTime = performance.now() - requestStartedAt;

    const writeResponse = this.connection.options.log.writeResponse;
    if (writeResponse.enabled) {
      let abridgedPayload = JSON.stringify(rawResponse);
      if (
        writeResponse.maxLength !== undefined &&
        abridgedPayload.length > writeResponse.maxLength
      ) {
        abridgedPayload =
          abridgedPayload.substring(0, writeResponse.maxLength) + '...';
      }

      const requestTimeSeconds = requestTime / 1000;
      const rawMessage = `    {${requestId}} in ${requestTimeSeconds.toLocaleString(
        undefined,
        { maximumFractionDigits: 3 }
      )}s via ${rawResponseObj.url} - ${abridgedPayload}`;
      const message = this.connection.options.log.meta.format(
        writeResponse.level,
        rawMessage
      );
      if (message !== undefined) {
        writeResponse.method(message);
      }
    }

    if (rawResponse.error !== undefined) {
      const errorCleaned =
        typeof rawResponse.error === 'string'
          ? rawResponse.error
          : JSON.stringify(rawResponse.error);

      throw new Error(errorCleaned);
    }

    if (rawResponse.results === undefined) {
      throw new Error('No results returned');
    }

    const response: RqliteBulkResult = new RqliteBulkResultAdapter({
      results: rawResponse.results,
    });

    if (raiseOnError) {
      raiseIfAnySQLError(response);
    }

    return response;
  }

  /**
   * Executes multiple operations within a single request and, by default, within
   * a transaction.
   *
   * Regardless of what type of operations are passed in, they will be executed
   * as if they are mutating, i.e., they will be executed on all nodes, no
   * result nodes will be returned, and the operations will be committed to the
   * Raft log.
   *
   * This is essentially the same method as `executeMany2` but with a slightly
   * different signature (parameters and operations are combined). This is very
   * similar to the actual rqlite API, except with the parameters in their own
   * array rather than inlined in the operation (for improved type safety and
   * to reduce copying when delegating to executeMany2).
   *
   * This is the preferred method for executing multiple operations unless there
   * are no parameters or the parameters are very consistent across all operations.
   *
   * Example:
   *
   * ```ts
   * import { RqliteCursor } from 'rqdb';
   *
   * declare const cursor: RqliteCursor;
   * declare const userUid: string;
   * declare const name: string;
   * declare const createdAt: Date;
   * declare const socialUid: string;
   * declare const githubUrl: string;
   *
   * const response = await cursor.executeMany3([
   *   [
   *     "INSERT INTO users (uid, name, created_at) VALUES (?, ?, ?)",
   *     [userUid, name, createdAt]
   *   ]
   * ])
   * ```
   */
  async executeMany3(
    operationsAndParameters: ReadonlyArray<
      [string, ReadonlyArray<RqliteParameter>]
    >,
    executeOptions?: RqliteExecuteOptions & RqliteTransactionOptions
  ): Promise<RqliteBulkResult> {
    return await this.executeMany2(
      operationsAndParameters.map(([operation]) => operation),
      operationsAndParameters.map(([, parameters]) => parameters),
      executeOptions
    );
  }

  /**
   * Accepts any query; if it is not prefixed with `EXPLAIN` then it will be
   * prefixed with `EXPLAIN QUERY PLAN`. The result will then be parsed into
   * the corresponding tree structure and returned.
   *
   * If the `out` option is specified, then before returning the tree structure
   * will be formatted according to the `format` option and sent to the `out`
   * function, which can improve DX especially in REPL environments when you
   * want to log the formatted result.
   *
   * This always raises if there is an error and can only operate at the
   * none/weak consistency level. If the read consistency is not specified and
   * the cursor read consistency is strong (or unspecified and the connection
   * read consistency is strong), then weak consistency is used instead.
   *
   * @param operation The SQL operation to explain. May optionally be prefixed
   *   with EXPLAIN or EXPLAIN QUERY PLAN, otherwise it will be prefixed with
   *   EXPLAIN QUERY PLAN.
   * @param parameters The parameters to use for determining the query plan,
   *   e.g., especially within LIKE clauses the bound value can affect the
   *   plan
   * @param options The options for this execution, which take precedence
   *   over the cursor options.
   */
  async explain(
    operation: string,
    parameters?: ReadonlyArray<RqliteParameter>,
    options?: Omit<RqliteExecuteOptions, 'raiseOnError'> &
      RqliteConsistencyOptions & {
        readConsistency: 'none' | 'weak';
      } & RqliteExplainOptions
  ): Promise<ExplainQueryPlan> {
    const command = getSqlCommand(operation);
    if (command !== 'EXPLAIN') {
      operation = 'EXPLAIN QUERY PLAN ' + operation;
    }

    const readConsistencyRaw =
      options?.readConsistency ??
      this.options?.readConsistency ??
      this.connection.options.readConsistency;
    const readConsistency =
      readConsistencyRaw === 'strong' ? 'weak' : readConsistencyRaw;

    const result = await this.execute(operation, parameters, {
      ...options,
      readConsistency,
      raiseOnError: true,
    });

    if (result.results === undefined) {
      throw new Error('EXPLAIN query did not return any results');
    }

    const queryPlan = parseExplainQueryPlan(result.results);
    if (options?.out) {
      const fmted = formatExplainQueryPlan(queryPlan, options.format);
      options.out(fmted);
    }
    return queryPlan;
  }
}
