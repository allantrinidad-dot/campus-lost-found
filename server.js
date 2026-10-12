const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { DatabaseSync } = require('node:sqlite');

const app = express();
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a random value of at least 32 characters before starting in production.');
const dataDir = process.env.CAMPUS_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'campus.sqlite'));
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','staff')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, photo TEXT, emoji TEXT DEFAULT '📦', status TEXT NOT NULL DEFAULT 'pending', posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS claims(id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id), claimant_id INTEGER NOT NULL REFERENCES users(id), proof TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, UNIQUE(item_id, claimant_id));
CREATE TABLE IF NOT EXISTS item_requests(owner_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, PRIMARY KEY(owner_id, request_key));
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);`);
app.use(express.json({ limit: '15mb' }));
class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT data FROM sessions WHERE sid=? AND expires>?').get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) { callback(error); }
  }
  set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + (value.cookie?.maxAge || 8 * 60 * 60 * 1000);
      db.prepare('INSERT INTO sessions(sid,expires,data) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires,data=excluded.data').run(sid, expires, JSON.stringify(value));
      callback(null);
    } catch (error) { callback(error); }
  }
  destroy(sid, callback = () => {}) {
    try { db.prepare('DELETE FROM sessions WHERE sid=?').run(sid); callback(null); }
    catch (error) { callback(error); }
  }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
}
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(session({ store: new SQLiteSessionStore(), secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
app.use('/data', (req,res)=>res.sendStatus(404));
app.use(express.static(__dirname));
const user = req => req?.session?.user || null;
const requireStudent = (req,res,next) => user(req) ? next() : res.status(401).json({error:'Sign in as a student or staff member.'});
const requireStaff = (req,res,next) => user(req)?.role === 'staff' ? next() : res.status(user(req) ? 403 : 401).json({error:'Staff access required.'});
function verify(password, stored) { const [salt, key] = stored.split(':'); if (!key) return false; const actual = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(key,'hex')); }
function passwordHash(password) { const salt=crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`; }
function publicItem(row, req) { const {owner_id, ...item}=row; item.canEdit=!!user(req)&&user(req).id===owner_id; return item; }
function validImageData(value) {
  const match=typeof value==='string'&&value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)return false;
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>10*1024*1024||bytes.toString('base64')!==match[2])return false;
  if(match[1]==='jpeg')return bytes.length>=100&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
  if(match[1]==='png')return bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND';
  return bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
}
function expireItems() { db.prepare("UPDATE items SET status='expired' WHERE status IN ('published','pending') AND julianday('now') - julianday(posted_at) >= 30").run(); }
app.get('/api/me',(req,res)=>res.json({user:user(req)}));
app.post('/api/register',(req,res)=>{const {email,password}=req.body||{}; if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||typeof password!=='string'||password.length<10) return res.status(400).json({error:'Use a valid email and a password of at least 10 characters.'}); try {const result=db.prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,'student')").run(email.toLowerCase(),passwordHash(password)); req.session.user={id:Number(result.lastInsertRowid),email:email.toLowerCase(),role:'student'}; res.status(201).json({user:user(req)});} catch {res.status(409).json({error:'That account already exists.'});}});
app.post('/api/login',(req,res)=>{const {email,password}=req.body||{}; const row=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase()); if(!row||!verify(String(password||''),row.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'}); req.session.user={id:row.id,email:row.email,role:row.role}; res.json({user:user(req)});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/items',(req,res)=>{expireItems();const rows=user(req)?.role==='staff'?db.prepare('SELECT * FROM items ORDER BY posted_at DESC').all():user(req)?db.prepare("SELECT * FROM items WHERE status='published' OR owner_id=? ORDER BY posted_at DESC").all(user(req).id):db.prepare("SELECT * FROM items WHERE status='published' ORDER BY posted_at DESC").all(); let out=rows.map(row=>publicItem(row,req)); const q=String(req.query.q||'').toLowerCase(), category=req.query.category, days=Number(req.query.days)||0; out=out.filter(i=>(!q||`${i.title} ${i.description} ${i.location}`.toLowerCase().includes(q))&&(!category||category==='all'||i.category===category)&&(!days||Math.floor((Date.now()-new Date(i.date).getTime())/86400000)<=days)); res.json(out);});
app.post('/api/items',requireStudent,(req,res)=>{const {title,category,location,date,description,photo,emoji='📦'}=req.body||{};if(!title||!category||!location||!date||!description||!validImageData(photo)) return res.status(400).json({error:'Complete all required fields and attach a valid JPG, PNG, or WebP image under 10 MB.'});const requestKey=req.get('Idempotency-Key');if(requestKey&&(!/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)))return res.status(400).json({error:'Invalid submission key.'});if(requestKey){const old=db.prepare('SELECT i.* FROM item_requests r JOIN items i ON i.id=r.item_id WHERE r.owner_id=? AND r.request_key=?').get(user(req).id,requestKey);if(old)return res.status(200).json(publicItem(old,req));}let itemId;db.exec('BEGIN');try{const result=db.prepare('INSERT INTO items(owner_id,title,category,location,date,description,photo,emoji,status) VALUES(?,?,?,?,?,?,?,?,\'pending\')').run(user(req).id,title,category,location,date,description,photo,emoji);itemId=Number(result.lastInsertRowid);if(requestKey)db.prepare('INSERT INTO item_requests(owner_id,request_key,item_id) VALUES(?,?,?)').run(user(req).id,requestKey,itemId);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}res.status(201).json(publicItem(db.prepare('SELECT * FROM items WHERE id=?').get(itemId),req));});
app.patch('/api/items/:id',requireStudent,(req,res)=>{const item=db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);if(!item)return res.sendStatus(404);if(user(req).role!=='staff'&&item.owner_id!==user(req).id)return res.sendStatus(403);if(req.body.photo!==undefined&&!validImageData(req.body.photo))return res.status(400).json({error:'Photo must be a valid JPG, PNG, or WebP image under 10 MB.'});const fields=['title','category','location','date','description','photo'];const values=fields.map(k=>req.body[k]===undefined?item[k]:req.body[k]);db.prepare('UPDATE items SET title=?,category=?,location=?,date=?,description=?,photo=?,status=CASE WHEN ?=owner_id AND status=\'published\' THEN \'pending\' ELSE status END WHERE id=?').run(...values,user(req).id,item.id);res.json(publicItem(db.prepare('SELECT * FROM items WHERE id=?').get(item.id),req));});
app.delete('/api/items/:id',requireStudent,(req,res)=>{const item=db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);if(!item)return res.sendStatus(404);if(user(req).role!=='staff'&&item.owner_id!==user(req).id)return res.sendStatus(403);db.prepare('DELETE FROM claims WHERE item_id=?').run(item.id);db.prepare('DELETE FROM items WHERE id=?').run(item.id);res.json({ok:true});});
app.post('/api/items/:id/claims',requireStudent,(req,res)=>{const item=db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);if(!item||item.status!=='published')return res.status(404).json({error:'This item is not available to claim.'});if(item.owner_id===user(req).id)return res.status(403).json({error:'You cannot claim your own listing.'});if(!String(req.body.proof||'').trim())return res.status(400).json({error:'Proof of ownership is required.'});try{db.prepare('INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,?)').run(item.id,user(req).id,String(req.body.proof).trim());res.status(201).json({ok:true});}catch{res.status(409).json({error:'You already submitted a claim for this item.'});}});
app.get('/api/staff/claims',requireStaff,(req,res)=>res.json(db.prepare('SELECT c.id,c.item_id,c.claimant_id,c.proof,c.status,c.submitted_at,u.email,i.title FROM claims c JOIN users u ON u.id=c.claimant_id JOIN items i ON i.id=c.item_id ORDER BY c.submitted_at DESC').all()));
app.patch('/api/staff/items/:id/status',requireStaff,(req,res)=>{if(!['published','expired'].includes(req.body.status))return res.status(400).json({error:'Invalid item status.'});db.prepare('UPDATE items SET status=? WHERE id=?').run(req.body.status,req.params.id);res.json({ok:true});});
app.patch('/api/staff/claims/:id',(req,res,next)=>requireStaff(req,res,next),(req,res)=>{const {status}=req.body;if(!['approved','rejected','collected'].includes(status))return res.status(400).json({error:'Invalid claim decision.'});const c=db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);if(!c)return res.sendStatus(404);if(status==='collected'&&c.status!=='approved')return res.status(409).json({error:'Only approved claims can be marked collected.'});if(status==='approved'){const item=db.prepare('SELECT * FROM items WHERE id=?').get(c.item_id);if(item?.status!=='published')return res.status(409).json({error:'This item is no longer available.'});db.prepare("UPDATE claims SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE item_id=? AND id<>? AND status='pending'").run(user(req).id,c.item_id,c.id);db.prepare("UPDATE items SET status='claimed' WHERE id=?").run(c.item_id);}db.prepare('UPDATE claims SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(status,user(req).id,c.id);if(status==='collected')db.prepare("UPDATE items SET status='collected' WHERE id=?").run(c.item_id);res.json({ok:true});});
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.use((err,req,res,next)=>{if(err.type==='entity.too.large')return res.status(413).json({error:'Upload is too large. Choose an image smaller than 10 MB.'});next(err)});
if(require.main===module){const port=Number(process.env.PORT)||3000;setInterval(expireItems,60*60*1000).unref();expireItems();app.listen(port,'0.0.0.0',()=>console.log(`Campus Lost & Found listening on 0.0.0.0:${port}`));}
module.exports={app,db,passwordHash};
