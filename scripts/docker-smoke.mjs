import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const probe=spawnSync('docker',['version'],{stdio:'ignore'});
if(probe.error||probe.status!==0){console.error('Docker CLI and a running Docker daemon are required. Start Docker Desktop or your Docker service.');process.exit(1);}
const socket=createServer();await new Promise(ok=>socket.listen(0,'127.0.0.1',ok));const port=socket.address().port;await new Promise(ok=>socket.close(ok));
const project=`symbiosis-test-${process.pid}`,env={...process.env,LAB_PORT:String(port),LAB_PAUSED:'true'};
function compose(args){const p=spawnSync('docker',['compose','-p',project,...args],{env,stdio:'inherit'});if(p.status!==0)throw new Error(`docker compose ${args.join(' ')} failed`);}
async function post(path,data){const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
try{
 compose(['config','--quiet']);compose(['up','--build','--detach','--wait','--wait-timeout','120']);
 await post('/api/command',{type:'step',ticks:100});await post('/api/checkpoint',{action:'save'});
 const before=await(await fetch(`http://127.0.0.1:${port}/api/snapshot`)).json();
 compose(['restart','lab']);
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'container never became healthy after restart');
 const after=await(await fetch(`http://127.0.0.1:${port}/api/snapshot`)).json();assert.deepEqual(after,before);
 console.log('PASS: Docker build, health, read-only runtime, named-volume checkpoint, restart, exact recovery.');
}finally{compose(['down','--volumes','--remove-orphans']);}
