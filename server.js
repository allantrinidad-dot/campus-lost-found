const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { createDatabase } = require('./database');

const { client: db, ready, testDb } = createDatabase();
const app = express();
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a random value of at least 32 characters before starting in production.');
app.use(express.json({ limit: '15mb' }));
const q = async (sql, args = []) => { await ready; return db.execute({ sql, args }); };
const get = async (sql, args = []) => (await q(sql, args)).rows[0] || null;
const all = async (sql, args = []) => (await q(sql, args)).rows;
const idOf = result => Number(result.lastInsertRowid);

class TursoSessionStore extends session.Store {
  get(sid, callback) {
    get('SELECT data FROM sessions WHERE sid=? AND expires>?', [sid, Date.now()])
      .then(row => callback(null, row ? JSON.parse(row.data) : null)).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + (value.cookie?.maxAge || 8 * 60 * 60 * 1000);
    q('INSERT INTO sessions(sid,expires,data) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires,data=excluded.data', [sid, expires, JSON.stringify(value)])
      .then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback = () => {}) { q('DELETE FROM sessions WHERE sid=?', [sid]).then(() => callback(null)).catch(callback); }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
}
if (process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true') app.set('trust proxy', 1);
app.use(session({ store: new TursoSessionStore(), secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true', maxAge: 8 * 60 * 60 * 1000 } }));
app.use('/data', (req, res) => res.sendStatus(404));
app.use(express.static(__dirname));
const user = req => req?.session?.user || null;
const requireStudent = (req, res, next) => user(req) ? next() : res.status(401).json({ error: 'Sign in as a student or staff member.' });
const requireStaff = (req, res, next) => user(req)?.role === 'staff' ? next() : res.status(user(req) ? 403 : 401).json({ error: 'Staff access required.' });
const isInviteAdmin = req => !!process.env.STAFF_INVITE_ADMIN_EMAIL && user(req)?.email === process.env.STAFF_INVITE_ADMIN_EMAIL.trim().toLowerCase();
const requireInviteAdmin = (req, res, next) => requireStaff(req, res, () => isInviteAdmin(req) ? next() : res.status(403).json({ error: 'Invitation administrator access required.' }));
function verify(password, stored) { const [salt, key] = stored.split(':'); if (!key) return false; const actual = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(key, 'hex')); }
function passwordHash(password) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function publicItem(row, req) { const { owner_id, ...item } = row; item.canEdit = !!user(req) && Number(user(req).id) === Number(owner_id); return item; }
function validImageData(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 10 * 1024 * 1024 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'jpeg') return bytes.length >= 100 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (match[1] === 'png') return bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND';
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
function validItemDetails(item) {
  const categories = ['Electronics', 'Keys & Cards', 'Clothing', 'Books', 'Accessories', 'Other'];
  const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && !Number.isNaN(Date.parse(`${item.date}T00:00:00Z`)) && new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) === item.date;
  return typeof item.title === 'string' && item.title.trim().length > 0 && item.title.trim().length <= 80 &&
    categories.includes(item.category) && typeof item.location === 'string' && item.location.trim().length > 0 && item.location.trim().length <= 120 &&
    date && item.date <= new Date().toISOString().slice(0, 10) && typeof item.description === 'string' && item.description.trim().length > 0 && item.description.trim().length <= 800;
}
async function expireItems() { await q("UPDATE items SET status='expired' WHERE status IN ('published','pending') AND julianday('now') - julianday(posted_at) >= 30"); }

app.get('/api/me', (req, res) => res.json({ user: user(req), canInviteStaff: isInviteAdmin(req) }));
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Use a valid email and a password between 10 and 128 characters.' });
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await q("INSERT INTO users(email,password_hash,role) VALUES(?,?,'student')", [normalizedEmail, passwordHash(password)]);
    req.session.user = { id: idOf(result), email: normalizedEmail, role: 'student' };
    res.status(201).json({ user: user(req) });
  } catch { res.status(409).json({ error: 'That account already exists.' }); }
});
app.post('/api/staff/invitations', requireInviteAdmin, async (req, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await q('INSERT INTO staff_invitations(token_hash,created_by,expires_at) VALUES(?,?,?)', [tokenHash, user(req).id, expiresAt]);
  res.status(201).json({ invitationUrl: `/invite.html?token=${token}`, expiresAt });
});
app.post('/api/staff/invitations/accept', async (req, res) => {
  const { token, email, password } = req.body || {};
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Enter a valid email and a password between 10 and 128 characters.' });
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tx = await db.transaction('write');
  try {
    const found = await tx.execute({ sql: 'SELECT id FROM staff_invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?', args: [tokenHash, Date.now()] });
    if (!found.rows[0]) { await tx.rollback(); return res.status(400).json({ error: 'This invitation is invalid, expired, or already used.' }); }
    const inviteId = found.rows[0].id;
    const consumed = await tx.execute({ sql: 'UPDATE staff_invitations SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?', args: [Date.now(), inviteId, Date.now()] });
    if (!consumed.rowsAffected) { await tx.rollback(); return res.status(400).json({ error: 'This invitation is invalid, expired, or already used.' }); }
    const result = await tx.execute({ sql: "INSERT INTO users(email,password_hash,role) VALUES(?,?,'staff')", args: [normalizedEmail, passwordHash(password)] });
    const id = idOf(result);
    await tx.commit();
    req.session.user = { id, email: normalizedEmail, role: 'staff' };
    res.status(201).json({ user: user(req) });
  } catch (error) { await tx.rollback(); if (/unique|constraint/i.test(error.message)) return res.status(409).json({ error: 'That account already exists.' }); throw error; }
});
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const row = await get('SELECT * FROM users WHERE email=?', [String(email || '').toLowerCase()]);
  if (!row || String(password || '').length > 1024 || !verify(String(password || ''), row.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  req.session.user = { id: Number(row.id), email: row.email, role: row.role };
  res.json({ user: user(req) });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/items', async (req, res) => {
  await expireItems();
  const rows = user(req)?.role === 'staff' ? await all('SELECT * FROM items ORDER BY posted_at DESC') : user(req) ? await all("SELECT * FROM items WHERE status='published' OR owner_id=? ORDER BY posted_at DESC", [user(req).id]) : await all("SELECT * FROM items WHERE status='published' ORDER BY posted_at DESC");
  let out = rows.map(row => publicItem(row, req));
  const qText = String(req.query.q || '').toLowerCase(), category = req.query.category, days = Number(req.query.days) || 0;
  out = out.filter(i => (!qText || `${i.title} ${i.description} ${i.location}`.toLowerCase().includes(qText)) && (!category || category === 'all' || i.category === category) && (!days || Math.floor((Date.now() - new Date(i.date).getTime()) / 86400000) <= days));
  res.json(out);
});
app.post('/api/items', requireStudent, async (req, res) => {
  const { title, category, location, date, description, photo, emoji = '📦' } = req.body || {};
  if (!validItemDetails({ title, category, location, date, description }) || !validImageData(photo)) return res.status(400).json({ error: 'Check the item details and attach a valid JPG, PNG, or WebP image under 10 MB.' });
  const requestKey = req.get('Idempotency-Key');
  if (requestKey && !/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)) return res.status(400).json({ error: 'Invalid submission key.' });
  if (requestKey) {
    const old = await get('SELECT i.* FROM item_requests r JOIN items i ON i.id=r.item_id WHERE r.owner_id=? AND r.request_key=?', [user(req).id, requestKey]);
    if (old) return res.status(200).json(publicItem(old, req));
  }
  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({ sql: "INSERT INTO items(owner_id,title,category,location,date,description,photo,emoji,status) VALUES(?,?,?,?,?,?,?,?, 'pending')", args: [user(req).id, title.trim(), category, location.trim(), date, description.trim(), photo, emoji] });
    const itemId = idOf(result);
    if (requestKey) await tx.execute({ sql: 'INSERT INTO item_requests(owner_id,request_key,item_id) VALUES(?,?,?)', args: [user(req).id, requestKey, itemId] });
    await tx.commit();
    res.status(201).json(publicItem(await get('SELECT * FROM items WHERE id=?', [itemId]), req));
  } catch (error) { await tx.rollback(); if (requestKey && /unique|constraint/i.test(error.message)) { const old = await get('SELECT i.* FROM item_requests r JOIN items i ON i.id=r.item_id WHERE r.owner_id=? AND r.request_key=?', [user(req).id, requestKey]); if (old) return res.status(200).json(publicItem(old, req)); } throw error; }
});
app.patch('/api/items/:id', requireStudent, async (req, res) => {
  const body = req.body || {};
  const item = await get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.sendStatus(404);
  if (user(req).role !== 'staff' && Number(item.owner_id) !== Number(user(req).id)) return res.sendStatus(403);
  const fields = ['title', 'category', 'location', 'date', 'description'];
  const details = Object.fromEntries(fields.map(k => [k, body[k] === undefined ? item[k] : body[k]]));
  if (!validItemDetails(details)) return res.status(400).json({ error: 'Check the item details and try again.' });
  if (body.photo !== undefined && !validImageData(body.photo)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG, or WebP image under 10 MB.' });
  const values = [...fields.map(k => typeof details[k] === 'string' ? details[k].trim() : details[k]), body.photo === undefined ? item.photo : body.photo];
  await q("UPDATE items SET title=?,category=?,location=?,date=?,description=?,photo=?,status=CASE WHEN ?=owner_id AND status='published' THEN 'pending' ELSE status END WHERE id=?", [...values, user(req).id, item.id]);
  res.json(publicItem(await get('SELECT * FROM items WHERE id=?', [item.id]), req));
});
app.delete('/api/items/:id', requireStudent, async (req, res) => {
  const item = await get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.sendStatus(404);
  if (user(req).role !== 'staff' && Number(item.owner_id) !== Number(user(req).id)) return res.sendStatus(403);
  await q('DELETE FROM claims WHERE item_id=?', [item.id]);
  await q('DELETE FROM items WHERE id=?', [item.id]);
  res.json({ ok: true });
});
app.post('/api/items/:id/claims', requireStudent, async (req, res) => {
  const item = await get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item || item.status !== 'published') return res.status(404).json({ error: 'This item is not available to claim.' });
  if (Number(item.owner_id) === Number(user(req).id)) return res.status(403).json({ error: 'You cannot claim your own listing.' });
  if (typeof req.body?.proof !== 'string' || !req.body.proof.trim() || req.body.proof.trim().length > 1200) return res.status(400).json({ error: 'Enter proof of ownership in 1,200 characters or fewer.' });
  try { await q('INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,?)', [item.id, user(req).id, req.body.proof.trim()]); res.status(201).json({ ok: true }); }
  catch { res.status(409).json({ error: 'You already submitted a claim for this item.' }); }
});
app.get('/api/my/claims', requireStudent, async (req, res) => res.json(await all('SELECT c.id,c.item_id,c.status,c.submitted_at,i.title FROM claims c JOIN items i ON i.id=c.item_id WHERE c.claimant_id=? ORDER BY c.submitted_at DESC', [user(req).id])));
app.get('/api/staff/claims', requireStaff, async (req, res) => res.json(await all('SELECT c.id,c.item_id,c.claimant_id,c.proof,c.status,c.submitted_at,u.email,i.title FROM claims c JOIN users u ON u.id=c.claimant_id JOIN items i ON i.id=c.item_id ORDER BY c.submitted_at DESC')));
app.patch('/api/staff/items/:id/status', requireStaff, async (req, res) => {
  if (!['published', 'expired'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid item status.' });
  await q('UPDATE items SET status=? WHERE id=?', [req.body.status, req.params.id]);
  res.json({ ok: true });
});
app.patch('/api/staff/claims/:id', requireStaff, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'collected'].includes(status)) return res.status(400).json({ error: 'Invalid claim decision.' });
  const tx = await db.transaction('write');
  try {
    const claimResult = await tx.execute({ sql: 'SELECT * FROM claims WHERE id=?', args: [req.params.id] });
    const c = claimResult.rows[0];
    if (!c) { await tx.rollback(); return res.sendStatus(404); }
    if (status === 'collected' && c.status !== 'approved') { await tx.rollback(); return res.status(409).json({ error: 'Only approved claims can be marked collected.' }); }
    if (status === 'approved') {
      const itemResult = await tx.execute({ sql: 'SELECT * FROM items WHERE id=?', args: [c.item_id] });
      const item = itemResult.rows[0];
      if (item?.status !== 'published') { await tx.rollback(); return res.status(409).json({ error: 'This item is no longer available.' }); }
      await tx.execute({ sql: "UPDATE claims SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE item_id=? AND id<>? AND status='pending'", args: [user(req).id, c.item_id, c.id] });
      await tx.execute({ sql: "UPDATE items SET status='claimed' WHERE id=?", args: [c.item_id] });
    }
    await tx.execute({ sql: 'UPDATE claims SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?', args: [status, user(req).id, c.id] });
    if (status === 'collected') await tx.execute({ sql: "UPDATE items SET status='collected' WHERE id=?", args: [c.item_id] });
    await tx.commit();
    res.json({ ok: true });
  } catch (error) { await tx.rollback(); throw error; }
});
app.get('/api/health', async (req, res) => { await q('SELECT 1'); res.json({ ok: true }); });
app.use((err, req, res, next) => { if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large. Choose an image smaller than 10 MB.' }); next(err); });

async function start() {
  await ready;
  if (process.env.NODE_ENV === 'production') {
    await require('./seed-demo').seedDemo();
    await require('./seed-sample-data').seedSampleData();
  }
  await expireItems();
  const port = Number(process.env.PORT) || 3000;
  setInterval(() => expireItems().catch(error => console.error('Item expiration failed:', error.message)), 60 * 60 * 1000).unref();
  return app.listen(port, '0.0.0.0', () => console.log(`Campus Lost & Found listening on 0.0.0.0:${port}`));
}
if (require.main === module) start().catch(error => { console.error('Startup failed:', error); process.exitCode = 1; });
module.exports = { app, db: testDb || db, client: db, ready, passwordHash, q, get, all, start };
