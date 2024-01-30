import { RqliteParameter } from './RqliteCursor';
import { RqliteReadConsistency } from './RqliteReadConsistency';

/**
 * Describes a type of request; used for slow query logging
 */
export type QueryInfoRequestType =
  | 'execute-read'
  | 'execute-write'
  | 'executemany'
  | 'executeunified-readonly'
  | 'executeunified-write';

/**
 * Describes information about a request that can be known before it is executed
 */
export type QueryInfo = {
  /**
   * The SQL operations that will be executed
   */
  operations: readonly string[];
  /**
   * The parameters for each operation
   */
  params: readonly (readonly RqliteParameter[])[];
  /**
   * The type of request
   */
  requestType: QueryInfoRequestType;
  /**
   * The read consistency if the request is a read operation, otherwise
   * irrelevant
   */
  consistency: RqliteReadConsistency;
  /**
   * The read freshness if the request is a read operation and the consistency
   * is none, otherwise irrelevant
   */
  freshness: string;
};
