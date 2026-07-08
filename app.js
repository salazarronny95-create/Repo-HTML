/* ===== App: carga de Excel, persistencia y dashboard (tareas dinámicas) ===== */
"use strict";

const MIN_CARG = 10;
const TOPN = 10;
const APP_VERSION = 'v45';   // visible en la cabecera para confirmar la versión desplegada
const SCHEMA = 22;   // versión del modelo: si cambia, se descarta cualquier dato cacheado anterior
const O = {v:0,sup:1,reg:2,mac:3,mod:4,tarea:5,cid:6};
const L = {v:0,sup:1,reg:2,mac:3,mod:4,tarea:5,efec:6,cid:7,geo:8};
const W = {v:0,sup:1,reg:2,mac:3,mod:4,tarea:5,week:6,efec:7,cid:8};
const DT = {v:0,sup:1,reg:2,mac:3,mod:4,tarea:5,dia:6,efec:7,cid:8,geo:9,week:10};   // tendencia diaria
let MODEL = null;
const sortMode = {vendedor:'efe', supervisor:'efe'};
const rankLimit = {vendedor:TOPN, supervisor:TOPN};
/* ---- módulo ejecución diaria ---- */
let selDia = null;          // índice de día en el slider (null = todos)
let dailyLimit = 25;        // ejecutivos visibles en modo diario
let locReg=null, locSup=null, locVen=null;        // filtros locales de zona (solo sección Por vendedor)
let objByCid=null, execByKey=null, venSup=null, cidReg=null, venReg=null;   // índices (atados a MODEL)
let _dailyObj=null;   // tareas por cliente ya filtradas (global∩local) para el detalle del día
let _trendPts=[];     // puntos de la tendencia diaria (para los tooltips)
let _exec=null;       // mapa de ejecución vigente (respeta filtros de semana/día); lo fija render()
const stripL = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/* ---------- IndexedDB ---------- */
function idb(){ return new Promise((res,rej)=>{const r=indexedDB.open('pronaca-cumpl',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction('kv','readonly');const q=t.objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function idbDel(k){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').delete(k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function resetData(){ try{ await idbDel('model'); }catch(e){} MODEL=null; Object.keys(picked).forEach(k=>delete picked[k]); showUpload(); toast('Datos borrados. Sube las bases nuevas.'); }

/* ---------- utilidades ---------- */
const pct=(n,d)=> d? (100*n/d):0;
const fmt=n=>Math.round(n).toLocaleString('es-EC');
const p1=x=>x.toFixed(1).replace('.',',');
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const barCol=v=> v>=70?'var(--green)':v>=40?'var(--amber)':'var(--red)';

/* ---------- clasificación + parse de archivos ---------- */
const picked = {};
function sheetRows(ws){ return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null}); }
// elige la hoja cuyo encabezado contenga alguno de los nombres dados (si no, la primera)
function pickSheet(wb, needles){
  for(const name of wb.SheetNames){
    const rows=sheetRows(wb.Sheets[name]);
    const hdr=(rows[0]||[]).map(h=>String(h||'').trim().toLowerCase());
    if(needles.some(n=>hdr.some(h=>h===n||h.includes(n)))) return rows;
  }
  return sheetRows(wb.Sheets[wb.SheetNames[0]]);
}
function classifyWorkbook(wb){
  const names = wb.SheetNames.map(s=>s.toLowerCase());
  if(names.some(n=>n.includes('ejecutivo')) || names.some(n=>n.includes('tvt'))) return 'ruteros';
  const first = sheetRows(wb.Sheets[wb.SheetNames[0]]);
  const hdr = (first[0]||[]).map(h=>String(h||'').trim().toLowerCase());
  if(hdr.includes('pregunta') && hdr.includes('respuesta')) return 'teamcore';
  // AuditVision: estado_ia / resultado_general / url
  if(hdr.includes('estado_ia') || hdr.includes('resultado_general') || (hdr.includes('url')&&hdr.includes('codigo_cliente'))) return 'auditvision';
  // maestro rutero: formato anterior (NombreSupervisor/NombreVendedor/EV) o nuevo (CODIGO_CLIENTE + Vendedor/Supervisor/Macrocanal)
  if(hdr.includes('nombresupervisor') || hdr.includes('nombrevendedor') || (hdr.includes('ev')&&hdr.includes('cliente'))
     || (hdr.includes('codigo_cliente') && (hdr.includes('vendedor')||hdr.includes('supervisor')||hdr.includes('macrocanal')))
     || (hdr.includes('vendedor')&&hdr.includes('supervisor')&&hdr.includes('canal'))) return 'ruteros';
  if(hdr.includes('codigo_local') || (hdr.includes('holding')&&hdr.includes('formato'))) return 'base';
  if(hdr.some(h=>h.includes('ejecutivo de venta'))) return 'ruteros';
  return 'desconocido';
}
async function readFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf,{type:'array',cellDates:true});
  return {tipo:classifyWorkbook(wb), name:file.name, wb};
}
async function handleFiles(files){
  for(const f of files){
    try{
      const {tipo,name,wb}=await readFile(f);
      if(tipo==='desconocido'){picked['_err_'+name]={name,err:true};continue;}
      if(tipo==='ruteros'){ (picked.ruteros=picked.ruteros||[]).push({name,wb}); }  // admite varios ruteros
      else picked[tipo]={name,wb};
    }catch(e){ picked['_err_'+f.name]={name:f.name,err:true}; }
  }
  renderFileList();
}
function renderFileList(){
  const rows=[];
  if(picked.base) rows.push(`<div class="frow"><span class="tag">Base de clientes / plan</span> ${picked.base.name} <span class="ok" style="margin-left:auto">✓ detectado</span></div>`);
  else rows.push(`<div class="frow" style="opacity:.6"><span class="tag">Base de clientes / plan</span> <span style="margin-left:auto">pendiente</span></div>`);
  if(picked.ruteros&&picked.ruteros.length) picked.ruteros.forEach(r=>rows.push(`<div class="frow"><span class="tag">Rutero (maestro)</span> ${r.name} <span class="ok" style="margin-left:auto">✓ detectado</span></div>`));
  else rows.push(`<div class="frow" style="opacity:.6"><span class="tag">Rutero (maestro)</span> <span style="margin-left:auto">pendiente</span></div>`);
  if(picked.teamcore) rows.push(`<div class="frow"><span class="tag">Tareas Teamcore</span> ${picked.teamcore.name} <span class="ok" style="margin-left:auto">✓ detectado</span></div>`);
  else rows.push(`<div class="frow" style="opacity:.6"><span class="tag">Tareas Teamcore</span> <span style="margin-left:auto">pendiente</span></div>`);
  if(picked.auditvision) rows.push(`<div class="frow"><span class="tag">AuditVision (opcional)</span> ${picked.auditvision.name} <span class="ok" style="margin-left:auto">✓ detectado</span></div>`);
  else rows.push(`<div class="frow" style="opacity:.5"><span class="tag">AuditVision (opcional)</span> <span style="margin-left:auto">no cargado</span></div>`);
  Object.keys(picked).filter(k=>k.startsWith('_err_')).forEach(k=>{
    rows.push(`<div class="frow"><span class="tag" style="background:#fde2e6;color:var(--red)">No reconocido</span> ${picked[k].name} <span class="err" style="margin-left:auto">revisar</span></div>`);
  });
  $('filelist').innerHTML=rows.join('');
  $('process').disabled = !(picked.base && picked.ruteros && picked.ruteros.length && picked.teamcore);
}
function processAll(){
  $('process').innerHTML='<span class="spin"></span>Procesando…'; $('process').disabled=true;
  setTimeout(()=>{
    try{
      const tcwb=picked.teamcore.wb, bswb=picked.base.wb;
      const ruterosSheets=[]; picked.ruteros.forEach(r=>r.wb.SheetNames.forEach(n=>ruterosSheets.push(sheetRows(r.wb.Sheets[n]))));
      const model = buildModel({
        base: pickSheet(bswb, ['codigo_local','holding','nombre']),
        ruteros: ruterosSheets,  // todas las hojas de todos los ruteros (nuevo maestro + viejo p/ región)
        teamcore: pickSheet(tcwb, ['pregunta','respuesta']),
        auditvision: picked.auditvision ? pickSheet(picked.auditvision.wb, ['estado_ia','resultado_general','url','codigo_cliente']) : [],
      });
      model.schema=SCHEMA; MODEL=model; idbSet('model',model).catch(()=>{});
      Object.keys(picked).forEach(k=>delete picked[k]);
      showDashboard();
      toast('Dashboard actualizado · '+fmt(model.stats.cargadas)+' tareas cargadas'+(model.planActivo?' · plan activo':' · sin plan de objetivo'));
    }catch(e){ alert('Error al procesar: '+e.message); console.error(e); }
    finally{ $('process').innerHTML='Procesar y generar dashboard'; }
  },50);
}

/* ---------- vistas ---------- */
function showUpload(){ $('upload').classList.remove('hidden'); $('dash').classList.add('hidden'); renderMeta(); renderFileList(); }
function showDashboard(){ $('upload').classList.add('hidden'); $('dash').classList.remove('hidden'); selDia=null; dailyLimit=25; locReg=locSup=locVen=null; objByCid=execByKey=venSup=cidReg=venReg=null; _dailyObj=null; renderMeta(); initFilters(); initLocalFilters(); render(); }
function renderMeta(){
  const m=$('meta'); if(!MODEL){ m.innerHTML=''; return; }
  const gen=new Date(MODEL.generado);
  m.innerHTML =
    `<span class="pill2">📅 ${MODEL.periodo||'período no detectado'}</span>`+
    `<span class="pill2">🔄 ${gen.toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'})} ${gen.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span>`+
    `<span class="pill2">⚙ ${APP_VERSION}</span>`+
    `<div class="mbtns"><button class="tbtn solid" id="btn-update">Actualizar datos</button><button class="tbtn ghost" id="btn-dl">Exportar HTML</button><button class="tbtn ghost" id="btn-reset">Borrar datos</button></div>`;
  $('btn-update').onclick=()=>showUpload(); $('btn-dl').onclick=exportHTML;
  $('btn-reset').onclick=()=>{ if(confirm('¿Borrar los datos cargados y empezar de cero? Tendrás que volver a subir las bases.')) resetData(); };
}

/* ---------- filtros (selección múltiple con checkboxes) ---------- */
// [idContenedor, claveDict, etiqueta]. semana/día solo aplican a la ejecución (no al plan).
const FILTERS = [['region','region','Región'],['macrocanal','macrocanal','Macrocanal'],['supervisor','supervisor','Supervisor'],
  ['vendedor','vendedor','Vendedor'],['modelo','modelo','Modelo'],['pregunta','tarea','Tarea'],
  ['semana','semana','Semana'],['dia','dia','Día']];
// UX: todas las opciones aparecen MARCADAS por defecto; se DESMARCA lo que no se quiere calcular.
const filterSel = {};   // claveDict -> Set de índices INCLUIDOS (marcados)
const filterAll = {};   // claveDict -> nº total de opciones (para saber si están todas)
function labelFor(dk,v){ if(dk==='semana') return 'Sem '+v; if(dk==='dia') return fmtDiaLargo(v); return v; }
function optsFor(dk){ const D=MODEL.dicts; return (D[dk]||[]).map((v,i)=>[v,i]).filter(([v])=>v!=='' && v!=null)
  .sort((a,b)=> dk==='semana'? (Number(a[0])-Number(b[0])) : (dk==='dia'? (a[0]<b[0]?-1:1) : String(a[0]).localeCompare(String(b[0]),'es'))); }
function resetFilter(dk){ filterSel[dk]=new Set(optsFor(dk).map(([v,i])=>i)); }   // todas marcadas
function initFilters(){
  FILTERS.forEach(([id,dk])=>{ const opts=optsFor(dk); filterAll[dk]=opts.length; if(!filterSel[dk]||filterSel[dk].size===0) resetFilter(dk); buildMsf(id,dk,opts); });
  $('clear').onclick=()=>{ FILTERS.forEach(([id,dk])=>{ resetFilter(dk); syncMsf(id,dk); }); render(); };
  if(!window.__msfDocBound){ window.__msfDocBound=true;
    document.addEventListener('click',(e)=>{ if(!e.target.closest||!e.target.closest('.msf')) closeAllMsf(); }); }
  $('sub-head').textContent = (MODEL.periodo? MODEL.periodo+' · ':'')+
    'Cruce de tareas asignadas (base) contra ejecución real en Teamcore · cumplimiento por cliente y tarea.';
}
function buildMsf(id,dk,opts){
  const host=$('mf-'+id); if(!host) return;
  host.innerHTML=
    `<button type="button" class="msf-btn"><span class="msf-txt">Todas</span><span class="msf-caret">▾</span></button>`+
    `<div class="msf-pan hidden"><div class="msf-tools"><input class="msf-search" placeholder="Buscar…"><button type="button" class="msf-all">Todas</button><button type="button" class="msf-none">Ninguna</button></div>`+
    `<div class="msf-list">`+
      (opts.length? opts.map(([v,i])=>`<label class="msf-opt"><input type="checkbox" value="${i}"><span>${esc(labelFor(dk,v))}</span></label>`).join('')
        : `<div class="msf-empty">Sin datos</div>`)+
    `</div></div>`;
  const btn=host.querySelector('.msf-btn'), pan=host.querySelector('.msf-pan'), list=host.querySelector('.msf-list');
  btn.onclick=(e)=>{ e.stopPropagation(); const willOpen=pan.classList.contains('hidden'); closeAllMsf(); if(willOpen) pan.classList.remove('hidden'); };
  list.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{ const i=+cb.value; cb.checked?filterSel[dk].add(i):filterSel[dk].delete(i); msfLabel(id,dk); render(); });
  const all=host.querySelector('.msf-all'); if(all) all.onclick=()=>{ resetFilter(dk); syncMsf(id,dk); render(); };
  const none=host.querySelector('.msf-none'); if(none) none.onclick=()=>{ filterSel[dk]=new Set(); syncMsf(id,dk); render(); };
  const se=host.querySelector('.msf-search'); if(se) se.oninput=()=>{ const q=stripL(se.value); list.querySelectorAll('.msf-opt').forEach(o=>{o.style.display=stripL(o.textContent).includes(q)?'':'none';}); };
  syncMsf(id,dk);
}
function syncMsf(id,dk){ const host=$('mf-'+id); if(!host) return;
  host.querySelectorAll('.msf-list input').forEach(cb=>cb.checked=filterSel[dk].has(+cb.value)); msfLabel(id,dk); }
function msfLabel(id,dk){ const host=$('mf-'+id); if(!host) return; const D=MODEL.dicts, s=filterSel[dk], tot=filterAll[dk]||0;
  const btn=host.querySelector('.msf-btn'), txt=host.querySelector('.msf-txt');
  if(s.size>=tot){ txt.textContent='Todas'; btn.classList.remove('on'); }
  else if(s.size===0){ txt.textContent='Ninguna'; btn.classList.add('on'); }
  else if(s.size===1){ txt.textContent=labelFor(dk, D[dk][[...s][0]]); btn.classList.add('on'); }
  else { txt.textContent=s.size+' de '+tot; btn.classList.add('on'); }
}
function closeAllMsf(){ document.querySelectorAll('.msf-pan').forEach(p=>p.classList.add('hidden')); }
// null = todas marcadas (sin filtro); si hay algo desmarcado devuelve el Set de incluidos
function selSet(dk){ const s=filterSel[dk]; if(!s) return null; return s.size>=(filterAll[dk]||0)?null:s; }
function activeF(){ return Object.fromEntries(FILTERS.map(([id,dk])=>[dk,selSet(dk)])); }
function globalActive(){ return FILTERS.some(([id,dk])=>selSet(dk)!==null); }
// filtros que aplican al PLAN (sin tiempo): región/macro/supervisor/vendedor/modelo/tarea
function passDims(r,f,I){ return (f.region===null||f.region.has(r[I.reg]))&&(f.macrocanal===null||f.macrocanal.has(r[I.mac]))&&
  (f.supervisor===null||f.supervisor.has(r[I.sup]))&&(f.vendedor===null||f.vendedor.has(r[I.v]))&&
  (f.modelo===null||f.modelo.has(r[I.mod]))&&(f.tarea===null||f.tarea.has(r[I.tarea])); }
function filterLoad(){ const f=activeF(); return MODEL.load.filter(r=>passDims(r,f,L)); }
function filterObj(){ const f=activeF(); return MODEL.obj.filter(r=>passDims(r,f,O)); }
function filterDT(){ const f=activeF(); return (MODEL.daytrend||[]).filter(r=>passDims(r,f,DT)
  && (f.dia===null||f.dia.has(r[DT.dia])) && (f.semana===null||(r[DT.week]>=0&&f.semana.has(r[DT.week])))); }
function timeActive(){ return selSet('semana')!==null || selSet('dia')!==null; }
// mapas de ejecución (logrado/geo por cliente×tarea). Si hay filtro de semana/día, se derivan del detalle diario.
function execMaps(){
  const execMap=new Map(), geoMap=new Map();
  if(timeActive()){
    filterDT().forEach(r=>{ const k=r[DT.cid]+'|'+r[DT.tarea];
      execMap.set(k, Math.max(execMap.get(k)||0, r[DT.efec]));
      if(r[DT.efec]===1 && r[DT.geo]===1) geoMap.set(k,1); });
  } else {
    filterLoad().forEach(r=>{ const k=r[L.cid]+'|'+r[L.tarea]; execMap.set(k, r[L.efec]); geoMap.set(k, r[L.geo]); });
  }
  return {execMap, geoMap};
}

/* ---------- Geocerca: logradas dentro / fuera del radio de 50 m ---------- */
function renderGeo(logradas, logrGeo, cGeoCli, cSinGeoCli){
  const box=$('geo-cards'); if(!box) return;
  const st=MODEL.stats||{};
  if(!st.hasGeo){ box.style.display='none'; box.innerHTML=''; return; }   // sin columna GEO cerca → no se muestran
  box.style.display='';
  const radio=st.geoRadio||50;
  const conGeo=logrGeo||0, sinGeo=Math.max(0,(logradas||0)-conGeo);
  const pConGeo=pct(conGeo,logradas), pSinGeo=pct(sinGeo,logradas);
  box.innerHTML=
    `<div class="geocard ok"><span class="accent"></span>`+
      `<div class="geo-k">Logradas con GEO cerca</div>`+
      `<div class="geo-v">${fmt(conGeo)}</div>`+
      `<div class="geo-d"><b>${fmt(cGeoCli||0)} clientes</b> · ${p1(pConGeo)}% de las logradas · check-in dentro de ${radio} m</div>`+
      `<div class="bar"><i style="width:${pConGeo}%;background:var(--green)"></i></div></div>`+
    `<div class="geocard no"><span class="accent"></span>`+
      `<div class="geo-k">Logradas sin geocerca</div>`+
      `<div class="geo-v">${fmt(sinGeo)}</div>`+
      `<div class="geo-d"><b>${fmt(cSinGeoCli||0)} clientes</b> · ${p1(pSinGeo)}% de las logradas · fuera de ${radio} m o sin ubicación</div>`+
      `<div class="bar"><i style="width:${pSinGeo}%;background:var(--red)"></i></div></div>`;
}

/* ---------- tendencia diaria de cumplimiento (línea, por día de Teamcore) ---------- */
function renderEvo(){
  const dias=(MODEL.dicts.dia)||[];
  if(!MODEL.daytrend||dias.length<1){ $('evo-panel').style.display='none'; return; }
  $('evo-panel').style.display='';
  const agg=dias.map(()=>({e:0,l:0,c:new Set()}));   // tareas trabajadas, logradas, clientes (por día)
  filterDT().forEach(r=>{const a=agg[r[DT.dia]]; a.e++; a.l+=r[DT.efec]; a.c.add(r[DT.cid]);});
  const pts=dias.map((iso,i)=>{const a=agg[i]; return {iso,i,e:a.e,l:a.l,cli:a.c.size,v:pct(a.l,a.e)};});
  _trendPts=pts;
  const n=pts.length, vbW=1000, vbH=300, L=46,R=20,T=36,B=46, pw=vbW-L-R, ph=vbH-T-B;
  const X=i=> n>1? L+(i/(n-1))*pw : L+pw/2;
  const Y=v=> T+(1-Math.max(0,Math.min(100,v))/100)*ph;
  let grid=''; [0,25,50,75,100].forEach(g=>{const y=Y(g).toFixed(1);
    grid+=`<line x1="${L}" y1="${y}" x2="${vbW-R}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`+
      `<text x="${L-8}" y="${(+y+3).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${g}%</text>`;});
  const wd=pts.filter(p=>p.e>0);
  let area='',line='',dots='',labels='',hits='';
  if(wd.length){
    const lp=wd.map(p=>`${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`);
    area=`<polygon fill="var(--mint)" opacity="0.45" points="${X(wd[0].i).toFixed(1)},${Y(0).toFixed(1)} ${lp.join(' ')} ${X(wd[wd.length-1].i).toFixed(1)},${Y(0).toFixed(1)}"/>`;
    line=`<polyline fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${lp.join(' ')}"/>`;
    dots=wd.map(p=>`<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4.5" fill="${barCol(p.v)}" stroke="#fff" stroke-width="1.6"/>`).join('');
    labels=wd.map(p=>`<text x="${X(p.i).toFixed(1)}" y="${(Y(p.v)-11).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--ink)">${p1(p.v)}%</text>`).join('');
    hits=wd.map(p=>`<circle class="evo-hit" data-i="${p.i}" cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="16" fill="transparent" style="cursor:pointer"/>`).join('');
  }
  const step=Math.max(1,Math.ceil(n/12));
  let xl=''; pts.forEach((p,i)=>{ if(i%step===0||i===n-1){const d=new Date(p.iso+'T00:00:00Z');
    xl+=`<text x="${X(i).toFixed(1)}" y="${vbH-B+18}" text-anchor="middle" font-size="10" fill="var(--muted)">${d.getUTCDate()} ${MON[d.getUTCMonth()]}</text>`;}});
  $('evo').style.position='relative';
  $('evo').innerHTML=
    `<svg viewBox="0 0 ${vbW} ${vbH}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;max-height:330px;overflow:visible">${grid}${area}${line}${dots}${labels}${hits}${xl}</svg>`+
    `<div id="evo-tip" class="evo-tip" style="display:none"></div>`+
    `<div class="evo-leg">Tendencia diaria del <b>% de cumplimiento</b> (tareas logradas ÷ tareas cargadas ese día, según la fecha de Teamcore). El valor sobre cada punto es ese %; pasa el cursor para ver clientes · tareas cargadas · tareas logradas.</div>`;
  // tooltips interactivos
  const cont=$('evo'), tip=$('evo-tip');
  cont.querySelectorAll('.evo-hit').forEach(c=>{
    const show=()=>{ const p=_trendPts[+c.dataset.i]; if(!p) return;
      tip.innerHTML=`<b>${fmtDiaLargo(p.iso)}</b><span>${fmt(p.cli)} clientes</span><span>${fmt(p.e)} tareas cargadas</span><span>${fmt(p.l)} tareas logradas</span><span class="big">${p1(p.v)}% cumplimiento</span>`;
      tip.style.display='block';
      const cr=cont.getBoundingClientRect(), dr=c.getBoundingClientRect();
      const lx=dr.left-cr.left+dr.width/2;
      tip.style.left=Math.max(6,Math.min(cr.width-tip.offsetWidth-6, lx-tip.offsetWidth/2))+'px';
      tip.style.top=Math.max(0,(dr.top-cr.top)-tip.offsetHeight-8)+'px';
    };
    c.addEventListener('mouseenter',show); c.addEventListener('click',show);
    c.addEventListener('mouseleave',()=>{tip.style.display='none';});
  });
}

/* ========== MÓDULO EJECUCIÓN DIARIA (date slider + acordeón) ========== */
function ensureIdx(){
  if(objByCid) return;
  objByCid=new Map(); execByKey=new Map(); venSup=new Map(); cidReg=new Map(); venReg=new Map();
  for(const r of MODEL.obj){ const cid=r[O.cid],t=r[O.tarea]; if(!objByCid.has(cid))objByCid.set(cid,[]); objByCid.get(cid).push(t); if(!cidReg.has(cid))cidReg.set(cid,r[O.reg]);
    const v=r[O.v]; if(!venReg.has(v))venReg.set(v,new Set()); venReg.get(v).add(r[O.reg]); }
  for(const r of MODEL.load){ execByKey.set(r[L.cid]+'|'+r[L.tarea], r[L.efec]); if(!cidReg.has(r[L.cid]))cidReg.set(r[L.cid],r[L.reg]); }
  const tmp=new Map();
  for(const r of MODEL.obj){ const v=r[O.v],s=r[O.sup]; if(!tmp.has(v))tmp.set(v,new Map()); const mm=tmp.get(v); mm.set(s,(mm.get(s)||0)+1); }
  for(const[v,mm] of tmp){ let best=-1,bc=-1; for(const[s,c] of mm) if(c>bc){bc=c;best=s;} venSup.set(v,best); }
}
/* filtros locales de la sección Por vendedor (Región/Supervisor/Vendedor), independientes de los globales */
function initLocalFilters(){
  ensureIdx(); const D=MODEL.dicts;
  const NOISE=new Set(['Sin asignar','Sin dato','Sin región','Sin modelo','']);
  const fillStatic=(id,arr)=>{const el=$(id); if(!el)return; el.innerHTML='<option value="-1">Todas</option>'+
    arr.map((v,i)=>[v,i]).filter(([v])=>!NOISE.has(v)).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([v,i])=>`<option value="${i}">${esc(v)}</option>`).join('');};
  fillStatic('lf-region',D.region); fillStatic('lf-supervisor',D.supervisor);
  // Día desplegable (único control de día)
  const ds=$('lf-dia');
  if(ds){ ds.innerHTML='<option value="-1">Todos los días</option>'+(D.dia||[]).map((iso,i)=>`<option value="${i}">${fmtDiaLargo(iso)}</option>`).join('');
    ds.onchange=()=>{ const v=+ds.value; selDia=v<0?null:v; dailyLimit=25; render(); }; }
  repopVendedor();   // vendedor en cascada (según supervisor/región)
  const val=id=>{const v=+$(id).value;return v>=0?v:null;};
  const onZone=()=>{ locReg=val('lf-region'); locSup=val('lf-supervisor'); repopVendedor(); locVen=val('lf-vendedor'); dailyLimit=25; render(); };
  if($('lf-region')) $('lf-region').onchange=onZone;
  if($('lf-supervisor')) $('lf-supervisor').onchange=onZone;
  if($('lf-vendedor')) $('lf-vendedor').onchange=()=>{ locVen=val('lf-vendedor'); dailyLimit=25; render(); };
  if($('lf-clear')) $('lf-clear').onclick=()=>{ if($('lf-region'))$('lf-region').value='-1'; if($('lf-supervisor'))$('lf-supervisor').value='-1';
    locReg=locSup=null; repopVendedor(); locVen=null; dailyLimit=25; render(); };
}
// vendedor en cascada: solo EV del supervisor (y región) seleccionados
function repopVendedor(){
  const el=$('lf-vendedor'); if(!el) return; ensureIdx(); const D=MODEL.dicts;
  const prev=el.value;
  const list=D.vendedor.map((v,i)=>[v,i])
    .filter(([v,i])=> v!=='Sin asignar'
      && (locSup==null || venSup.get(i)===locSup)
      && (locReg==null || (venReg.get(i)&&venReg.get(i).has(locReg))))
    .sort((a,b)=>a[0].localeCompare(b[0],'es'));
  el.innerHTML='<option value="-1">Todas</option>'+list.map(([v,i])=>`<option value="${i}">${esc(v)}</option>`).join('');
  if([...el.options].some(o=>o.value===prev)) el.value=prev; else { el.value='-1'; locVen=null; }
}
function localPass(r){ // r de obj/load: v=0, sup=1, reg=2
  return (locVen==null||r[0]===locVen)&&(locSup==null||r[1]===locSup)&&(locReg==null||r[2]===locReg);
}
const DOW=['dom','lun','mar','mié','jue','vie','sáb'], MON=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDiaLargo(iso){ const d=new Date(iso+'T00:00:00Z'); return DOW[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()]; }
function taskShort(lab){
  const s=stripL(lab);
  if(s.includes('pronaca')) return 'EEFF Pronaca';
  if(s.includes('material')) return 'Material POP/externo';
  if(s.includes('bandeja')||s.includes('eeff')||s.includes('equipo de frio')||s.includes('frio')) return 'EEFF del cliente';
  return lab.length>34?lab.slice(0,32)+'…':lab;
}
function renderDaySlider(){
  const dias=(MODEL.dicts.dia)||[]; const el=$('dayslider'); if(!el) return;
  if(!dias.length){ el.innerHTML='<span class="psub">Sin fechas en Teamcore</span>'; return; }
  let html=`<button class="daychip all ${selDia===null?'on':''}" data-d="-1"><span class="dc-n">Todos</span><span class="dc-m">${dias.length} días</span></button>`;
  dias.forEach((iso,i)=>{ const d=new Date(iso+'T00:00:00Z');
    html+=`<button class="daychip ${selDia===i?'on':''}" data-d="${i}"><span class="dc-d">${DOW[d.getUTCDay()]}</span><span class="dc-n">${d.getUTCDate()}</span><span class="dc-m">${MON[d.getUTCMonth()]}</span></button>`;
  });
  el.innerHTML=html;
  const ds=$('lf-dia'); if(ds) ds.value = selDia===null?'-1':String(selDia);   // sincroniza dropdown
  el.querySelectorAll('.daychip').forEach(b=>b.onclick=()=>{ const d=+b.dataset.d; selDia=d<0?null:d; dailyLimit=25; render();
    setTimeout(()=>{const on=el.querySelector('.daychip.on'); if(on&&on.scrollIntoView)on.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});},0);
  });
}
function renderDaily(diaIdx){
  ensureIdx(); const D=MODEL.dicts;
  // Universo permitido = filtros MAESTROS de cabecera (filterObj) ∩ filtros locales de la sección (localPass).
  // Así la cabecera (región/macrocanal/supervisor/vendedor/modelo/tarea) también mueve el módulo diario.
  const foD=filterObj().filter(localPass);
  const objF=new Map(); const allow=new Set();
  for(const r of foD){ const cid=r[O.cid]; allow.add(cid); if(!objF.has(cid))objF.set(cid,[]); objF.get(cid).push(r[O.tarea]); }
  _dailyObj=objF;   // el detalle por cliente usa solo las tareas permitidas
  const venMap=new Map();
  for(const r of MODEL.dayrec){ if(r[1]!==diaIdx) continue;
    const v=r[0]; if(D.vendedor[v]==='Sin asignar') continue;
    const cid=r[2]; if(!allow.has(cid)) continue;   // global ∩ local (incluye vendedor/supervisor/región/modelo/tarea)
    if(!venMap.has(v))venMap.set(v,new Set()); venMap.get(v).add(cid);
  }
  const EX=_exec||execByKey;
  let arr=[...venMap.entries()].map(([v,cidset])=>{
    const cids=[...cidset]; let asig=0,logr=0;
    for(const cid of cids){ const ts=objF.get(cid)||[]; asig+=ts.length; for(const t of ts) if(EX.get(cid+'|'+t)===1) logr++; }
    return {v,cids,ncli:cids.length,asig,logr,cumpl:pct(logr,asig)};
  });
  arr.sort((a,b)=> b.ncli-a.ncli || b.cumpl-a.cumpl);
  const iso=D.dia[diaIdx];
  const shown=arr.slice(0,dailyLimit);
  let html=`<div class="psub">Día <b style="color:var(--ink)">${fmtDiaLargo(iso)}</b> · ${arr.length} ejecutivos con impacto · toca un ejecutivo para ver sus clientes y tareas del día.</div>`+
    `<div class="exlegend"><span><i style="background:#1c6b46"></i>Lograda</span><span><i style="background:#8a5a00"></i>Ejecutada sin lograr</span><span><i style="background:#6b7a76"></i>No ejecutada</span></div>`;
  html+= shown.map((x,i)=>{ const col=barCol(x.cumpl);
    return `<div class="exrow" data-i="${i}"><button class="exhead">`+
      `<span class="exev">EV ${esc(D.vendedor[x.v])}</span>`+
      `<span class="exsup">${esc(D.supervisor[venSup.get(x.v)]||'—')}</span>`+
      `<span class="exbadge">${x.ncli} cli</span>`+
      `<span class="exkpi"><small>${fmt(x.logr)}/${fmt(x.asig)}</small> · <b style="color:${col}">${p1(x.cumpl)}%</b></span>`+
      `<span class="exchev">▸</span></button><div class="exbody hidden"></div></div>`;
  }).join('') || '<div class="psub" style="padding:14px">Sin ejecución registrada ese día.</div>';
  if(arr.length>dailyLimit) html+=`<div class="daily-more"><button class="morebtn" id="daily-more-btn">Ver más (${arr.length-dailyLimit})</button></div>`;
  $('daily-vendedor').innerHTML=html;
  $('daily-vendedor').querySelectorAll('.exrow').forEach(row=>{
    const head=row.querySelector('.exhead'), body=row.querySelector('.exbody'), i=+row.dataset.i;
    head.onclick=()=>{ const open=row.classList.toggle('open');
      if(open){ body.classList.remove('hidden'); if(!body.dataset.built){ body.innerHTML=vendorBody(shown[i]); body.dataset.built='1'; } }
      else body.classList.add('hidden');
    };
  });
  const mb=$('daily-more-btn'); if(mb) mb.onclick=()=>{ dailyLimit=99999; render(); };
}
function vendorBody(x){
  const D=MODEL.dicts; const src=_dailyObj||objByCid; const EX=_exec||execByKey;
  return x.cids.map(cid=>{
    const code=MODEL.clientes[cid]||('#'+cid), nom=MODEL.clienteNom[cid]||'';
    const ts=src.get(cid)||[];
    const chips=ts.map(t=>{ const ef=EX.get(cid+'|'+t); const st= ef===1?'g': ef===0?'a':'n';
      return `<span class="tchip ${st}" title="${esc(D.tarea[t])}"><span class="dot"></span>${esc(taskShort(D.tarea[t]))}</span>`;
    }).join('');
    return `<div class="excli"><div class="exclih">${esc(code)} <span class="exclin">${esc(nom)}</span></div><div class="extasks">${chips||'<span class="exclin">sin tareas asignadas</span>'}</div></div>`;
  }).join('');
}

/* ---------- render ---------- */
function render(){
  const D=MODEL.dicts, plan=MODEL.planActivo;
  const fo=filterObj(), fl=filterLoad();
  // CUMPLIMIENTO = logradas / tareas asignadas (plan). Todo en tareas (cliente × tarea),
  // emparejando cada tarea asignada (base) con su ejecución en Teamcore.
  // ejecución (logrado/geo por cliente×tarea); si hay filtro de semana/día se deriva del detalle diario
  const {execMap, geoMap}=execMaps(); _exec=execMap;   // disponible para drilldowns (respeta semana/día)
  const logrOf=rows=>rows.reduce((s,r)=> s+(execMap.get(r[O.cid]+'|'+r[O.tarea])===1?1:0),0);
  const ejecOf=rows=>rows.reduce((s,r)=> s+(execMap.has(r[O.cid]+'|'+r[O.tarea])?1:0),0);
  const geoOf=rows=>rows.reduce((s,r)=>{const k=r[O.cid]+'|'+r[O.tarea]; return s+((execMap.get(k)===1&&geoMap.get(k)===1)?1:0);},0);

  let asignadas, ejecutadas, logradas, noLogr, pend, cumpl, cob, calidad, cids, logrGeo;
  if(plan){
    asignadas=fo.length; logradas=logrOf(fo); ejecutadas=ejecOf(fo); logrGeo=geoOf(fo);
    noLogr=ejecutadas-logradas; pend=asignadas-ejecutadas;
    cumpl=pct(logradas,asignadas); cob=pct(ejecutadas,asignadas); calidad=pct(logradas,ejecutadas);
    const s=new Set(); fo.forEach(r=>s.add(r[O.cid])); cids=s.size;
  } else { // sin plan: solo lo ejecutado en Teamcore
    ejecutadas=fl.length; logradas=fl.reduce((s,r)=>s+r[L.efec],0); asignadas=ejecutadas;
    logrGeo=fl.reduce((s,r)=>s+((r[L.efec]===1&&r[L.geo]===1)?1:0),0);
    noLogr=ejecutadas-logradas; pend=0; cumpl=pct(logradas,ejecutadas); cob=100; calidad=cumpl;
    const s=new Set(); fl.forEach(r=>s.add(r[L.cid])); cids=s.size;
  }

  // clientes distintos por métrica (para el detalle de cada tarjeta)
  const csCarg=new Set(),csEjec=new Set(),csLogr=new Set(),csNoLogr=new Set(),csPend=new Set(),csGeo=new Set(),csSinGeo=new Set();
  if(plan){
    fo.forEach(r=>{const cid=r[O.cid],k=cid+'|'+r[O.tarea]; csCarg.add(cid);
      const ex=execMap.has(k), lo=execMap.get(k)===1, ge=geoMap.get(k)===1;
      if(ex){csEjec.add(cid); if(lo){csLogr.add(cid);(ge?csGeo:csSinGeo).add(cid);} else csNoLogr.add(cid);} else csPend.add(cid);});
  } else {
    fl.forEach(r=>{const cid=r[L.cid]; csCarg.add(cid); csEjec.add(cid);
      if(r[L.efec]===1){csLogr.add(cid);(r[L.geo]===1?csGeo:csSinGeo).add(cid);} else csNoLogr.add(cid);});
  }
  const cCarg=csCarg.size,cEjec=csEjec.size,cLogr=csLogr.size,cNoLogr=csNoLogr.size,cPend=csPend.size,cGeoCli=csGeo.size,cSinGeoCli=csSinGeo.size;

  const parts=[]; FILTERS.forEach(([id,dk,lbl])=>{const s=selSet(dk); if(!s) return;
    parts.push(s.size<=2? [...s].map(i=>labelFor(dk,D[dk][i])).join(', ') : (lbl+': '+s.size+' de '+(filterAll[dk]||0)));});
  $('summary').innerHTML=(parts.length?('Filtro: '+parts.join(' · ')+' — '):'Vista global — ')
    +(plan?fmt(asignadas)+' cargadas (base) · '+fmt(ejecutadas)+' ejecutadas ('+p1(cob)+'% cobertura) · ':fmt(ejecutadas)+' ejecutadas · ')
    +fmt(logradas)+' logradas · <b>'+p1(cumpl)+'% cumplimiento</b>'
    +(plan?' · '+p1(calidad)+'% de lo ejecutado fue logrado':'')+' · '+fmt(cids)+' clientes';

  const cli=n=>`<b>${fmt(n)} clientes</b>`;
  const cards = plan ? [
    ['Clientes', fmt(cids), 'clientes con tareas cargadas', false],
    ['Tareas cargadas', fmt(asignadas), cli(cCarg)+' · base', false],
    ['Ejecutadas', fmt(ejecutadas), cli(cEjec)+' · '+p1(cob)+'% cobertura', false],
    ['Tareas logradas', fmt(logradas), cli(cLogr)+' · '+p1(cumpl)+'% cumplimiento', true],
    ['No logradas', fmt(noLogr), cli(cNoLogr)+' · ejecutadas sin lograr', false],
    ['Pendientes', fmt(pend), cli(cPend)+' · sin ejecutar', false],
  ] : [
    ['Clientes', fmt(cids), 'clientes ejecutados en Teamcore', false],
    ['Ejecutadas', fmt(ejecutadas), cli(cEjec)+' · en Teamcore', false],
    ['Tareas logradas', fmt(logradas), cli(cLogr)+' · '+p1(cumpl)+'% de lo ejecutado', true],
    ['No logradas', fmt(noLogr), cli(cNoLogr)+' · ejecutadas sin lograr', false],
  ];
  $('cards').innerHTML=cards.map(c=>`<div class="kpi ${c[3]?'hero':''}"><span class="accent"></span><div class="k">${c[0]}</div><div class="v">${c[1]}</div><div class="d">${c[2]}</div></div>`).join('');
  renderGeo(logradas, logrGeo, cGeoCli, cSinGeoCli);
  renderEvo();

  const ncli=rows=>{const s=new Set(); rows.forEach(r=>s.add(plan?r[O.cid]:r[L.cid])); return s.size;};
  // por modelo → clientes · tareas cargadas · logradas · cumplimiento
  const modAgg=(D.modelo||[]).map((mo,mi)=>{const rs= plan?fo.filter(r=>r[O.mod]===mi):fl.filter(r=>r[L.mod]===mi);
      return {mo,ncli:ncli(rs),asig:rs.length,logr: plan?logrOf(rs):rs.reduce((s,r)=>s+r[L.efec],0)};})
    .filter(x=>x.mo!=='Sin dato' && x.asig>=MIN_CARG).sort((a,b)=>b.asig-a.asig);
  $('by-modelo').innerHTML=modAgg.map(x=>{const v=pct(x.logr,x.asig),col=barCol(v);
    return `<div class="modcard"><div class="mn">${esc(x.mo)}</div><div class="mv">${p1(v)}%</div>`+
      `<div class="ms">${fmt(x.ncli)} clientes · ${fmt(x.logr)}/${fmt(x.asig)} tareas logradas/cargadas</div><div class="bar"><i style="width:${v}%;background:${col}"></i></div></div>`;}).join('')
    || '<div class="psub">Sin datos de modelo</div>';

  // por tarea → clientes · tareas cargadas · logradas · cumplimiento, ordenado por cargadas
  const taskAgg=(D.tarea||[]).map((lab,ti)=>{const rs= plan?fo.filter(r=>r[O.tarea]===ti):fl.filter(r=>r[L.tarea]===ti);
      return {lab,ncli:ncli(rs),asig:rs.length,ejec: plan?ejecOf(rs):rs.length,logr: plan?logrOf(rs):rs.reduce((s,r)=>s+r[L.efec],0)};})
    .filter(x=>x.asig>0).sort((a,b)=>b.asig-a.asig);
  $('by-preg').innerHTML=taskAgg.map(x=>{const v=pct(x.logr,x.asig),col=barCol(v);
    return `<tr><td class="tlab" title="${esc(x.lab)}">${esc(x.lab)}</td><td class="num">${fmt(x.ncli)}</td><td class="num">${fmt(x.asig)}</td><td class="num">${fmt(x.logr)}</td>`+
      `<td class="num bold" style="color:${col}">${p1(v)}%</td><td><div class="bar"><i style="width:${v}%;background:${col}"></i></div></td></tr>`;}).join('')
    || '<tr><td colspan="6" class="psub">Sin tareas</td></tr>';

  { const _ds=$('lf-dia'); if(_ds) _ds.value = selDia===null?'-1':String(selDia); }  // sincroniza dropdown de día
  if(selDia===null){ $('ven-normal').classList.remove('hidden'); $('daily-vendedor').classList.add('hidden'); ranking('vendedor',O.v); }
  else { $('ven-normal').classList.add('hidden'); $('daily-vendedor').classList.remove('hidden'); renderDaily(selDia); }
  ranking('supervisor',O.sup); bindMore();
  renderAuditVision();
  $('foot').innerHTML=
    `<p><span class="bold">Tarea cumplida.</span> Cada tarea asignada en la base (cliente × tarea) se cruza con la columna <i>Pregunta</i> de Teamcore; es lograda si quedó en <i>Logrado</i>. Todo se mide en tareas, no en clientes.</p>`
    +`<p><span class="bold">Cumplimiento = logradas / tareas asignadas (plan).</span> Es el indicador principal en todo el reporte: tarjetas, desgloses y rankings usan este mismo denominador (lo asignado), para no inflar con lo no ejecutado.</p>`
    +`<p><span class="bold">Cobertura = ejecutadas / asignadas</span> (cuánto del plan se trabajó). <span class="bold">Calidad de ejecución = logradas / ejecutadas</span> (de lo que sí se trabajó, cuánto se logró) — se muestra solo como contexto, nunca como titular.</p>`
    +`<p><span class="bold">Embudo.</span> Asignadas = Logradas + No logradas (ejecutadas sin lograr) + Pendientes (sin ejecutar).</p>`
    +`<p><span class="bold">Atribución.</span> Vendedor y supervisor del maestro Ruteros (columnas Vendedor/EV y Supervisor), por código de cliente; región del rutero (Ciudad/Almacén si la trae). Modelo de Teamcore o de la columna modelo de la base. Rankings: mínimo ${MIN_CARG} asignadas; se excluyen "Sin asignar/Sin dato".</p>`
    +`<p style="margin-bottom:0;color:var(--muted)"><span class="bold" style="color:var(--amber)">Calidad de datos.</span> El maestro cubre ~97% de los clientes ejecutados, así que vendedor y supervisor quedan casi completos (clientes fuera del maestro caen en "Sin asignar" y se excluyen de los rankings). La columna modelo de la base está incompleta: los clientes sin modelo quedan fuera del desglose por modelo.</p>`;
}

function ranking(kind, ocol){
  // Cumplimiento por persona = logradas / tareas ASIGNADAS (plan). Cada cliente puede tener
  // hasta N tareas asignadas; medimos cuántas de esas quedaron logradas.
  const D=MODEL.dicts; let fo=filterObj();
  const isVen = kind==='vendedor';
  if(isVen){ fo=fo.filter(localPass); ensureIdx(); }  // filtros locales + índices p/ detalle
  const {execMap}=execMaps();   // respeta semana/día si están activos
  const stat=new Map();
  const venCids = isVen ? new Map() : null;   // vendedor -> clientes asignados (para desplegar)
  const g=(k)=>{let a=stat.get(k);if(!a){a={asig:0,ejec:0,logr:0,cids:new Set(),sup:new Map()};stat.set(k,a);}return a;};
  for(const r of fo){
    const a=g(r[ocol]); a.asig++; a.cids.add(r[O.cid]);
    if(isVen){ const s=r[O.sup]; a.sup.set(s,(a.sup.get(s)||0)+1);
      if(!venCids.has(r[ocol]))venCids.set(r[ocol],new Set()); venCids.get(r[ocol]).add(r[O.cid]); }
    const k=r[O.cid]+'|'+r[O.tarea];
    if(execMap.has(k)){ a.ejec++; if(execMap.get(k)===1) a.logr++; }
  }
  let arr=[...stat.entries()].map(([k,a])=>{
    let supName='';
    if(isVen && a.sup.size){ let best=-1,bc=-1; for(const[s,c] of a.sup) if(c>bc){bc=c;best=s;} supName=D.supervisor[best]||''; }
    return {vidx:k,name:D[kind][k],sup:supName,ncli:a.cids.size,asig:a.asig,ejec:a.ejec,logr:a.logr, efe:pct(a.logr,a.asig)};
  });
  const NOISE=new Set(['Sin asignar','Sin dato','Sin región','Sin modelo','']);
  const elig=arr.filter(x=>x.asig>=MIN_CARG && !NOISE.has(x.name));
  elig.sort((x,y)=> y.efe-x.efe||y.logr-x.logr);   // siempre por % cumplimiento
  const lim=rankLimit[kind], shown=elig.slice(0,lim);
  const ncols = isVen?7:6;
  const rows=shown.map(x=>{
    const col=barCol(x.efe);
    const nameCell = isVen ? `<td class="bold"><span class="ven-chev">▸</span> ${esc(x.name)}</td>` : `<td class="bold">${esc(x.name)}</td>`;
    return `<tr class="${isVen?'ven-row':''}" ${isVen?`data-ev="${x.vidx}"`:''}>`+nameCell+(isVen?`<td class="psub" style="border:0;border-bottom:1px solid var(--line)">${esc(x.sup||'—')}</td>`:'')+
      `<td class="num">${fmt(x.ncli)}</td><td class="num">${fmt(x.asig)}</td><td class="num">${fmt(x.logr)}</td>`+
      `<td class="num bold" style="color:${col}">${p1(x.efe)}%</td><td><div class="bar"><i style="width:${x.efe}%;background:${col}"></i></div></td></tr>`;
  }).join('') || `<tr><td colspan="${ncols}" class="psub" style="padding:14px">Sin registros con tareas cargadas ≥ ${MIN_CARG}</td></tr>`;
  $('rk-'+kind).innerHTML=rows;
  const sub=$(kind==='vendedor'?'ven-sub':'sup-sub');
  if(sub) sub.textContent=`${elig.length} con ≥ ${MIN_CARG} tareas cargadas · orden por % cumplimiento`+(isVen?' · toca un ejecutivo para ver su resumen consolidado':'');
  if(isVen){
    $('more-vendedor').innerHTML = elig.length>TOPN ? `<button class="morebtn" data-rk="vendedor">${lim>=elig.length?'Ver menos':'Ver más ('+(elig.length-TOPN)+')'}</button>` : '';
    // expandir cada vendedor -> base de clientes asignados con su cumplimiento
    $('rk-vendedor').querySelectorAll('tr.ven-row').forEach(tr=>{
      tr.onclick=()=>{
        const open=tr.classList.toggle('open');
        const nxt=tr.nextElementSibling;
        if(open){
          const ev=+tr.dataset.ev; const cids=[...(venCids.get(ev)||[])];
          const det=document.createElement('tr'); det.className='ven-det';
          det.innerHTML=`<td colspan="${ncols}">${rankDetail(cids)}</td>`;
          tr.after(det);
        } else if(nxt && nxt.classList.contains('ven-det')) nxt.remove();
      };
    });
  }
}
// detalle: resumen CONSOLIDADO del vendedor (una fila) — Clientes / Tareas cargadas / Logradas / % cumplimiento
function rankDetail(cids){
  ensureIdx(); const EX=_exec||execByKey;
  let asig=0, logr=0;
  for(const cid of cids){ const ts=objByCid.get(cid)||[]; asig+=ts.length; for(const t of ts) if(EX.get(cid+'|'+t)===1) logr++; }
  const nCli=cids.length, c=pct(logr,asig), col=barCol(c);
  return `<div class="exbody"><table class="rdt"><thead><tr>`+
      `<th class="num">Clientes</th><th class="num">Tareas cargadas</th><th class="num">Logradas</th><th class="num">% Cumplimiento</th></tr></thead>`+
    `<tbody><tr>`+
      `<td class="num">${fmt(nCli)}</td><td class="num">${fmt(asig)}</td><td class="num">${fmt(logr)}</td>`+
      `<td class="num bold" style="color:${col}">${p1(c)}%</td></tr></tbody></table>`+
    `<div class="bar" style="margin-top:9px"><i style="width:${c}%;background:${col}"></i></div></div>`;
}
function bindMore(){
  document.querySelectorAll('.morebtn').forEach(b=>b.onclick=()=>{
    const k=b.dataset.rk; rankLimit[k]= rankLimit[k]>=9999 ? TOPN : 9999; render();
  });
}
/* ---------- AuditVision: validación IA de imágenes ---------- */
// Verde solo si es claramente positivo; cualquier negativo ("NO CUMPLE", "negativo"…) va en rojo.
function avNeg(v){ const s=stripL(v).trim(); return s.startsWith('no')||s.includes('negativ')||s.includes('rechaz')||s.includes('incumpl'); }
function avCumple(v){ const s=stripL(v).trim(); return s!=='' && !avNeg(v) && s.includes('cumple'); }
function avPositivo(v){ const s=stripL(v).trim(); return s!=='' && !avNeg(v) && (s.includes('positiv')||s==='ok'); }
function renderAuditVision(){
  const avAll=(MODEL.auditvision)||[]; const sec=$('av-section');
  if(!avAll.length){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  // Los filtros maestros de cabecera también acotan AuditVision (por clientes del universo filtrado).
  let av=avAll;
  if(globalActive()){
    ensureIdx();
    const allowCodes=new Set(); filterObj().forEach(r=>allowCodes.add(String(MODEL.clientes[r[O.cid]])));
    av=avAll.filter(r=> allowCodes.has(String(r[0])));
  }
  if(!av.length){ $('auditvision').innerHTML='<div class="psub" style="padding:14px">Sin imágenes auditadas para el filtro seleccionado.</div>'; return; }
  const rows=av.map(r=>{
    const cod=r[0], est=r[1], res=r[2], url=r[3];
    const eok=avCumple(est), rok=avPositivo(res);
    const a = url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : '';
    const link = url ? `<a ${a}>Ver imagen ↗</a>` : '<span class="psub">sin URL</span>';
    return `<tr><td class="bold">${esc(cod)}</td>`+
      `<td><span class="avpill ${eok?'g':'n'}">${esc(est||'—')}</span></td>`+
      `<td><span class="avpill ${rok?'g':'n'}">${esc(res||'—')}</span></td>`+
      `<td>${link}</td></tr>`;
  }).join('');
  $('auditvision').innerHTML=
    `<table><thead><tr><th>Cliente</th><th>Estado IA</th><th>Resultado</th><th>Enlace</th></tr></thead><tbody>${rows}</tbody></table>`+
    `<div class="psub" style="margin-top:8px">Las imágenes vienen de Teamcore (http). Si la PWA está en https, la miniatura puede no mostrarse por seguridad del navegador; el enlace "Ver imagen" siempre abre la foto en una pestaña nueva.</div>`;
}

/* ---------- exportar / toast ---------- */
async function exportHTML(){
  if(!MODEL){ toast('No hay datos para exportar'); return; }
  const btn=$('btn-dl'); const prev=btn?btn.textContent:''; if(btn){btn.textContent='Generando…';}
  try{
    // traer los scripts para incrustarlos (HTML autocontenido)
    const bust='?x='+Date.now();
    const [xlsxT,pipeT,appT]=await Promise.all([
      fetch('xlsx.full.min.js'+bust).then(r=>r.text()),
      fetch('pipeline.js'+bust).then(r=>r.text()),
      fetch('app.js'+bust).then(r=>r.text()),
    ]);
    const safe=s=>String(s).replace(/<\/script/gi,'<\\/script');   // evita cerrar el <script> embebido
    // JSON seguro para incrustar en <script>: escapa cierre de tag, comentarios y separadores de línea
    const modelJson=JSON.stringify(MODEL).replace(/[<]/g,'\\u003c').replace(/[>]/g,'\\u003e').replace(/[\u2028]/g,'\\u2028').replace(/[\u2029]/g,'\\u2029');
    // clonar el DOM y limpiar referencias externas
    const root=document.documentElement.cloneNode(true);
    root.querySelectorAll('script,link[rel="manifest"]').forEach(n=>n.remove());  // quita TODOS los scripts; se reinyectan abajo
    const up=root.querySelector('#upload'); if(up)up.classList.add('hidden');
    const dash=root.querySelector('#dash'); if(dash)dash.classList.remove('hidden');
    const body=root.querySelector('body');
    const addScript=txt=>{const s=document.createElement('script');s.textContent=txt;body.appendChild(s);};
    addScript(safe(xlsxT));
    addScript(safe(pipeT));
    addScript('window.__EMBEDDED_MODEL__='+modelJson+';');
    addScript(safe(appT));
    const html='<!DOCTYPE html>\n'+root.outerHTML;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='cumplimiento_'+((MODEL.periodo||'').replace(/[^0-9a-z]+/gi,'_').toLowerCase()||'export')+'.html';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast('HTML interactivo exportado ✓');
  }catch(e){ console.error(e); alert('No se pudo generar el HTML interactivo: '+e.message+'\n(El export requiere abrir la app desde su URL, no como archivo local.)'); }
  finally{ if(btn) btn.textContent=prev; }
}
let toastT;
function toast(msg){ let t=$('toast'); if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.style.display='block'; clearTimeout(toastT); toastT=setTimeout(()=>t.style.display='none',3200); }

/* ---------- eventos ---------- */
$('file').addEventListener('change',e=>handleFiles(e.target.files));
const dz=$('drop');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');}));
dz.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));
$('process').addEventListener('click',processAll);
if($('reset-upload')) $('reset-upload').addEventListener('click',resetData);

/* ---------- init ---------- */
(async function(){
  // HTML exportado autocontenido: el modelo viene embebido
  if(typeof window!=='undefined' && window.__EMBEDDED_MODEL__){ MODEL=window.__EMBEDDED_MODEL__; showDashboard(); return; }
  try{
    const saved=await idbGet('model');
    if(saved && saved.schema===SCHEMA){ MODEL=saved; showDashboard(); return; }
    if(saved){ await idbDel('model'); }   // descarta datos de una versión anterior
  }catch(e){}
  showUpload();
})();

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
