/**
 * A row returned from an EXPLAIN query. See https://www.sqlite.org/eqp.html for
 * more information.
 */
export type ExplainQueryNode = {
    id: number;
    detail: string;
    parent: ExplainQueryNode | null;
    children: ExplainQueryNode[];
};
/**
 * The full result from an EXPLAIN query with basic information required for
 * formatting extracted out.
 */
export type ExplainQueryPlan = {
    roots: ExplainQueryNode[];
    largestId: number;
};
/**
 * Parses the results of an EXPLAIN query into a tree of nodes.
 */
export declare const parseExplainQueryPlan: (results: ReadonlyArray<ReadonlyArray<any>>) => ExplainQueryPlan;
export type FormatExplainQueryPlanOptions = {
    /**
     * The number of spaces to use when indenting each level of the plan.
     *
     * @default 3
     */
    indent?: number;
    /**
     * The newline character to use
     *
     * @default '\n'
     */
    newline?: string;
    /**
     * If true, each line is prepended with the raw row from the result
     * that was used to generate it. If false, only the formatted plan
     * is returned.
     *
     * @default false
     */
    includeRaw?: boolean;
    /**
     * The character to use for the vertical line connecting the tree
     * nodes. If `chalk` is detected, this is by default colored gray,
     * as if by `chalk.gray('|')`.
     *
     * @default '|'
     */
    vbar?: string;
    /**
     * The character to use for the horizontal line connecting the tree
     * nodes. If `chalk` is detected, this is by default colored gray,
     * as if by `chalk.gray('-')`.
     *
     * @default '-'
     */
    dash?: (depth: number) => string;
    /**
     * Colors that raw prefix when `includeRaw` is true. By default
     * this acts like `chalk.gray` if `chalk` is detected, otherwise
     * it is a noop.
     *
     * @default identity
     */
    colorRaw?: (prefix: string) => string;
    /**
     * Colors the detail text of each node. By default this is the identity
     * function if chalk is not detected, otherwise this will color.white,
     * with the following exceptions found by scanning through
     *
     * https://github.com/sqlite/sqlite/blob/master/test/eqp.test
     *
     * for interesting query plans, to help bring attention to the most
     * relevant parts
     *
     * redBright:
     * - `SCAN`
     * - `UNION ALL`
     * - `MATERIALIZE`
     * - `CORRELATED SCALAR SUBQUERY`
     *
     * greenBright:
     * - `USING COVERING INDEX`
     * - `USING INTEGER PRIMARY KEY`
     * - `USING ROWID SEARCH`
     *
     * whiteBright:
     * - `SEARCH`
     * - `USING INDEX`
     * - `USE TEMP B-TREE`
     * - `USING TEMP B-TREE`
     * - `SCALAR SUBQUERY`, except when prefixed with CORRELATED
     * - `LIST SUBQUERY`
     * - `MERGE`
     */
    colorDetail?: (detail: string) => string;
};
/**
 * Formats the given explain query plan into a human-readable string, abiding
 * by the given options.
 */
export declare const formatExplainQueryPlan: (eqp: ExplainQueryPlan, options?: FormatExplainQueryPlanOptions) => string;
//# sourceMappingURL=explain.d.ts.map