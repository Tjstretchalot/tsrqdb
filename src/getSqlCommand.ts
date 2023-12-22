const WITH_MATCHER =
  /WITH( RECURSIVE)?\s+(,?\s*\S+(\s?\([^\)]+\))?\s+AS\s+((NOT\s+)?MATERIALIZED\s+)?\(.+?\))+\s+(?<cmd>INSERT|UPDATE|DELETE|SELECT)/is;

/**
 * Determines which SQL command is being used in the given SQL string.
 *
 * @param sqlStr The SQL string to parse
 * @returns The corresponding command (SELECT, INSERT, EXPLAIN, etc.)
 * @throws If the command could not be determined (e.g, if the SQL string is invalid)
 */
export const getSqlCommand = (sqlStr: string): string => {
  const firstNonWhitespaceWord = sqlStr.match(/^\s*(\S+)/)?.[1];
  if (firstNonWhitespaceWord === undefined) {
    throw new Error(
      'Unable to determine SQL command because the SQL string is empty'
    );
  }

  const upperFirstNonWhitespaceWord = firstNonWhitespaceWord.toUpperCase();

  if (upperFirstNonWhitespaceWord === 'WITH') {
    const match = sqlStr.match(WITH_MATCHER);
    if (match === null) {
      throw new Error(
        'Unable to determine SQL command using Common Table Expressions (CTEs) (no match)'
      );
    }
    const cmd = match.groups?.cmd;
    if (cmd === undefined) {
      throw new Error(
        'Unable to determine SQL command using Common Table Expressions (CTEs) (bad regex)'
      );
    }

    return cmd.toUpperCase();
  }

  return upperFirstNonWhitespaceWord;
};
