const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-restart-'));
let child,port;
const password=crypto.randomBytes(24).toString('base64url');
const sessionSecret=crypto.randomBytes(32).toString('hex');
function launch(){child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,NODE_ENV:'test',CAMPUS_TEST_DATABASE:'1',SESSION_COOKIE_SECURE:'true',CAMPUS_DATA_DIR:dir,PORT:String(port),SESSION_SECRET:sessionSecret}});return new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error(`Server failed to start: ${output}`)),8000);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('listening on 0.0.0.0')){clearTimeout(timeout);resolve()}});child.stderr.on('data',chunk=>{output+=chunk});child.once('error',reject);});}
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
async function stop(){if(!child)return;const current=child;child=null;await new Promise(resolve=>{current.once('exit',resolve);current.kill('SIGTERM')})}
test('student item remains in SQLite after page refresh and server restart',async()=>{
  port=await freePort();await launch();const base=`http://127.0.0.1:${port}`;
  let r=await fetch(`${base}/api/register`,{method:'POST',headers:{'content-type':'application/json','x-forwarded-proto':'https'},body:JSON.stringify({email:'persist@example.edu',password})});assert.equal(r.status,201);assert.match(r.headers.get('set-cookie'),/; Secure/i);assert.match(r.headers.get('set-cookie'),/HttpOnly/i);let cookie=r.headers.get('set-cookie').split(';')[0];
  r=await fetch(`${base}/api/items`,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({title:'Persistent item',category:'Books',location:'Test Hall',date:'2026-10-10',description:'Must survive refresh and restart',photo:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k='})});assert.equal(r.status,201);
  let listed=await fetch(`${base}/api/items`,{headers:{cookie}}).then(x=>x.json());assert.equal(listed.some(i=>i.title==='Persistent item'),true);
  await stop();await launch();
  r=await fetch(`${base}/api/me`,{headers:{cookie}});assert.equal(r.status,200);assert.equal((await r.json()).user.email,'persist@example.edu');
  listed=await fetch(`${base}/api/items`,{headers:{cookie}}).then(x=>x.json());assert.equal(listed.some(i=>i.title==='Persistent item'),true);
  await stop();
});
test.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true})});
