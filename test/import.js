import * as rqdb from '../dist/rqdb.min.js';

console.log('imported something?', rqdb);

const conn = new rqdb.RqliteConnection(['http://127.0.0.1:4001']);
const cursor = conn.cursor();

console.log('successfully made a cursor!');
