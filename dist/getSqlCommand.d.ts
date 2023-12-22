/**
 * Determines which SQL command is being used in the given SQL string.
 *
 * @param sqlStr The SQL string to parse
 * @returns The corresponding command (SELECT, INSERT, EXPLAIN, etc.)
 * @throws If the command could not be determined (e.g, if the SQL string is invalid)
 */
export declare const getSqlCommand: (sqlStr: string) => string;
//# sourceMappingURL=getSqlCommand.d.ts.map