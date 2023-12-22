import { RqliteConnection } from '../dist/rqdb.js';

const conn = new RqliteConnection(['http://127.0.0.1:4001']);
const cursor = conn.cursor();
