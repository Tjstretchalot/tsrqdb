/**
 * The error that should be raised by the node selector if it is unable
 * to select a node to query. The message will be ignored and the logging
 * configuration for `hostsExhausted` will be used instead.
 */
export class RqliteHostsExhaustedError extends Error {
  /**
   * True if standard logging should be used, false if the node selector
   * handled logging already.
   */
  readonly log: boolean;

  constructor(log: boolean) {
    super('All hosts exhausted');
    this.log = log;
  }
}

/**
 * The error that SHOULD be raised by the node selector if the signal is set
 * while it is executing. The node selector MAY return a valid response.
 */
export class RqliteCanceledError extends Error {
  constructor() {
    super('Query canceled');
  }
}

/**
 * The error raised by the cursor if raiseOnError is true and a SQL error
 * occurs in one of the operations.
 */
export class RqliteSQLError extends Error {
  readonly rawError: string;
  readonly queryIndex: number;

  constructor(message: string, rawError: string, queryIndex: number) {
    super(message);
    this.rawError = rawError;
    this.queryIndex = queryIndex;
  }
}
