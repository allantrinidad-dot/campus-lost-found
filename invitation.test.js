const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-invitations-'));
process.env.CAMPUS_DATA_DIR = tempDir;
process.env.CAMPUS_TEST_DATABASE = '1';
process.env.STAFF_INVITE_ADMIN_EMAIL = 'invite-admin@example.edu';
const { app, db, passwordHash } = require('./server');
const password = crypto.randomBytes(24).toString('base64url');
const adminId = db.prepare("INSERT INTO users(email,password_hash,role) VALUES(? ,?,'staff')").run(process.env.STAFF_INVITE_ADMIN_EMAIL,passwordHash(password)).lastInsertRowid;
const ordinaryId = db.prepare("INSERT INTO users(email,password_hash,role) VALUES(? ,?,'staff')").run('ordinary-staff@example.edu',passwordHash(password)).lastInsertRowid;
const admin=request.agent(app), ordinary=request.agent(app), visitor=request.agent(app);

test('invitation creation is admin only and acceptance grants staff once', async()=>{
  await admin.post('/api/login').send({email:process.env.STAFF_INVITE_ADMIN_EMAIL,password}).expect(200);
  await ordinary.post('/api/login').send({email:'ordinary-staff@example.edu',password}).expect(200);
  await visitor.post('/api/staff/invitations').send({}).expect(401);
  await ordinary.post('/api/staff/invitations').send({}).expect(403);
  const created=await admin.post('/api/staff/invitations').send({}).expect(201);
  const token=new URL(created.body.invitationUrl,'http://local').searchParams.get('token');
  assert.ok(token);
  const row=db.prepare('SELECT token_hash,expires_at,used_at FROM staff_invitations').get();
  assert.equal(row.token_hash,crypto.createHash('sha256').update(token).digest('hex'));
  assert.ok(row.expires_at>Date.now());
  assert.equal(JSON.stringify(created.body).includes(password),false);
  await visitor.post('/api/register').send({email:'public-staff@example.edu',password,role:'staff'}).expect(201);
  assert.equal(db.prepare("SELECT role FROM users WHERE email='public-staff@example.edu'").get().role,'student');
  const professor=request.agent(app);
  const accepted=await professor.post('/api/staff/invitations/accept').send({token,email:'Professor@Example.edu',password}).expect(201);
  assert.equal(accepted.body.user.role,'staff');
  assert.equal(accepted.body.user.email,'professor@example.edu');
  await visitor.post('/api/staff/invitations/accept').send({token,email:'again@example.edu',password}).expect(400);
  assert.equal(db.prepare('SELECT used_at FROM staff_invitations').get().used_at!==null,true);
  assert.equal(db.prepare("SELECT role FROM users WHERE email='again@example.edu'").get(),undefined);
});

test('expired and unknown invitations cannot create accounts',async()=>{
  const admin2=request.agent(app);await admin2.post('/api/login').send({email:process.env.STAFF_INVITE_ADMIN_EMAIL,password}).expect(200);
  const created=await admin2.post('/api/staff/invitations').send({}).expect(201);
  const token=new URL(created.body.invitationUrl,'http://local').searchParams.get('token');
  db.prepare('UPDATE staff_invitations SET expires_at=?').run(Date.now()-1);
  await visitor.post('/api/staff/invitations/accept').send({token,email:'expired@example.edu',password}).expect(400);
  await visitor.post('/api/staff/invitations/accept').send({token:'bad',email:'bad@example.edu',password}).expect(400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email IN ('expired@example.edu','bad@example.edu')").get().n,0);
});

test.after(()=>{db.close();fs.rmSync(tempDir,{recursive:true,force:true});});
