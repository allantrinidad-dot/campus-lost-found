const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {JSDOM}=require('jsdom');

test('browser back closes an open modal and rapid item submits create one listing',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const script=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  const w=dom.window;let signedIn=null,posted=0,items=[];
  const temporaryPassword=crypto.randomBytes(24).toString('base64url');
  w.confirm=()=>true;w.prompt=(label)=>label==='Campus email:'?'frontend-test@example.edu':temporaryPassword;
  w.fetch=async(url,options={})=>{
    const method=options.method||'GET';let data={};
    if(url==='/api/me')data={user:signedIn};
    else if(url==='/api/register'){signedIn={id:7,email:'frontend-test@example.edu',role:'student'};data={user:signedIn};}
    else if(url==='/api/items'&&method==='GET')data=items;
    else if(url==='/api/items'&&method==='POST'){posted++;await new Promise(r=>setTimeout(r,25));const body=JSON.parse(options.body);data={...body,id:posted,status:'pending',canEdit:true};items.push(data);}
    return {ok:true,status:200,json:async()=>data};
  };
  w.eval(script);
  await new Promise(r=>setTimeout(r,10));
  w.document.getElementById('accountButton').click();
  await new Promise(r=>setTimeout(r,15));
  w.document.getElementById('openReport').click();
  assert.equal(w.document.getElementById('reportModal').classList.contains('hidden'),false);
  assert.equal(w.history.state.modal,'reportModal');
  const back=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));w.history.back();await back;
  assert.equal(w.document.getElementById('reportModal').classList.contains('hidden'),true);

  w.document.getElementById('openReport').click();
  w.document.getElementById('reportTitle').value='Rapid submit test';
  w.document.getElementById('reportCategory').value='Books';
  w.document.getElementById('reportDate').value='2026-10-10';
  w.document.getElementById('reportLocation').value='Testing Hall';
  w.document.getElementById('reportDescription').value='Temporary test listing';
  w.document.getElementById('previewImage').src='data:image/jpeg;base64,/9j/AA==';
  const form=w.document.getElementById('reportForm');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,80));
  assert.equal(posted,1,'double-submit should send one report request');
  assert.equal(items.length,1);
  dom.window.close();
});
