import { GENE_BOUNDS, INPUTS, OUTPUTS, type Cell, type Gene, type WorldView } from '../engine/types.js';
interface Runtime { running: boolean; targetTps: number; actualTps: number; lastSavedTick: number | null; lastSaveError: string | null; }
type State = WorldView & { runtime: Runtime };
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const text = (id: string, value: string | number) => { $(id).textContent = String(value); };
const escape = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const nf = new Intl.NumberFormat('en-US');
let state: State | null = null, selected: number | null = null, layer = 'lineage', tool = 'inspect', radius = 3;
let hover: [number,number] | null = null, dragging = false, lastBrush = 0, fetching = false, cellFetching = false;
let toastTimer = 0, eventKey = '', cellKey = '', commandQueue = Promise.resolve();
const canvas = $<HTMLCanvasElement>('world'), ctx = canvas.getContext('2d')!, chart = $<HTMLCanvasElement>('history'), chartCtx = chart.getContext('2d')!;
function toast(message: string, error = false) { const t=$('toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.hidden=true,5000); }
async function request<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(url, data === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error ?? `HTTP ${response.status}`), {status:response.status}); return result as T;
}
function command(data: unknown, message?: string): Promise<void> {
  commandQueue = commandQueue.then(async()=>{await request('/api/command',data);if(message)toast(message);await refresh();}).catch(e=>toast(String(e.message ?? e),true));
  return commandQueue;
}
function action(button: string, fn: ()=>Promise<unknown>, message: string) {
  $(button).addEventListener('click', async()=>{const b=$<HTMLButtonElement>(button);b.disabled=true;try{await fn();toast(message);await refresh();}catch(e){toast(String(e instanceof Error?e.message:e),true);}finally{b.disabled=false;}});
}
const lineageColor = (id: number, lightness = 68) => `hsl(${(id*137.508)%360} 57% ${lightness}%)`;
function renderWorld() {
  if(!state)return;const {width:w,height:h}=state.config, unit=18;
  if(canvas.width!==w*unit || canvas.height!==h*unit){canvas.width=w*unit;canvas.height=h*unit;}
  ctx.fillStyle='#0b140e';ctx.fillRect(0,0,canvas.width,canvas.height);
  const f=state.fields;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(f.walls[p]){ctx.fillStyle='#596458';ctx.fillRect(x*unit,y*unit,unit,unit);ctx.fillStyle='#82907c';ctx.fillRect(x*unit+2,y*unit+2,2,2);continue;}
    let r=12,g=23,b=16;
    if(layer==='a'){const v=Math.min(1,f.a[p]/.35);r+=v*28;g+=v*134;b+=v*147;}
    else if(layer==='b'){const v=Math.min(1,f.b[p]/.35);r+=v*138;g+=v*60;b+=v*143;}
    else if(layer==='waste'){const v=Math.min(1,f.waste[p]/1.5);r+=v*173;g+=v*70;b+=v*18;}
    else {const v=Math.min(1,f.food[p]/(layer==='food'?4:7));r+=v*22;g+=v*(layer==='food'?98:52);b+=v*19;}
    ctx.fillStyle=`rgb(${r|0},${g|0},${b|0})`;ctx.fillRect(x*unit,y*unit,unit,unit);
  }
  for(const c of state.cells){
    const cx=(c.x+.5)*unit,cy=(c.y+.5)*unit;
    ctx.globalAlpha=['lineage','energy'].includes(layer)?1:.7;
    ctx.fillStyle=layer==='energy'?`hsl(${Math.min(130,c.energy*9)} 66% 64%)`:lineageColor(c.lineage,43+c.integrity*27);
    ctx.beginPath();ctx.ellipse(cx,cy,6.2,5.2,((c.id*31)%180)*Math.PI/180,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(9,25,12,.55)';ctx.beginPath();ctx.arc(cx+.5,cy,1.7,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const c=state.cells.find(c=>c.id===selected);
  if(c){
    const x=(c.x+.5)*unit,y=(c.y+.5)*unit;
    if($<HTMLInputElement>('adjacency').checked){ctx.strokeStyle='#e7fbd9';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);for(const n of state.cells)if(Math.abs(n.x-c.x)+Math.abs(n.y-c.y)===1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((n.x+.5)*unit,(n.y+.5)*unit);ctx.stroke();}ctx.setLineDash([]);}
    ctx.strokeStyle='#f9ffe8';ctx.lineWidth=2;ctx.strokeRect(c.x*unit-2,c.y*unit-2,unit+4,unit+4);
  }
  if(hover && tool!=='inspect'){ctx.strokeStyle='#f0ffd4';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc((hover[0]+.5)*unit,(hover[1]+.5)*unit,(radius+.5)*unit,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
}
function renderChart(){
  if(!state)return;const hist=state.history,c=chartCtx,w=chart.width,h=chart.height;
  c.clearRect(0,0,w,h);const max=Math.max(10,...hist.map(p=>p.population))*1.1;
  c.strokeStyle='#32402f';c.lineWidth=1;
  for(let k=0;k<=2;k++){const y=12+(h-27)*k/2;c.beginPath();c.moveTo(36,y);c.lineTo(w,y);c.stroke();c.fillStyle='#8da386';c.font='13px monospace';c.fillText(String(Math.round(max*(1-k/2))),0,y+4);}
  if(hist.length){const pos=(i:number)=>[36+i*(w-36)/Math.max(1,hist.length-1),h-15-hist[i].population/max*(h-27)];
    c.beginPath();hist.forEach((_,i)=>{const [x,y]=pos(i);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.strokeStyle='#c8ed96';c.lineWidth=2.5;c.stroke();
    c.lineTo(w,h-15);c.lineTo(36,h-15);c.closePath();c.fillStyle='#c8ed9614';c.fill();
  }
  text('history-start',nf.format(hist[0]?.tick??0));text('history-end',nf.format(hist.at(-1)?.tick??0));
}
function renderStats(){
  if(!state)return;const m=state.metrics,r=state.runtime;
  text('population',nf.format(m.population));text('population-note',`${nf.format(m.births)} births · ${nf.format(m.deaths)} deaths`);
  text('energy',m.meanEnergy.toFixed(2));text('generation',String(m.generation).padStart(2,'0'));text('lineages',m.lineages);
  text('spread',m.traitSpread.toFixed(3));text('mutations',nf.format(m.mutations));text('tick',new Intl.NumberFormat('en-US',{minimumIntegerDigits:6}).format(state.tick));
  text('session-seed',`SEED ${state.config.seed}`);text('dimensions',`${state.config.width} × ${state.config.height}`);
  text('actual-speed',`${r.actualTps.toFixed(0)} ticks/s`);text('world-state',r.running?'LIVE SYSTEM':'PAUSED / INSPECT MODE');
  text('play',r.running?'Pause':'Resume');text('connection',r.running?'Running':'Paused');text('residual',m.energyResidual.toExponential(1));
  text('integrity',`${(m.meanIntegrity*100).toFixed(1)}%`);text('clusters',m.clusters);text('largest',`${m.largestCluster} cells`);text('transfers',nf.format(m.transfers));
  $('extinct').hidden=m.population!==0;
  if(r.lastSaveError)text('save-note',`Save failed: ${r.lastSaveError}`);else if(r.lastSavedTick!==null)text('save-note',`Last saved at tick ${nf.format(r.lastSavedTick)}. Restore replaces and pauses the world.`);
  for(const key of ['signals','plasticity','sharing','season'] as const)$<HTMLInputElement>(key).checked=state.config[key];
  if(document.activeElement!==$('supply'))$<HTMLInputElement>('supply').value=String(state.config.supply);
  if(document.activeElement!==$('mutation'))$<HTMLInputElement>('mutation').value=String(state.config.mutationRate);
  text('supply-value',state.config.supply.toFixed(3));text('mutation-value',`${(state.config.mutationRate*100).toFixed(1)}%`);
  $<HTMLSelectElement>('speed').value=String(r.targetTps);
  const events=state.events.slice(-5).reverse(),key=JSON.stringify(events);
  if(key!==eventKey){eventKey=key;const list=$('events');list.replaceChildren();for(const e of events){const div=document.createElement('div');div.className='event';const time=document.createElement('time');time.textContent=`TICK ${nf.format(e.tick)} / ${e.kind.toUpperCase()}`;div.append(time,document.createTextNode(e.message));list.append(div);}}
}
const bar=(name:string,value:number,label:string,color='#c8ed96')=>`<div class="bar-row"><div><span>${escape(name)}</span><span>${escape(label)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,value*100))}%;background:${color}"></div></div></div>`;
async function inspect(){
  if(selected===null||!state||cellFetching)return;
  const id=selected,key=`${id}/${state.tick}/${state.events.length}`;if(key===cellKey)return;
  cellFetching=true;
  try{
    const c=await request<Cell>(`/api/cells/${id}`);if(selected!==id)return;
    cellKey=key;$('inspector-empty').hidden=true;$('cell-detail').hidden=false;
    const g=c.genome.traits, detailsOpen=$('cell-detail').querySelector('details')?.open ?? false;
    $('cell-detail').innerHTML=`<div class="cell-heading"><strong><span class="lineage-dot" style="background:${lineageColor(c.lineage)}"></span>Cell ${c.id}</strong><span class="tag">${escape(c.action)}</span></div><div class="cell-meta">Founder ${c.lineage} · generation ${c.generation}<br>Parent ${c.parentId??'none'} · age ${c.age} ticks · (${c.x}, ${c.y})</div>${bar('Energy',c.energy/g.division,`${c.energy.toFixed(2)} / ${g.division.toFixed(1)}`)}${bar('Integrity',c.integrity,`${(c.integrity*100).toFixed(1)}%`)}<div class="cell-section">Receiver state</div>${bar('A receptor gain',c.expression[0],c.expression[0].toFixed(3),'#78d8d4')}${bar('B receptor gain',c.expression[1],c.expression[1].toFixed(3),'#c6a4d9')}<div class="cell-meta">Stress memory ${c.memory.toFixed(3)}<br>${c.mutations} loci changed at this cell's birth</div><div class="cell-section">Controller inputs</div><div class="input-grid">${INPUTS.map((name,i)=>`<div>${name}<strong>${c.lastInputs[i].toFixed(3)}</strong></div>`).join('')}</div><div class="cell-section">Action gates</div>${OUTPUTS.map((name,i)=>bar(name,c.lastOutputs[i],c.lastOutputs[i].toFixed(2))).join('')}<details ${detailsOpen?'open':''}><summary>Inherited traits & controller weights</summary><dl>${(Object.keys(GENE_BOUNDS) as Gene[]).map(k=>`<div><dt>${k}</dt><dd>${g[k].toFixed(3)}</dd></div>`).join('')}</dl><p class="hint">Rows = 7 actions. Columns = 7 inputs. Cyan positive, violet negative. Hover for exact values.</p><div class="weight-grid">${c.genome.weights.map((v,i)=>`<span title="${OUTPUTS[Math.floor(i/7)]} ← ${INPUTS[i%7]}: ${v.toFixed(4)}" style="background:${v>=0?'#78d8d4':'#c6a4d9'};opacity:${.15+.85*Math.min(1,Math.abs(v)/4)}"></span>`).join('')}</div></details>`;
  }catch(e){if(selected===id && (e as {status?:number}).status===404){$('cell-detail').innerHTML='<h3>This cell is no longer alive.</h3><p class="hint">Its descendants may remain. Select another cell in the habitat.</p>';cellKey=key;}}
  finally{cellFetching=false;}
}
async function refresh(){
  if(fetching)return;fetching=true;
  try{state=await request<State>('/api/state');document.body.classList.remove('offline');renderStats();renderWorld();renderChart();void inspect();}
  catch{document.body.classList.add('offline');text('connection','Disconnected');}
  finally{fetching=false;}
}
$('play').onclick=()=>void command({type:state?.runtime.running?'pause':'resume'});
$('step').onclick=()=>void command({type:'step',ticks:1});$('step-many').onclick=()=>void command({type:'step',ticks:100});
$('speed').onchange=()=>void command({type:'speed',tps:Number($<HTMLSelectElement>('speed').value)});
$('supply').oninput=()=>text('supply-value',Number($<HTMLInputElement>('supply').value).toFixed(3));
$('supply').onchange=()=>void command({type:'config',patch:{supply:Number($<HTMLInputElement>('supply').value)}});
$('mutation').oninput=()=>text('mutation-value',`${(Number($<HTMLInputElement>('mutation').value)*100).toFixed(1)}%`);
$('mutation').onchange=()=>void command({type:'config',patch:{mutationRate:Number($<HTMLInputElement>('mutation').value)}});
for(const key of ['signals','plasticity','sharing','season'])$(key).onchange=()=>void command({type:'config',patch:{[key]:$<HTMLInputElement>(key).checked}});
$('reset').onclick=()=>{if(!confirm('Replace the current world? Export or save a checkpoint first to keep this run.'))return;selected=null;cellKey='';$('cell-detail').hidden=true;$('inspector-empty').hidden=false;void command({type:'reset',seed:Number($<HTMLInputElement>('seed').value),preset:$<HTMLSelectElement>('preset').value},'New seeded world created.');};
action('save',()=>request('/api/checkpoint',{action:'save'}),'Checkpoint saved.');
action('load',async()=>{if(!confirm('Replace this world with the last saved checkpoint?'))return;selected=null;cellKey='';$('cell-detail').hidden=true;$('inspector-empty').hidden=false;await request('/api/checkpoint',{action:'load'});},'Checkpoint action complete.');
$('import').onclick=()=>$<HTMLInputElement>('snapshot-file').click();
$('snapshot-file').onchange=async()=>{const input=$<HTMLInputElement>('snapshot-file'),file=input.files?.[0];if(!file)return;try{if(file.size>16*1024*1024)throw new Error('Snapshot exceeds 16 MiB');if(!confirm('Import this snapshot and replace the current world?'))return;await request('/api/snapshot',JSON.parse(await file.text()));selected=null;cellKey='';$('cell-detail').hidden=true;$('inspector-empty').hidden=false;toast('Snapshot imported. World is paused.');await refresh();}catch(e){toast(String(e instanceof Error?e.message:e),true);}finally{input.value='';}};
const legends:Record<string,string>={lineage:'Color = founder ancestry · brightness = integrity',energy:'Cell color: low energy (red) → high energy (green)',food:'Nutrient field: 0 → 4 resource units / site',a:'Channel A: 0 → 0.35 signal units / site',b:'Channel B: 0 → 0.35 signal units / site',waste:'Waste field: 0 → 1.5 concentration units / site'};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-layer]'))b.onclick=()=>{layer=b.dataset.layer!;document.querySelectorAll('[data-layer]').forEach(x=>x.classList.toggle('active',x===b));text('legend',legends[layer]);renderWorld();};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))b.onclick=()=>{tool=b.dataset.tool!;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x===b));text('canvas-help',tool==='inspect'?'Click a cell to inspect it. Pause for exact observations. All decisions use local state.':`Click or drag to apply ${b.textContent?.toLowerCase()}. This is an external intervention, recorded in the notebook.`);renderWorld();};
$('radius').oninput=()=>{radius=Number($<HTMLInputElement>('radius').value);text('radius-value',radius);renderWorld();};$('adjacency').onchange=()=>renderWorld();
function position(e:PointerEvent):[number,number]|null{if(!state)return null;const r=canvas.getBoundingClientRect();return[Math.max(0,Math.min(state.config.width-1,Math.floor((e.clientX-r.left)/r.width*state.config.width))),Math.max(0,Math.min(state.config.height-1,Math.floor((e.clientY-r.top)/r.height*state.config.height)))];}
function applyBrush(){if(!hover||tool==='inspect')return;const [x,y]=hover;void command({type:'brush',tool,x,y,radius});lastBrush=performance.now();}
canvas.onpointerdown=e=>{hover=position(e);if(!hover||!state)return;canvas.setPointerCapture(e.pointerId);if(tool==='inspect'){const c=state.cells.find(c=>c.x===hover![0]&&c.y===hover![1]);if(c){selected=c.id;cellKey='';void inspect();renderWorld();}else toast('No cell here. Select a colored cell or use “Inspect a living cell”.');}else{dragging=true;applyBrush();}};
canvas.onpointermove=e=>{hover=position(e);if(dragging&&performance.now()-lastBrush>130)applyBrush();renderWorld();};
canvas.onpointerup=()=>{dragging=false;};canvas.onpointercancel=()=>{dragging=false;};canvas.onpointerleave=()=>{if(!dragging)hover=null;renderWorld();};
$('inspect-first').onclick=()=>{if(!state?.cells.length){toast('No living cells to inspect.');return;}selected=state.cells[0].id;cellKey='';void inspect();renderWorld();};
$('guide-open').onclick=()=>$<HTMLDialogElement>('guide').showModal();$('guide-close').onclick=()=>$<HTMLDialogElement>('guide').close();
document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===document.body&&!$<HTMLDialogElement>('guide').open){e.preventDefault();void command({type:state?.runtime.running?'pause':'resume'});}});
async function loop(){await refresh();setTimeout(loop,300);}void loop();
