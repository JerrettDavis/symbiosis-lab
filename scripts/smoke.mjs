import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
const socket=createServer();await new Promise(ok=>socket.listen(0,'127.0.0.1',ok));const port=socket.address().port;await new Promise(ok=>socket.close(ok));
const dir=mkdtempSync(join(tmpdir(),'symbiosis-smoke-')),base=`http://127.0.0.1:${port}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let child=null,logs='';
async function start(){
 child=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,PAUSED:'true',AUTOSAVE:'true'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(`Server exited: ${logs}`);try{if((await fetch(base+'/healthz')).ok)return;}catch{}await sleep(50);}throw new Error(`Server did not start: ${logs}`);
}
async function stop(){if(!child||child.exitCode!==null)return;const exit=new Promise((ok,fail)=>{child.once('exit',(code)=>(code===0||process.platform==='win32')?ok():fail(new Error(`Server exited ${code}: ${logs}`)));child.once('error',fail);});child.kill('SIGTERM');await exit;child=null;}
async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
try{
 await start();await post('/api/command',{type:'step',ticks:100});await post('/api/checkpoint',{action:'save'});
 const before=await(await fetch(base+'/api/snapshot')).json();await stop();await start();
 const after=await(await fetch(base+'/api/snapshot')).json();assert.deepEqual(after,before);
 assert.equal((await fetch(base+'/web/app.js')).status,200);
 console.log('PASS: actual server entrypoint, HTTP controls, persistent checkpoint and process restart.');
}finally{await stop();rmSync(dir,{recursive:true,force:true});}
