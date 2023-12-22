# rqdb

This is an unofficial TypeScript fetch-based client library for
[rqlite](https://github.com/rqlite/rqlite).

This project is guided by the following principles, in order:

- Minimal Dependencies: This only requires the standard TypeScript/ESLint
  setup, without any runtime dependencies beyond node.
- Pragmatism: Avoid excessive boilerplate, provide sane defaults
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
import { RqliteConnection } from 'rqdb';
import crypto from 'crypto';
import { inspect } from 'util';

async function main() {
  const conn = new RqliteConnection(['http://127.0.0.1:4001']);
  const cursor = conn.cursor();

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

Quickly get a formatted query plan from the current leader for a query, with
basic highlighting of the most salient parts

```ts
import { RqliteConnection } from 'rqdb';
import crypto from 'crypto';
import { inspect } from 'util';

const conn = new RqliteConnection(['http://127.0.0.1:4001']);
const cursor = conn.cursor('weak');

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

Substituting `NULL` in parametrized queries can be error-prone.

```ts
const name: string | null = null;

// never matches a row since name is null, even if the rows name is null
await cursor.execute('SELECT * FROM persons WHERE name = ?', [name]);

// works as expected
await cursor.execute(
  'SELECT * FROM persons WHERE ((? IS NULL AND name IS NULL) OR name = ?)',
  [name, name]
);
```

### Backup

Backups can be initiated using `await conn.backupToFile('binary', 'database.bak')`.
The download will be streamed to the given filepath. Both the sql format and a
compressed sqlite format are supported. If more control is required, such as
compressing mid flight, use `RqliteConnection.backup` directly.

### Logging

By default this will log using `console`. If `chalk` is installed, it will also
color with chalk by default. This can be disabled by using `{ log: false }` in
the `connect` call. If logging is desired but needs to be handled differently,
it can be done as follows:

```ts
import { RqliteConnection } from 'rqdb';
import chalk from 'chalk';
import { inspect } from 'util';

// The default formatter includes the error in the message
const logMessage = (message: string, error?: any) => console.log(message);

conn = new RqliteConnection(['http://127.0.0.1:4001'], {
  // defaults shown here unless otherwise noted
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
          error === undefined ? '' : '\n' + chalk.gray(inspect(error))
        }`;
      },
    },
    readStart: {
      // the method is slightly simplified here as we also handle coloring commands
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    readResponse: {
      method: logMessage,
      level: 'debug',
      maxLength: 1024,
      enabled: true,
    },
    readStale: {
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    writeStart: {
      // the method is slightly simplified here as we also handle coloring commands
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    writeResponse: {
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    followRedirect: {
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: false,
    },
    fetchError: {
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    connectTimeout: {
      method: logMessage,
      level: 'debug',
      maxLength: undefined,
      enabled: true,
    },
    readTimeout: {
      method: logMessage,
      level: 'error',
      maxLength: undefined,
      enabled: true,
    },
    hostsExhausted: {
      method: logMessage,
      level: 'error',
      maxLength: undefined,
      enabled: true,
    },
    nonOkResponse: {
      method: logMessage,
      level: 'warning',
      maxLength: undefined,
      enabled: true,
    },
    backupStart: {
      method: logMessage,
      level: 'info',
      maxLength: undefined,
      enabled: true,
    },
    backupEnd: {
      method: logMessage,
      level: 'info',
      maxLength: undefined,
      enabled: true,
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
