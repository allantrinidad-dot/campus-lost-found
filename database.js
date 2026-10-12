const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@libsql/client');

const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','staff')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, photo TEXT, emoji TEXT DEFAULT '📦', status TEXT NOT NULL DEFAULT 'pending', posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS claims(id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id), claimant_id INTEGER NOT NULL REFERENCES users(id), proof TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, UNIQUE(item_id, claimant_id));
CREATE TABLE IF NOT EXISTS item_requests(owner_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, PRIMARY KEY(owner_id, request_key));
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);
`;

function createDatabase() {
  const testing = process.env.NODE_ENV === 'test' || process.env.CAMPUS_TEST_DATABASE === '1';
  let url = process.env.TURSO_DATABASE_URL;
  let authToken = process.env.TURSO_AUTH_TOKEN;
  let testDb = null;
  if (testing) {
    if (!process.env.CAMPUS_DATA_DIR) throw new Error('Tests must set CAMPUS_DATA_DIR to a temporary directory.');
    const dir = path.resolve(process.env.CAMPUS_DATA_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'campus.sqlite');
    url = `file:${file}`;
    authToken = undefined;
    // Direct SQL is exposed only to the existing test fixtures; application operations
    // still use the asynchronous libSQL client, exactly as they do against Turso.
    const { DatabaseSync } = require('node:sqlite');
    testDb = new DatabaseSync(file);
    testDb.exec(schema);
  }
  if (!url) throw new Error('Set TURSO_DATABASE_URL to your Turso database URL.');
  if (!url.startsWith('file:') && !authToken) throw new Error('Set TURSO_AUTH_TOKEN for the remote Turso database.');
  const client = createClient({ url, authToken });
  const ready = testing ? Promise.resolve() : schema.split(';').map(sql => sql.trim()).filter(Boolean).reduce(
    (previous, sql) => previous.then(() => client.execute({ sql })), Promise.resolve()
  ).then(() => undefined);
  return { client, ready, testDb };
}

module.exports = { createDatabase };
