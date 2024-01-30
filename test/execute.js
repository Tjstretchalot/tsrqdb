import { RqliteConnection } from '../dist/rqdb.js';
import fs from 'fs';

const EXPECTED_SQL_DUMP = `PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE fruits (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
);
INSERT INTO "fruits" VALUES(1,'banana','yellow');
INSERT INTO "fruits" VALUES(2,'apple','red');
CREATE INDEX fruits_name_idx ON fruits (name COLLATE NOCASE);
COMMIT;
`;

async function main() {
  const conn = new RqliteConnection(
    ['http://127.0.0.1:4001', 'http://127.0.0.1:4003', 'http://127.0.0.1:4005'],
    {
      log: {
        slowQuery: {
          enabled: true,
          thresholdSeconds: 0,
          method: (query, details) => {
            console.log('slowQuery called: ', query, details);
          },
        },
      },
    }
  );
  const cursor = conn.cursor();

  await cursor.executeMany2([
    `
CREATE TABLE fruits (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
)
    `,
    'CREATE INDEX fruits_name_idx ON fruits (name COLLATE NOCASE)',
  ]);

  try {
    let response = await cursor.execute(
      'INSERT INTO fruits (name, color) VALUES (?, ?)',
      ['banana', 'yellow']
    );
    if (response.rowsAffected !== 1) {
      throw new Error('Expected 1 row affected');
    }

    response = await cursor.execute(
      'INSERT INTO fruits (name, color) VALUES (?, ?)',
      ['apple', 'red']
    );
    if (response.rowsAffected !== 1) {
      throw new Error('Expected 1 row affected');
    }

    response = await cursor.execute(
      'SELECT name, color FROM fruits ORDER BY name'
    );
    if (response.results.length !== 2) {
      throw new Error('Expected 2 rows');
    }
    if (response.results[0][0] !== 'apple') {
      throw new Error('Expected first row fruit to be apple');
    }
    if (response.results[0][1] !== 'red') {
      throw new Error('Expected first row color to be red');
    }
    if (response.results[1][0] !== 'banana') {
      throw new Error('Expected second row fruit to be banana');
    }
    if (response.results[1][1] !== 'yellow') {
      throw new Error('Expected second row color to be yellow');
    }

    await conn.backupToFile('binary', 'test/test_execute.db');
    if (!fs.existsSync('test/test_execute.db')) {
      throw new Error('Expected test/test_execute.db to exist');
    }

    fs.unlinkSync('test/test_execute.db');
    await conn.backupToFile('sql', 'test/test_execute.sql');
    try {
      const sqlDump = fs.readFileSync('test/test_execute.sql', 'utf8');
      if (sqlDump !== EXPECTED_SQL_DUMP) {
        throw new Error(
          `Expected sql dump to be:\n${EXPECTED_SQL_DUMP}\n\nbut got:\n${sqlDump}`
        );
      }
    } finally {
      fs.unlinkSync('test/test_execute.sql');
    }

    const bulkResponse = await cursor.executeUnified3([
      ['INSERT INTO fruits (name, color) VALUES (?, ?)', ['grape', 'purple']],
      ['SELECT color FROM fruits WHERE name = ? COLLATE NOCASE', ['grape']],
    ]);
    if (bulkResponse.items.length !== 2) {
      throw new Error(
        `expected 2 items in bulk response, got ${bulkResponse.items.length}`
      );
    }
    if (bulkResponse.items[0].rowsAffected !== 1) {
      throw new Error(
        `expected 1 fruit inserted, got ${bulkResponse.items[0].rowsAffected}`
      );
    }
    if (bulkResponse.items[1].results === undefined) {
      throw new Error('expected results to be defined');
    }
    if (bulkResponse.items[1].results.length !== 1) {
      throw new Error(
        `expected 1 fruit selected, got ${bulkResponse.items[1].results.length}`
      );
    }
    if (bulkResponse.items[1].results[0][0] !== 'purple') {
      throw new Error(
        `expected fruit to be purple, got ${bulkResponse.items[1].results[0][0]}`
      );
    }

    await cursor.explain(
      'SELECT name, color FROM fruits WHERE name = ? COLLATE NOCASE',
      ['apple'],
      {
        out: console.log,
      }
    );

    // verify consistency is working
    await cursor.executeUnified2(['SELECT 1', 'SELECT 2'], undefined, {
      readConsistency: 'none',
    });

    // verify node selection is working
    for (let i = 0; i < 20; i++) {
      const response = await cursor.execute('SELECT 1', undefined, {
        readConsistency: i < 10 ? 'weak' : 'none',
      });
      if (
        response.results === undefined ||
        response.results.length !== 1 ||
        response.results[0].length !== 1 ||
        response.results[0][0] !== 1
      ) {
        throw new Error('Expected response to be [[1]]');
      }
    }
  } finally {
    await cursor.execute('DROP TABLE fruits');
  }
}

main();
