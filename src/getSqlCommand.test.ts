import { getSqlCommand } from './getSqlCommand';

test('multiline with', () => {
  expect(
    getSqlCommand(`
WITH foo AS (
    SELECT name
    FROM bar
    GROUP BY id
)
INSERT INTO melons (
    free,
    bar,
    baz 
)
SELECT
    foo.name,
    bar,
    baz
FROM foo
JOIN baz ON baz.id = foo.id
    `)
  ).toBe('INSERT');
});

test('named with', () => {
  expect(
    getSqlCommand('WITH foo(name) AS (SELECT baz FROM bar) SELECT * FROM foo')
  ).toBe('SELECT');
});

test('named with multiple columns', () => {
  expect(
    getSqlCommand(
      'WITH foo(name, id) AS (SELECT baz, id FROM bar) SELECT * FROM foo'
    )
  ).toBe('SELECT');
});

test('with values', () => {
  expect(
    getSqlCommand('WITH foo(name) AS (VALUES (?)) SELECT * FROM foo')
  ).toBe('SELECT');
});

test('with values newlines', () => {
  expect(
    getSqlCommand(
      'WITH foo(name) AS (VALUES (?), (?))\n      SELECT * FROM foo'
    )
  ).toBe('SELECT');
});

test('with values multiple columns', () => {
  expect(
    getSqlCommand(
      'WITH foo(name, id) AS (VALUES (?, ?), (?, ?)) SELECT * FROM foo'
    )
  ).toBe('SELECT');
});

test('with values multiple columns newlines', () => {
  expect(
    getSqlCommand(
      `WITH\n foo\n(\nname\n,n id) \nAS \n(\nVALUES\n (\n?\n,\n ?\n)\n,\n (\n?\n,\n ?\n)\n)\n SELECT * FROM foo`
    )
  ).toBe('SELECT');
});

test('explain query plan', () => {
  expect(
    getSqlCommand(
      `EXPLAIN QUERY PLAN WITH foo(name) AS (VALUES (?)) SELECT * FROM foo`
    )
  ).toBe('EXPLAIN');
});
