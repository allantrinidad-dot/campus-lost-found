const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-dashboard-'));
process.env.CAMPUS_DATA_DIR = tempDir;
process.env.CAMPUS_TEST_DATABASE = '1';
const { app, db, passwordHash } = require('./server');
const password = crypto.randomBytes(24).toString('base64url');
const ownerId = Number(db.prepare("INSERT INTO users(email,password_hash,role) VALUES('dash-owner@example.edu',?,'student')").run(passwordHash(password)).lastInsertRowid);
const claimantId = Number(db.prepare("INSERT INTO users(email,password_hash,role) VALUES('dash-claimant@example.edu',?,'student')").run(passwordHash(password)).lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(email,password_hash,role) VALUES('dash-other@example.edu',?,'student')").run(passwordHash(password)).lastInsertRowid);
const itemId = Number(db.prepare("INSERT INTO items(owner_id,title,category,location,date,description,status) VALUES(?,'Green notebook','Books','Main library','2026-10-10','Hardcover','published')").run(ownerId).lastInsertRowid);
db.prepare("INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,'private bookmark detail')").run(itemId, claimantId);
db.prepare("INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,'other private clue')").run(itemId, otherId);
const visitor = request.agent(app);
const claimant = request.agent(app);
const other = request.agent(app);

test('student dashboard claims endpoint is private, scoped, and omits proof', async () => {
  await visitor.get('/api/my/claims').expect(401);
  await claimant.post('/api/login').send({ email: 'dash-claimant@example.edu', password }).expect(200);
  await other.post('/api/login').send({ email: 'dash-other@example.edu', password }).expect(200);
  const own = await claimant.get('/api/my/claims').expect(200);
  assert.equal(own.body.length, 1);
  assert.equal(own.body[0].title, 'Green notebook');
  assert.equal(Object.hasOwn(own.body[0], 'proof'), false);
  assert.equal((await other.get('/api/my/claims').expect(200)).body.length, 1);
});

test('item and claim forms reject invalid values without changing stored data', async () => {
  const owner = request.agent(app);
  await owner.post('/api/login').send({ email: 'dash-owner@example.edu', password }).expect(200);
  await owner.patch(`/api/items/${itemId}`).send({ title: '   ' }).expect(400);
  assert.equal(db.prepare('SELECT title FROM items WHERE id=?').get(itemId).title, 'Green notebook');
  const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const invalidDate = await claimant.post('/api/items').send({ title: 'Date test', category: 'Books', location: 'Library', date: '2099-01-01', description: 'Future date', photo: validPng });
  assert.equal(invalidDate.status, 400);
  await claimant.post(`/api/items/${itemId}/claims`).send({ proof: 'x'.repeat(1201) }).expect(400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM items WHERE title='Date test'").get().n, 0);
});

test.after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });
