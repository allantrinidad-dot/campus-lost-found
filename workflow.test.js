const test=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-workflow-'));
const uploadDir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-uploads-'));
process.env.CAMPUS_DATA_DIR=tempDir;
process.env.CAMPUS_TEST_DATABASE='1';
const {app,db,passwordHash}=require('./server');
const password=crypto.randomBytes(24).toString('base64url');
const staffEmail=`workflow-staff-${Date.now()}@example.edu`;
db.prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,'staff')").run(staffEmail,passwordHash(password));
const staff=request.agent(app), owner=request.agent(app), claimant=request.agent(app), stranger=request.agent(app), visitor=request.agent(app);
fs.writeFileSync(path.join(uploadDir,'test.jpg'),Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k=','base64'));
fs.writeFileSync(path.join(uploadDir,'test.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'));
const jpg=`data:image/jpeg;base64,${fs.readFileSync(path.join(uploadDir,'test.jpg')).toString('base64')}`;
const png=`data:image/png;base64,${fs.readFileSync(path.join(uploadDir,'test.png')).toString('base64')}`;
let ownerEmail,claimantEmail,itemJpg,itemPng,claimRejectId,claimApproveId;
function addItem(agent,title,photo){return agent.post('/api/items').send({title,category:'Electronics',location:'North Library',date:'2026-10-10',description:`${title} description`,photo});}
test('full role, listing, claim, photo, and search workflow',async()=>{
  ownerEmail=`owner-${Date.now()}@example.edu`;claimantEmail=`claimant-${Date.now()}@example.edu`;
  await owner.post('/api/register').send({email:ownerEmail,password}).expect(201);
  await claimant.post('/api/register').send({email:claimantEmail,password}).expect(201);
  await staff.post('/api/login').send({email:staffEmail,password}).expect(200);

  itemJpg=(await addItem(owner,'JPG headset',jpg).expect(201)).body.id;
  itemPng=(await addItem(owner,'PNG camera',png).expect(201)).body.id;
  assert.equal((await visitor.get('/api/items').expect(200)).body.length,0);
  assert.equal((await owner.get('/api/items').expect(200)).body.length,2);
  const double=await Promise.all([1,2].map(()=>owner.post('/api/items').set('Idempotency-Key','test-double-click-123').send({title:'Double click item',category:'Other',location:'Library',date:'2026-10-10',description:'Repeated submission',photo:jpg})));
  assert.deepEqual(double.map(r=>r.status).sort(),[200,201]);
  assert.equal(double[0].body.id,double[1].body.id);
  await owner.delete(`/api/items/${double[0].body.id}`).expect(200);
  await stranger.post('/api/login').send({email:'missing@example.edu',password}).expect(401);
  await staff.patch(`/api/staff/items/${itemJpg}/status`).send({status:'published'}).expect(200);
  await staff.patch(`/api/staff/items/${itemPng}/status`).send({status:'published'}).expect(200);
  await claimant.post(`/api/items/${itemJpg}/claims`).send({proof:'inside blue pocket'}).expect(201);
  await claimant.post(`/api/items/${itemJpg}/claims`).send({proof:'inside blue pocket'}).expect(409);
  await claimant.post(`/api/items/${itemPng}/claims`).send({proof:'small scratch'}).expect(201);

  const publicItems=await visitor.get('/api/items?q=headset&category=Electronics&days=30').expect(200);
  assert.equal(publicItems.body.length,1);
  assert.equal(JSON.stringify(publicItems.body).includes('inside blue pocket'),false);
  assert.equal((await visitor.get('/api/items?q=will-never-match').expect(200)).body.length,0);
  assert.equal((await visitor.get('/api/staff/claims').expect(401)).status,401);
  await owner.get('/api/staff/claims').expect(403);

  const rows=await staff.get('/api/staff/claims').expect(200);
  claimRejectId=rows.body.find(c=>c.item_id===itemJpg).id;
  claimApproveId=rows.body.find(c=>c.item_id===itemPng).id;
  await staff.patch(`/api/staff/claims/${claimRejectId}`).send({status:'rejected'}).expect(200);
  await staff.patch(`/api/staff/claims/${claimApproveId}`).send({status:'approved'}).expect(200);
  await staff.patch(`/api/staff/claims/${claimRejectId}`).send({status:'collected'}).expect(409);
  await staff.patch(`/api/staff/claims/${claimApproveId}`).send({status:'collected'}).expect(200);

  const replacement=(await owner.patch(`/api/items/${itemPng}`).send({photo:jpg,title:'Replaced photo'}).expect(200)).body;
  assert.equal(replacement.photo,jpg);
  assert.equal((await owner.get('/api/items').expect(200)).body.find(i=>i.id===itemPng).photo,jpg);
  await owner.patch(`/api/items/${itemPng}`).send({photo:'data:image/png;base64,dGVzdA=='}).expect(400);
  await owner.patch(`/api/items/${itemPng}`).send({photo:'data:image/jpeg;base64,dGVzdA=='}).expect(400);
  await owner.delete(`/api/items/${itemJpg}`).expect(200);
  await owner.get('/api/items').expect(200).then(r=>assert.equal(r.body.some(i=>i.id===itemJpg),false));
  await claimant.delete(`/api/items/${itemPng}`).expect(403);
});
test('rejects oversized image data and does not create an item',async()=>{
  const large=Buffer.alloc(10*1024*1024+1,1).toString('base64');
  const response=await owner.post('/api/items').send({title:'Too large',category:'Other',location:'Library',date:'2026-10-10',description:'Oversized',photo:`data:image/jpeg;base64,${large}`});
  assert.ok([400,413].includes(response.status));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM items WHERE title='Too large'").get().n,0);
});
test.after(()=>{db.close();fs.rmSync(tempDir,{recursive:true,force:true});fs.rmSync(uploadDir,{recursive:true,force:true});});
