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
export const parseExplainQueryPlan = (
  results: ReadonlyArray<ReadonlyArray<any>>
): ExplainQueryPlan => {
  if (results.length < 1) {
    throw new Error('EXPLAIN query always produces at least one row');
  }
  if (results[0].length !== 4) {
    throw new Error('EXPLAIN query always produces four columns');
  }

  const roots: ExplainQueryNode[] = [];
  const nodesById = new Map<number, ExplainQueryNode>();
  let largestId = 0;

  for (const row of results) {
    const rowId = row[0] as number;
    const rowDetail = row[3] as string;
    const rowParentId = row[1] as number;

    const node: ExplainQueryNode = {
      id: rowId,
      detail: rowDetail,
      parent: null,
      children: [],
    };
    nodesById.set(rowId, node);
    largestId = Math.max(largestId, rowId);

    if (rowParentId === 0) {
      roots.push(node);
    } else {
      const parent = nodesById.get(rowParentId);
      if (parent === undefined) {
        throw new Error(
          `EXPLAIN query contains row with unknown parent ID ${rowParentId}`
        );
      }
      node.parent = parent;
      parent.children.push(node);
    }
  }
  return { roots, largestId };
};

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

const defaultFormatOptions = ((): Required<FormatExplainQueryPlanOptions> => {
  const result: Required<FormatExplainQueryPlanOptions> = {
    indent: 3,
    newline: '\n',
    includeRaw: false,
    vbar: '|',
    dash: (depth: number) => '-'.repeat(depth),
    colorRaw: (prefix: string) => prefix,
    colorDetail: (detail: string) => detail,
  };
  loadChalk();
  return result;

  async function loadChalk() {
    try {
      const chalkRaw: any = await import(
        /* webpackIgnore: true */ // @ts-ignore
        'chalk'
      );
      const chalkColors: any = 'gray' in chalkRaw ? chalkRaw : chalkRaw.default;
      if (chalkColors && 'gray' in chalkColors) {
        result.vbar = chalkColors.gray('|');
        result.dash = (depth: number) => chalkColors.gray('-'.repeat(depth));
        result.colorRaw = (prefix: string) => chalkColors.gray(prefix);

        const attentionColorsOrdered: [string, (v: string) => string][] = [
          ['SCAN', chalkColors.redBright],
          ['UNION ALL', chalkColors.redBright],
          ['MATERIALIZE', chalkColors.redBright],
          ['CORRELATED SCALAR SUBQUERY', chalkColors.redBright],
          ['USING COVERING INDEX', chalkColors.greenBright],
          ['USING INTEGER PRIMARY KEY', chalkColors.greenBright],
          ['USING ROWID SEARCH', chalkColors.greenBright],
          ['SEARCH', chalkColors.whiteBright],
          ['USING INDEX', chalkColors.whiteBright],
          ['USE TEMP B-TREE', chalkColors.whiteBright],
          ['USING TEMP B-TREE', chalkColors.whiteBright],
          ['SCALAR SUBQUERY', chalkColors.whiteBright],
          ['LIST SUBQUERY', chalkColors.whiteBright],
          ['MERGE', chalkColors.whiteBright],
        ];
        const attentionColors = Object.fromEntries(attentionColorsOrdered);
        const attentionRegex = new RegExp(
          `\\b(${Object.keys(attentionColorsOrdered).join('|')})\\b`,
          'g'
        );
        result.colorDetail = (detail: string) => {
          return detail.replace(attentionRegex, (match: string) => {
            return attentionColors[match](match);
          });
        };
      }
    } catch (e) {}
  }
})();

type FormatExplainQueryPlanContext = Required<FormatExplainQueryPlanOptions> & {
  /** Returns the same length string for all ids in the plan */
  formatId: (id: number) => string;
};

/**
 * Formats the given explain query plan into a human-readable string, abiding
 * by the given options.
 */
export const formatExplainQueryPlan = (
  eqp: ExplainQueryPlan,
  options?: FormatExplainQueryPlanOptions
): string => {
  const largestIdLength = eqp.largestId.toString().length;
  const opts: FormatExplainQueryPlanContext = Object.assign(
    {},
    defaultFormatOptions,
    options,
    {
      formatId: (id: number) => id.toString().padStart(largestIdLength, ' '),
    }
  );

  const lines: string[] = [];
  for (const node of eqp.roots) {
    formatExplainQueryPlanNode(node, 0, lines, opts);
  }
  return lines.join(opts.newline);
};

const formatExplainQueryPlanNode = (
  node: ExplainQueryNode,
  level: number,
  lines: string[],
  opts: FormatExplainQueryPlanContext
): void => {
  const parts: string[] = [];
  if (opts.includeRaw) {
    parts.push(
      opts.colorRaw(
        `[id: ${opts.formatId(node.id)}, par: ${opts.formatId(
          node.parent?.id ?? 0
        )}] `
      )
    );
  }

  parts.push(' '.repeat(opts.indent & (level - 1)));
  if (level > 0) {
    parts.push(' '.repeat(opts.indent - 1));
    parts.push(opts.vbar);
  }
  parts.push(opts.dash(opts.indent - 1));
  parts.push(opts.colorDetail(node.detail));
  lines.push(parts.join(''));

  for (const child of node.children) {
    formatExplainQueryPlanNode(child, level + 1, lines, opts);
  }
};
