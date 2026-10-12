const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-seed-'));
const prodDir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-seed-production-'));
test('README commands and demo seeder work without overwriting existing accounts',()=>{
  const pkg=require('./package.json');assert.equal(pkg.scripts.start,'node server.js');assert.match(pkg.scripts['seed:demo'],/seed-demo/);assert.match(fs.readFileSync(path.join(__dirname,'README.md'),'utf8'),/npm install[\s\S]*npm start[\s\S]*npm run seed:demo/);
  const run=()=>spawnSync(process.execPath,[path.join(__dirname,'seed-demo.js')],{encoding:'utf8',env:{...process.env,CAMPUS_DATA_DIR:dir}});
  const first=run();assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/student: demo\.student@example\.edu \/ [A-Za-z0-9_-]+/);assert.match(first.stdout,/staff: demo\.staff@example\.edu \/ [A-Za-z0-9_-]+/);assert.match(first.stdout,/student: demo\.claimant@example\.edu \/ [A-Za-z0-9_-]+/);
  const second=run();assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/demo\.student@example\.edu already exists; left unchanged/);assert.match(second.stdout,/demo\.staff@example\.edu already exists; left unchanged/);assert.match(second.stdout,/demo\.claimant@example\.edu already exists; left unchanged/);
  const sample=spawnSync(process.execPath,[path.join(__dirname,'seed-sample-data.js')],{encoding:'utf8',env:{...process.env,CAMPUS_DATA_DIR:dir}});assert.equal(sample.status,0,sample.stderr);assert.match(sample.stdout,/4 items, 4 with photos, 1 pending claims/);
  const sampleAgain=spawnSync(process.execPath,[path.join(__dirname,'seed-sample-data.js')],{encoding:'utf8',env:{...process.env,CAMPUS_DATA_DIR:dir}});assert.equal(sampleAgain.status,0,sampleAgain.stderr);assert.match(sampleAgain.stdout,/Added 0 demo items/);assert.match(sampleAgain.stdout,/4 items, 4 with photos, 1 pending claims/);
});
test('production demo setup uses private environment passwords without printing them',()=>{
  const passwords={DEMO_STUDENT_PASSWORD:'student-'+require('node:crypto').randomBytes(20).toString('hex'),DEMO_STAFF_PASSWORD:'staff-'+require('node:crypto').randomBytes(20).toString('hex'),DEMO_CLAIMANT_PASSWORD:'claimant-'+require('node:crypto').randomBytes(20).toString('hex')};
  const env={...process.env,...passwords,NODE_ENV:'production',SESSION_SECRET:require('node:crypto').randomBytes(32).toString('hex'),CAMPUS_DATA_DIR:prodDir};
  const accounts=spawnSync(process.execPath,[path.join(__dirname,'seed-demo.js')],{encoding:'utf8',env});
  assert.equal(accounts.status,0,accounts.stderr);
  for(const password of Object.values(passwords))assert.equal(accounts.stdout.includes(password),false);
  assert.match(accounts.stdout,/demo\.staff@example\.edu created/);
  const sample=spawnSync(process.execPath,[path.join(__dirname,'seed-sample-data.js')],{encoding:'utf8',env});
  assert.equal(sample.status,0,sample.stderr);
  assert.match(sample.stdout,/4 items, 4 with photos, 1 pending claims/);
});
test.after(()=>{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(prodDir,{recursive:true,force:true});});
