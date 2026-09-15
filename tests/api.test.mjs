import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLab } from '../dist/server/app.js';
import { World } from '../dist/engine/world.js';
async function lab(t) {
  const dataDir=mkdtempSync(join(tmpdir(),'symbiosis-test-'));
  const app=createLab({dataDir,autosave:false,running:false,world:new World({width:24,height:16,founders:10})});
  await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{await app.stop();rmSync(dataDir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const get=async path=>(await fetch(base+path)).json();
  const post=async(path,value,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  return {app,base,get,post};
}
test('health, live world view, static app and CSP are served',async t=>{const {get,base}=await lab(t);assert.equal((await get('/healthz')).status,'ok');assert.equal((await get('/api/state')).cells.length,10);const res=await fetch(base);assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await res.text(),/Local rules\. Collective behavior\./);for(const path of ['/web/app.js','/engine/types.js','/style.css','/mark.svg'])assert.equal((await fetch(base+path)).status,200);});
test('pause, exact step, speed and resume controls work',async t=>{const {post,get}=await lab(t);await post('/api/command',{type:'step',ticks:100});let s=await get('/api/state');assert.equal(s.tick,100);assert.equal(s.runtime.running,false);await post('/api/command',{type:'speed',tps:120});await post('/api/command',{type:'resume'});await new Promise(r=>setTimeout(r,100));await post('/api/command',{type:'pause'});s=await get('/api/state');assert.ok(s.tick>100);assert.equal(s.runtime.targetTps,120);});
test('inspect route returns a full genome or an explicit 404',async t=>{const {get,base}=await lab(t);assert.equal((await get('/api/cells/1')).genome.weights.length,49);assert.equal((await fetch(base+'/api/cells/99999')).status,404);});
test('configuration and brush changes affect authoritative state',async t=>{const {post,get}=await lab(t);await post('/api/command',{type:'config',patch:{signals:false,mutationRate:0}});assert.equal((await get('/api/state')).config.signals,false);await post('/api/command',{type:'brush',tool:'wall',x:10,y:8,radius:2});assert.equal((await get('/api/state')).fields.walls[8*24+10],1);});
test('checkpoint save and restore recovers exact engine state and pauses',async t=>{const {post,get}=await lab(t);await post('/api/command',{type:'step',ticks:30});const before=await get('/api/snapshot');assert.equal((await post('/api/checkpoint',{action:'save'})).status,200);await post('/api/command',{type:'step',ticks:10});await post('/api/checkpoint',{action:'load'});assert.deepEqual(await get('/api/snapshot'),before);assert.equal((await get('/api/state')).runtime.running,false);});
test('JSON export and import roundtrip, while malformed import leaves world unchanged',async t=>{const {post,get}=await lab(t);const before=await get('/api/snapshot');assert.equal((await post('/api/snapshot',{...before,model:'oops'})).status,400);assert.deepEqual(await get('/api/snapshot'),before);await post('/api/command',{type:'step',ticks:20});assert.equal((await post('/api/snapshot',before)).status,200);assert.deepEqual(await get('/api/snapshot'),before);});
test('cross-origin browser writes are rejected',async t=>{const {post}=await lab(t);assert.equal((await post('/api/command',{type:'resume'},{Origin:'http://evil.example'})).status,403);});
test('bad JSON, wrong content type, oversized commands and invalid payloads are rejected',async t=>{const {base,post}=await lab(t);assert.equal((await fetch(base+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);assert.equal((await fetch(base+'/api/command',{method:'POST',body:'hi'})).status,400);for(const command of [{type:'step',ticks:50000},{type:'speed',tps:-5},{type:'config',patch:{signals:'false'}},{type:'brush',tool:'wall',x:500,y:3,radius:1},{type:'reset',preset:'missing'},{type:'unknown'}])assert.equal((await post('/api/command',command)).status,400);});
test('reset uses named preset and requested seed, not previous tweaks',async t=>{const {post,get}=await lab(t);assert.equal((await post('/api/command',{type:'reset',seed:17,preset:'scarcity'})).status,200);const s=await get('/api/state');assert.equal(s.config.seed,17);assert.equal(s.config.supply,.004);assert.equal(s.tick,0);});
test('missing checkpoint and unknown API routes return 404',async t=>{const {base,post}=await lab(t);assert.equal((await post('/api/checkpoint',{action:'load'})).status,404);assert.equal((await fetch(base+'/api/nope')).status,404);});
test('static traversal cannot expose source or package files',async t=>{const {base}=await lab(t);for(const p of ['/../package.json','/%2e%2e%2fpackage.json','/src/server/index.ts'])assert.equal((await fetch(base+p)).status,404);});
