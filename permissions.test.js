const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),'campus-permissions-'));
process.env.CAMPUS_DATA_DIR=tempDir;
const { app, db, passwordHash } = require('./server');

const suffix = `${Date.now()}-${Math.random()}`;
const emails = [`student-${suffix}@example.edu`, `other-${suffix}@example.edu`, `staff-${suffix}@example.edu`];
const password = crypto.randomBytes(24).toString('base64url');
let itemId;
function account(email, role) { return db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)').run(email,passwordHash(password),role).lastInsertRowid; }
const ids = [account(emails[0],'student'), account(emails[1],'student'), account(emails[2],'staff')];
const visitor = request.agent(app);
const student = request.agent(app);
const other = request.agent(app);
const staff = request.agent(app);
test('visitor can browse but cannot create or claim', async()=>{
  assert.equal((await visitor.get('/api/items')).status,200);
  assert.equal((await visitor.post('/api/items').send({title:'Test'})).status,401);
  assert.equal((await visitor.post('/api/items/1/claims').send({proof:'secret'})).status,401);
});
test('students can add items but cannot edit another student item or review claims', async()=>{
  await student.post('/api/login').send({email:emails[0],password}).expect(200);
  await other.post('/api/login').send({email:emails[1],password}).expect(200);
  const created=await student.post('/api/items').send({title:'Test item',category:'Other',location:'Library',date:'2026-10-10',description:'Example item',photo:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k='}).expect(201);
  itemId=created.body.id;
  await student.patch(`/api/items/${itemId}`).send({description:'My updated item'}).expect(200);
  await other.patch(`/api/items/${itemId}`).send({title:'Changed'}).expect(403);
  await student.get('/api/staff/claims').expect(403);
  await student.post(`/api/items/${itemId}/claims`).send({proof:'blue mark'}).expect(404); // pending items are not claimable
});
test('staff can manage items and private claim proof is staff-only', async()=>{
  await staff.post('/api/login').send({email:emails[2],password}).expect(200);
  await staff.patch(`/api/staff/items/${itemId}/status`).send({status:'published'}).expect(200);
  await other.post(`/api/items/${itemId}/claims`).send({proof:'secret private detail'}).expect(201);
  const publicItems=await visitor.get('/api/items').expect(200);
  assert.equal(JSON.stringify(publicItems.body).includes('secret private detail'),false);
  const claims=await staff.get('/api/staff/claims').expect(200);
  assert.equal(claims.body.some(c=>c.proof==='secret private detail'),true);
  await student.patch(`/api/staff/items/${itemId}/status`).send({status:'expired'}).expect(403);
});
test.after(()=>{ if(itemId){db.prepare('DELETE FROM claims WHERE item_id=?').run(itemId);db.prepare('DELETE FROM items WHERE id=?').run(itemId);} for(const id of ids)db.prepare('DELETE FROM users WHERE id=?').run(id);db.close();fs.rmSync(tempDir,{recursive:true,force:true}); });
