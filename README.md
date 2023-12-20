# rqdb

This is an unofficial TypeScript fetch-based client library for
[rqlite](https://github.com/rqlite/rqlite).

This project is guided by the following principles:

- Minimal Dependencies: This only requires the standard TypeScript/ESLint
  setup, without any runtime dependencies beyond node.
- Thin: Avoid encapsulation, prefer data objects that mirror the API
- Simple: Avoid state, prefer dependency injection to configuration
- Fast: Avoid copies, prefer performance over defensiveness

This project should be used with
[rqdb-eslint-plugin](https://github.com/Tjstretchalot/rqdb-eslint-plugin)
to check SQL, enforce consistent SQL styling, and enforce consistent use of
`execute` for a single query, `executeMany2` iff multiple queries without
parameters, and `executeMany3` iff multiple queries with parameters.

## Getting started

```
npm install --save rqdb
```

## Usage

```ts
import rqdb from 'rqdb';
import crypto from 'crypto';
import { inspect } from 'util';

async function main() {
  const conn = rqdb.connect(['127.0.0.1:4001']);
  const cursor = conn.cursor('none');

  await cursor.executeMany2([
    'CREATE TABLE persons (id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL, name TEXT NOT NULL)',
    'CREATE TABLE pets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE)',
  ]);

  const personName = 'John Doe';
  const personUid = crypto.randomBytes(16).toString('base64url');
  const petName = 'Fido';
  const result = await cursor.executeMany3([
    ['INSERT INTO persons (uid, name) VALUES (?, ?)', [personUid, personName]],
    [
      `
INSERT INTO pets (name, ownerId)
SELECT
    ?, persons.id
FROM persons
WHERE
    uid = ?
      `,
      [petName, personUid],
    ],
  ]);

  if (result[0]?.rowsAffected !== 1 || result[1]?.rowsAffected !== 1) {
    throw new Error(
      `Expected exactly 1 person/pet inserted, got: ${inspect(result)}`
    );
  }
}

main();
```

## Additional Features

### Explain

Quickly get a formatted query plan from the current leader for a query

```ts
import rqdb from 'rqdb';
import crypto from 'crypto';
import { inspect } from 'util';

const conn = rqdb.connect(['127.0.0.1:4001']);
const cursor = conn.cursor('none');

await cursor.execute(
  `
CREATE TABLE persons (
    id INTEGER PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    given_name TEXT NOT NULL,
    family_name TEXT NOT NULL
)
  `
);
await cursor.explain(
  "SELECT id FROM persons WHERE TRIM(given_name || ' ' || family_name) LIKE ?",
  ['john d%'],
  {
    out: console.log,
  }
);
// --SCAN persons
await cursor.execute(
  "CREATE INDEX persons_name_idx ON persons(TRIM(given_name || ' ' || family_name) COLLATE NOCASE)"
);
await cursor.explain(
  "SELECT id FROM persons WHERE TRIM(given_name || ' ' || family_name) LIKE ?",
  ['john d%'],
  {
    out: console.log,
  }
);
// --SEARCH persons USING INDEX persons_name_idx (<expr>>? AND <expr><?)
```

### Read Consistency

Selecting read consistency is done at the cursor level, either by passing
`readConsistency` to the cursor constructor (`conn.cursor()`), in the options
to `execute`/`executeMany2`/`executeMany3`, or by setting the instance variable
`readConsistency` directly. The available consistencies are `strong`, `weak`,
and `none`. You may also indicate the `freshness` value at the cursor level.

See [CONSISTENCY.md](https://github.com/rqlite/rqlite/blob/master/DOC/CONSISTENCY.md) for
details.

The default consistency is `weak`.

### Foreign Keys

Foreign key support in rqlite is disabled by default, to match sqlite. This is a common source
of confusion. It cannot be configured by the client reliably. Foreign key support
is enabled as described in
[FOREIGN_KEY_CONSTRAINTS.md](https://github.com/rqlite/rqlite/blob/master/DOC/FOREIGN_KEY_CONSTRAINTS.md)

### Nulls

Substituting `NULL` in parametrized queries can be error-prone. In particular,
sqlite needs `null` sent in a very particular way, which the rqlite server has
historically not handled properly.

By default, if you attempt to use `null` as a parameter to a query, this package
will perform string substition with the value `NULL` in the correct spot. Be
careful however - you will still need to handle nulls properly in the query,
since `col = NULL` and `col IS NULL` are not the same. In particular, `NULL = NULL`
is `NULL`, which evaluates to false. One way this could be handled is

```ts
const name: string | null = null;

// never matches a row since name is None, even if the rows name is null
await cursor.execute('SELECT * FROM persons WHERE name = ?', [name]);

// works as expected
await cursor.execute(
  'SELECT * FROM persons WHERE ((? IS NULL AND name IS NULL) OR name = ?)',
  [name, name]
);
```

### Backup

Backups can be initiated using `conn.backup(filepath: str, raw: bool = False)`.
The download will be streamed to the given filepath. Both the sql format and a
compressed sqlite format are supported.

### Logging

By default this will log using `console`. If `chalk` is installed, it will also
color with chalk by default. This can be disabled by using `{ log: false }` in
the `connect` call. If logging is desired but needs to be handled differently,
it can be done as follows:

```ts
import rqdb from 'rqdb';
import chalk from 'chalk';

conn = rqdb.connect(['127.0.0.1:4001'], {
  // defaults shown here
  log: {
    meta: {
      format: (
        level: 'debug' | 'info' | 'warning' | 'error',
        msg: string,
        error?: any
      ) => {
        const colorsByLevel = {
          debug: chalk.gray,
          info: chalk.white,
          warning: chalk.yellowBright,
          error: chalk.redBright,
        } as const;

        return `${chalk.green(new Date().toLocaleString())} ${colorsByLevel[
          level
        ](message)}${
          error === undefined ? '' : '\n' + chalk.white(inspect(error))
        }`;
      },
    },
    readStart: { method: console.log, level: 'debug', maxLength: undefined },
    writeStart: { method: console.log, level: 'debug', maxLength: undefined },
    readResponse: { method: console.log, level: 'debug', maxLength: 1024 },
    writeResponse: {
      method: console.log,
      level: 'debug',
      maxLength: undefined,
    },
    connectTimeout: {
      method: console.log,
      level: 'debug',
      maxLength: undefined,
    },
    hostsExhausted: {
      method: console.log,
      level: 'warning',
      maxLength: undefined,
    },
    nonOkResponse: {
      method: console.log,
      level: 'warning',
      maxLength: undefined,
    },
  },
});
```

## Limitations

### Slow Transactions

The primary limitations is that by the connectionless nature of rqlite, while
transactions are possible, the entire transaction must be specified upfront.
That is, you cannot open a transaction, perform a query, and then use the
result of that query to perform another query before closing the transaction.

This can also be seen as a blessing, as these types of transactions are the most
common source of performance issues in traditional applications. They require
long-held locks that can easily lead to N^2 performance. The same behavior can
almost always be achieved with uids, as shown in the example. The repeated UID
lookup causes a consistent overhead, which is highly preferable to the
unpredictable negative feedback loop nature of long transactions.

## See Also

- [Python rqdb](https://github.com/tjstretchalot/rqdb) with the same maintainer
  and extremely similar API
