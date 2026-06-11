// ============================================================
// MAGS — Sezione Calendario
// ============================================================
// CALENDARIO
// ============================================================
const MONTHS_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const DOW_IT = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

function pad(n){ return String(n).padStart(2,'0'); }
function ymd(y,m,d){ return `${y}-${pad(m+1)}-${pad(d)}`; }
function todayYmd(){ const n=new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()); }

async function openCalendar(){
  if(!state.cal.selDate) state.cal.selDate = todayYmd();
  if(!state.cal.weekStart) state.cal.weekStart = mondayOf(state.cal.selDate);
  if(!state.cal.view) state.cal.view = 'settimana';
  renderCalFilter();
  applyCalView();
}

// applica la vista corrente (mese/settimana/giorno)
async function applyCalView(){
  const v = state.cal.view;
  // toggle pulsanti
  document.querySelectorAll('#cal-viewseg .vseg-opt').forEach(b=>b.classList.toggle('on', b.dataset.view===v));
  // mostra/nascondi contenitori
  $('cal-week').classList.toggle('hidden', v!=='settimana');
  $('cal-month').classList.toggle('hidden', v!=='mese');
  if(v==='mese'){
    await loadMonthEventsCal();
    renderMonth();
  } else if(v==='settimana'){
    await loadWeekEvents();
    renderWeek();
  } else { // giorno
    await loadWeekEvents();
    const sel=new Date(state.cal.selDate+'T12:00:00');
    $('cal-title').innerHTML = `${MONTHS_IT[sel.getMonth()].charAt(0).toUpperCase()+MONTHS_IT[sel.getMonth()].slice(1)} <span class="nm">${sel.getFullYear()}</span>`;
    const lbl = sel.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
    $('cal-weeklabel').textContent = lbl.charAt(0).toUpperCase()+lbl.slice(1);
  }
  renderDayAgenda();
}

// carica eventi del mese (per la vista mese)
async function loadMonthEventsCal(){
  const sel = new Date(state.cal.selDate+'T12:00:00');
  const y=sel.getFullYear(), mo=sel.getMonth();
  const start = `${y}-${pad(mo+1)}-01`;
  const endDate = new Date(y, mo+1, 1);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-01`;
  const { data } = await sb.from('events').select('*')
    .eq('household_id', state.household.id)
    .gte('start_at', start+'T00:00:00').lt('start_at', end+'T00:00:00').order('start_at');
  state.cal.events = data||[];
}

function renderMonth(){
  const sel = new Date(state.cal.selDate+'T12:00:00');
  const y=sel.getFullYear(), mo=sel.getMonth();
  $('cal-title').innerHTML = `${MONTHS_IT[mo].charAt(0).toUpperCase()+MONTHS_IT[mo].slice(1)} <span class="nm">${y}</span>`;
  $('cal-weeklabel').textContent = `${MONTHS_IT[mo].charAt(0).toUpperCase()+MONTHS_IT[mo].slice(1)} ${y}`;

  const grid=$('cal-month'); grid.innerHTML='';
  DOW_IT.forEach(d=>{ const e=document.createElement('div'); e.className='mg-dow'; e.textContent=d; grid.appendChild(e); });
  const first=new Date(y,mo,1);
  let startDow=first.getDay(); startDow=(startDow===0)?6:startDow-1;
  const daysInMonth=new Date(y,mo+1,0).getDate();
  for(let i=0;i<startDow;i++){ const e=document.createElement('div'); e.className='mg-cell empty'; grid.appendChild(e); }
  for(let d=1; d<=daysInMonth; d++){
    const dateStr=ymd(y,mo,d);
    const cell=document.createElement('div'); cell.className='mg-cell';
    if(dateStr===todayYmd()) cell.classList.add('today');
    if(dateStr===state.cal.selDate) cell.classList.add('sel');
    const evs=eventsForDay(dateStr);
    const cats=[...new Set(evs.map(e=>e.category))].slice(0,4);
    const pips=cats.map(c=>`<span class="mg-pip" style="background:${CAT_COLORS[c]||'var(--ink-soft)'}"></span>`).join('');
    cell.innerHTML=`<span class="mg-n">${d}</span><span class="mg-pips">${pips}</span>`;
    cell.onclick=()=>{ state.cal.selDate=dateStr; renderMonth(); renderDayAgenda(); };
    grid.appendChild(cell);
  }
}

// lunedì della settimana che contiene dateStr
function mondayOf(dateStr){
  const d = new Date(dateStr+'T12:00:00');
  let dow = d.getDay(); dow = (dow===0)?6:dow-1; // lun=0
  d.setDate(d.getDate()-dow);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(dateStr, n){
  const d=new Date(dateStr+'T12:00:00'); d.setDate(d.getDate()+n);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

function renderCalFilter(){
  const wrap=$('cal-filter'); wrap.innerHTML='';
  const mk=(id,label)=>{
    const p=document.createElement('div');
    p.className='fpill'+(state.cal.filterMember===id?' on':'');
    p.textContent=label;
    p.onclick=()=>{ state.cal.filterMember=id; renderCalFilter(); if(state.cal.view==='mese') renderMonth(); else if(state.cal.view==='settimana') renderWeek(); renderDayAgenda(); };
    wrap.appendChild(p);
  };
  mk('all','Tutti');
  state.members.forEach(m=> mk(m.id, m.display_name));
}

async function loadWeekEvents(){
  const start = state.cal.weekStart;
  const end = addDays(start, 7);
  const { data, error } = await sb.from('events')
    .select('*')
    .eq('household_id', state.household.id)
    .gte('start_at', start+'T00:00:00')
    .lt('start_at', end+'T00:00:00')
    .order('start_at');
  if(error){ console.error(error); state.cal.events=[]; return; }
  state.cal.events = data||[];
}

function eventsForDay(dateStr){
  return state.cal.events.filter(e=>{
    const d = (e.start_at||'').slice(0,10);
    if(d!==dateStr) return false;
    if(state.cal.filterMember!=='all' && e.member_id!==state.cal.filterMember) return false;
    return true;
  }).sort((a,b)=> (a.start_at||'').localeCompare(b.start_at||''));
}

function renderWeek(){
  const start = state.cal.weekStart;
  const startObj = new Date(start+'T12:00:00');
  const endObj = new Date(addDays(start,6)+'T12:00:00');
  // etichetta intervallo + titolo mese
  const mese = MONTHS_IT[startObj.getMonth()];
  $('cal-title').innerHTML = `${mese.charAt(0).toUpperCase()+mese.slice(1)} <span class="nm">${startObj.getFullYear()}</span>`;
  const sameMonth = startObj.getMonth()===endObj.getMonth();
  $('cal-weeklabel').textContent = sameMonth
    ? `${startObj.getDate()}–${endObj.getDate()} ${MONTHS_IT[startObj.getMonth()].slice(0,3)}`
    : `${startObj.getDate()} ${MONTHS_IT[startObj.getMonth()].slice(0,3)} – ${endObj.getDate()} ${MONTHS_IT[endObj.getMonth()].slice(0,3)}`;

  const wrap=$('cal-week'); wrap.innerHTML='';
  for(let i=0;i<7;i++){
    const dateStr = addDays(start, i);
    const d = new Date(dateStr+'T12:00:00');
    const cell=document.createElement('div'); cell.className='wday';
    if(dateStr===state.cal.selDate) cell.classList.add('sel');
    const evs=eventsForDay(dateStr);
    const cats=[...new Set(evs.map(e=>e.category))].slice(0,3);
    const pips=cats.map(c=>`<span class="wpip" style="background:${CAT_COLORS[c]||'var(--ink-soft)'}"></span>`).join('');
    cell.innerHTML=`<span class="wn">${DOW_IT[i]}</span><span class="wd">${d.getDate()}</span><span class="wpips">${pips}</span>`;
    cell.onclick=()=>{ state.cal.selDate=dateStr; renderWeek(); renderDayAgenda(); };
    wrap.appendChild(cell);
  }
}

function renderDayAgenda(){
  const sel = state.cal.selDate;
  const dObj = new Date(sel+'T12:00:00');
  const label = dObj.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  $('cal-daytitle').textContent = label.charAt(0).toUpperCase()+label.slice(1);

  const wrap=$('cal-events'); wrap.innerHTML='';
  const evs = eventsForDay(sel);
  if(evs.length===0){ wrap.innerHTML='<div class="ev-empty">Nessun evento. Tocca + per aggiungerne uno.</div>'; return; }
  evs.forEach(e=>{
    const t = e.all_day ? 'tutto il giorno' : (e.start_at||'').slice(11,16);
    const mem = state.members.find(m=>m.id===e.member_id);
    const memName = mem ? mem.display_name : '';
    const row=document.createElement('div'); row.className='ev';
    row.innerHTML = `<span class="time">${t}</span>
      <span class="dot" style="background:${CAT_COLORS[e.category]||'var(--ink-soft)'}"></span>
      <div><div class="ti">${e.title}</div>
      <div class="meta">${[memName, CAT_LABELS[e.category], e.location].filter(Boolean).join(' · ')}</div></div>`;
    row.onclick=()=>openEventModal(e);
    wrap.appendChild(row);
  });
}

// nav settimane
function calNavigate(dir){
  const v = state.cal.view;
  if(v==='mese'){
    const sel=new Date(state.cal.selDate+'T12:00:00');
    sel.setMonth(sel.getMonth()+dir);
    state.cal.selDate = ymd(sel.getFullYear(), sel.getMonth(), Math.min(sel.getDate(), new Date(sel.getFullYear(),sel.getMonth()+1,0).getDate()));
  } else if(v==='settimana'){
    state.cal.weekStart = addDays(state.cal.weekStart, dir*7);
    state.cal.selDate = state.cal.weekStart;
  } else { // giorno
    state.cal.selDate = addDays(state.cal.selDate, dir);
    state.cal.weekStart = mondayOf(state.cal.selDate);
  }
  applyCalView();
}
$('cal-prev').addEventListener('click', ()=>calNavigate(-1));
$('cal-next').addEventListener('click', ()=>calNavigate(1));

// selettore vista
document.querySelectorAll('#cal-viewseg .vseg-opt').forEach(b=>{
  b.addEventListener('click', ()=>{
    state.cal.view = b.dataset.view;
    if(state.cal.view==='settimana') state.cal.weekStart = mondayOf(state.cal.selDate);
    applyCalView();
  });
});

// ---- modal evento ----
let editingEventId = null;

$('fab-event').addEventListener('click', ()=> openEventModal(null));

function openEventModal(ev){
  editingEventId = ev ? ev.id : null;
  $('event-modal-title').textContent = ev ? 'Modifica evento' : 'Nuovo evento';
  // popola select membri
  const ms=$('ev-member');
  ms.innerHTML = '<option value="">— famiglia —</option>' + state.members.map(m=>`<option value="${m.id}">${m.display_name}</option>`).join('');

  $('ev-title').value = ev?.title || '';
  $('ev-member').value = ev?.member_id || '';
  $('ev-category').value = ev?.category || 'appuntamento';
  $('ev-date').value = ev ? (ev.start_at||'').slice(0,10) : state.cal.selDate;
  $('ev-start').value = ev && !ev.all_day ? (ev.start_at||'').slice(11,16) : '';
  $('ev-end').value = ev && ev.end_at ? (ev.end_at||'').slice(11,16) : '';
  $('ev-location').value = ev?.location || '';
  $('ev-note').value = ev?.note || '';
  $('ev-delete').style.display = ev ? 'block' : 'none';
  clearError('ev-error');
  $('event-modal').classList.remove('hidden');
}

function closeEventModal(){ $('event-modal').classList.add('hidden'); }
$('ev-cancel').addEventListener('click', closeEventModal);
$('event-modal').addEventListener('click', e=>{ if(e.target.id==='event-modal') closeEventModal(); });

$('ev-save').addEventListener('click', async ()=>{
  clearError('ev-error');
  const title = $('ev-title').value.trim();
  const date = $('ev-date').value;
  if(!title){ showError('ev-error','Inserisci un titolo.'); return; }
  if(!date){ showError('ev-error','Scegli una data.'); return; }

  const startT = $('ev-start').value;
  const endT = $('ev-end').value;
  const allDay = !startT;
  const start_at = allDay ? `${date}T00:00:00` : `${date}T${startT}:00`;
  const end_at = (!allDay && endT) ? `${date}T${endT}:00` : null;

  const payload = {
    household_id: state.household.id,
    member_id: $('ev-member').value || null,
    title,
    category: $('ev-category').value,
    start_at, end_at, all_day: allDay,
    location: $('ev-location').value.trim() || null,
    note: $('ev-note').value.trim() || null,
    created_by: state.me ? state.me.id : null,
  };

  const btn=$('ev-save'); btn.disabled=true; btn.textContent='Salvataggio…';
  let error;
  if(editingEventId){
    ({ error } = await sb.from('events').update(payload).eq('id', editingEventId));
  } else {
    ({ error } = await sb.from('events').insert(payload));
  }
  btn.disabled=false; btn.textContent='Salva evento';
  if(error){ showError('ev-error','Errore: '+error.message); return; }

  closeEventModal();
  // porta la vista alla settimana dell'evento e seleziona il giorno
  state.cal.selDate = date;
  state.cal.weekStart = mondayOf(date);
  await applyCalView();
});

$('ev-delete').addEventListener('click', async ()=>{
  if(!editingEventId) return;
  const { error } = await sb.from('events').delete().eq('id', editingEventId);
  if(error){ showError('ev-error','Errore: '+error.message); return; }
  closeEventModal();
  await applyCalView();
});

// ============================================================
// ============================================================
// SUBNAV calendario (Agenda / Voli) + IMPORT ROSTER
// ============================================================
document.querySelectorAll('#cal-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#cal-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['cal-agenda','cal-voli','cal-scuola'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
    // FAB visibile solo in Agenda
    const fab=$('fab-event'); if(fab) fab.classList.toggle('hidden', s.dataset.s!=='cal-agenda');
    if(s.dataset.s==='cal-scuola') openScuola();
  });
});

// --- conversione orario UTC -> ora italiana (UTC+2, ora legale estiva) ---
// Nota: l'Italia è UTC+1 in inverno, UTC+2 in estate. Per i roster estivi usiamo +2.
// (rifinibile in seguito con calcolo DST esatto)
function utcToLocalHHMM(hhmm, dateStr){
  if(!hhmm) return hhmm;
  const [h,m] = hhmm.split(':').map(Number);
  // determina offset: ora legale ~ ultima dom marzo → ultima dom ottobre
  const d = new Date(dateStr+'T00:00:00Z');
  const year = d.getUTCFullYear();
  const lastSunday = (mon)=>{ const dt=new Date(Date.UTC(year,mon+1,0)); dt.setUTCDate(dt.getUTCDate()-dt.getUTCDay()); return dt; };
  const dstStart = lastSunday(2); // marzo
  const dstEnd = lastSunday(9);   // ottobre
  const isDST = d>=dstStart && d<dstEnd;
  const offset = isDST ? 2 : 1;
  let total = h*60 + m + offset*60;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

let rosterDays = null; // giorni importati in attesa di conferma

$('roster-pick').addEventListener('click', ()=> $('roster-file').click());

$('roster-file').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  $('roster-preview').innerHTML='';
  setRosterStatus('load','Lettura del roster in corso… può richiedere qualche secondo.');

  try{
    const base64 = await fileToBase64(file);
    const resp = await fetch('/api/import-roster', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ imageBase64: base64, mediaType: file.type })
    });
    const data = await resp.json();
    if(!resp.ok || !data.success){
      setRosterStatus('err', data.error || 'Import non riuscito. Riprova.');
      return;
    }
    // tieni i giorni con un'attività vera: voli, standby, duty, ferie...
    // scarta solo gli OFF (riposi) che non sono impegni
    rosterDays = (data.days||[]).filter(d=> d.type && d.type!=='off');
    if(rosterDays.length===0){
      setRosterStatus('err','Nessun impegno trovato nello screenshot.');
      return;
    }
    clearRosterStatus();
    renderRosterPreview();
  }catch(err){
    setRosterStatus('err','Errore: '+(err.message||err));
  }
  e.target.value=''; // reset così puoi ricaricare lo stesso file
});

function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(String(r.result).split(',')[1]);
    r.onerror=()=>rej(new Error('Lettura file fallita'));
    r.readAsDataURL(file);
  });
}

function setRosterStatus(kind,msg){ $('roster-status').innerHTML=`<div class="roster-msg ${kind}">${msg}</div>`; }
function clearRosterStatus(){ $('roster-status').innerHTML=''; }

// descrizione leggibile di un giorno di roster
const DUTY_LABELS = {
  flight:'Volo', hsby:'Standby casa', ad:'Standby aeroporto', off:'Riposo',
  al:'Ferie', vto:'VTO', sick:'Malattia', ul:'Permesso', pl:'Permesso'
};
function dutyDescription(d){
  if(d.type==='flight' && Array.isArray(d.flights) && d.flights.length){
    return d.flights.map(f=>`${f.from}→${f.to}`).join(' · ');
  }
  return DUTY_LABELS[d.type] || (d.assignment||'Duty');
}
function dutyTimes(d){
  // ritorna {dep, arr} in locale per voli, o hsbyStart/End per standby
  if(d.type==='flight' && d.flights?.length){
    const primo=d.flights[0], ultimo=d.flights[d.flights.length-1];
    return {
      start: primo?.dep ? utcToLocalHHMM(primo.dep, d.date) : null,
      end: ultimo?.arr ? utcToLocalHHMM(ultimo.arr, d.date) : null,
    };
  }
  if(d.hsbyStart || d.hsbyEnd){
    return {
      start: d.hsbyStart ? utcToLocalHHMM(d.hsbyStart, d.date) : null,
      end: d.hsbyEnd ? utcToLocalHHMM(d.hsbyEnd, d.date) : null,
    };
  }
  return { start:null, end:null };
}

function renderRosterPreview(){
  const wrap=$('roster-preview');
  let html=`<div class="sec-row"><h2>Trovati: ${rosterDays.length} giorni</h2></div><div class="card" style="padding:6px 16px;">`;
  rosterDays.forEach(d=>{
    const dLabel = new Date(d.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
    const desc = dutyDescription(d);
    const t = dutyTimes(d);
    const orario = t.start ? (t.end ? `${t.start}–${t.end}` : t.start) : '';
    const extra = d.type==='flight' && d.flights?.length ? `${d.flights.length} tratte${orario?' · '+orario:''}` : orario;
    html+=`<div class="rday"><span class="rd">${dLabel}</span>
      <div><div class="rt">${desc}<span class="rbadge">${d.assignment||d.type||''}</span></div>
      ${extra?`<div class="rm">${extra}</div>`:''}</div></div>`;
  });
  html+=`</div>
    <button class="btn-primary" id="roster-confirm">Aggiungi ${rosterDays.length} giorni al calendario</button>
    <button class="btn-ghost" id="roster-cancel" style="margin-top:8px;">Annulla</button>`;
  wrap.innerHTML=html;

  $('roster-confirm').addEventListener('click', saveRoster);
  $('roster-cancel').addEventListener('click', ()=>{ rosterDays=null; wrap.innerHTML=''; clearRosterStatus(); });
}

async function saveRoster(){
  if(!rosterDays || !rosterDays.length) return;
  const btn=$('roster-confirm'); btn.disabled=true; btn.textContent='Salvataggio…';

  const rows = rosterDays.map(d=>{
    const desc = dutyDescription(d);
    const t = dutyTimes(d);
    const allDay = !t.start;  // se non c'è orario, evento tutto il giorno (es. ferie)
    return {
      household_id: state.household.id,
      member_id: state.me ? state.me.id : null,
      title: desc,
      category: 'lavoro',
      start_at: allDay ? `${d.date}T00:00:00` : `${d.date}T${t.start}:00`,
      end_at: (!allDay && t.end) ? `${d.date}T${t.end}:00` : null,
      all_day: allDay,
      location: d.type==='flight' ? 'PSR' : null,
      note: `Roster · ${DUTY_LABELS[d.type]||d.type||''}${d.assignment?' · '+d.assignment:''}`,
      source: 'roster',
      created_by: state.me ? state.me.id : null,
    };
  });

  // evita doppioni: cancella eventi roster già presenti nelle stesse date
  const dates = rosterDays.map(d=>d.date);
  for(const dt of dates){
    await sb.from('events').delete()
      .eq('household_id', state.household.id)
      .eq('member_id', state.me?state.me.id:null)
      .eq('source','roster')
      .gte('start_at', dt+'T00:00:00').lt('start_at', dt+'T23:59:59');
  }

  const { error } = await sb.from('events').insert(rows);
  btn.disabled=false; btn.textContent='Aggiungi al calendario';
  if(error){ setRosterStatus('err','Errore nel salvataggio: '+error.message); return; }

  rosterDays=null;
  $('roster-preview').innerHTML='';
  setRosterStatus('ok', `${rows.length} voli aggiunti al calendario.`);
  // ricarica la settimana corrente
  await applyCalView();
}

// ============================================================
// SCUOLA — attività ricorrenti + vacanze/feste
// ============================================================
const WD_SHORT = [[1,'Lun'],[2,'Mar'],[3,'Mer'],[4,'Gio'],[5,'Ven'],[6,'Sab'],[7,'Dom']];
let schMemberId = null;

function openScuola(){
  // popola select membri (bambini prima, ma tutti selezionabili)
  const sel=$('sch-member');
  sel.innerHTML = state.members.map(m=>`<option value="${m.id}">${m.display_name}</option>`).join('');
  if(!schMemberId) schMemberId = (state.members.find(m=>['materna','nido','elementari','medie'].includes(m.occupation))||state.members[0])?.id;
  if(schMemberId) sel.value = schMemberId;
  sel.onchange = ()=>{ schMemberId = sel.value; loadScuola(); };
  loadScuola();
}

async function loadScuola(){
  if(!schMemberId) return;
  const [{ data: scheds }, { data: excs }] = await Promise.all([
    sb.from('member_schedules').select('*').eq('member_id', schMemberId).order('weekday'),
    sb.from('schedule_exceptions').select('*').eq('member_id', schMemberId).order('start_date'),
  ]);
  renderSchList(scheds||[]);
  renderExcList(excs||[]);
}

function renderSchList(list){
  const wrap=$('sch-list'); wrap.innerHTML='';
  if(list.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna attività. Tocca + per aggiungere scuola, nuoto, ecc.</div>'; return; }
  // raggruppa per label
  const byLabel={};
  list.forEach(s=>{ (byLabel[s.label||'Attività'] ||= []).push(s); });
  Object.entries(byLabel).forEach(([label, items])=>{
    const giorni = items.map(i=>WD_SHORT.find(([w])=>w===i.weekday)?.[1]).filter(Boolean).join(', ');
    const orario = items[0].start_time ? `${(items[0].start_time||'').slice(0,5)}–${(items[0].end_time||'').slice(0,5)}` : '';
    const icon = /scuola/i.test(label)?'🏫':/nuoto/i.test(label)?'🏊':/ginnast/i.test(label)?'🤸':/calcio/i.test(label)?'⚽':/danza|ballo/i.test(label)?'🩰':/musica/i.test(label)?'🎵':'📌';
    const row=document.createElement('div'); row.className='schrow';
    row.innerHTML=`<div class="si">${icon}</div>
      <div class="grow"><div class="sn">${label}</div><div class="sm">${giorni}${orario?' · '+orario:''}</div></div>
      <button class="del">×</button>`;
    row.querySelector('.del').onclick=async (e)=>{
      e.stopPropagation();
      if(!confirm(`Eliminare "${label}"?`)) return;
      for(const it of items){ await sb.from('member_schedules').delete().eq('id', it.id); }
      loadScuola();
    };
    row.onclick=()=>openActModal(label, items);
    wrap.appendChild(row);
  });
}

function renderExcList(list){
  const wrap=$('sch-exc-list'); wrap.innerHTML='';
  if(list.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna vacanza o festa.</div>'; return; }
  const kindLabel={vacanza:'Vacanza',festa:'Festa',assenza:'Assenza'};
  list.forEach(x=>{
    const d1=new Date(x.start_date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
    const d2=new Date(x.end_date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
    const range = x.start_date===x.end_date ? d1 : `${d1} → ${d2}`;
    const row=document.createElement('div'); row.className='schrow';
    row.innerHTML=`<div class="si" style="background:color-mix(in srgb,var(--accent) 16%,transparent)">${x.kind==='festa'?'🎉':x.kind==='assenza'?'🚫':'🏖'}</div>
      <div class="grow"><div class="sn">${x.note||kindLabel[x.kind]}</div><div class="sm">${range}</div></div>
      <button class="del">×</button>`;
    row.querySelector('.del').onclick=async (e)=>{
      e.stopPropagation();
      await sb.from('schedule_exceptions').delete().eq('id', x.id);
      loadScuola();
    };
    row.onclick=()=>openExcModal(x);
    wrap.appendChild(row);
  });
}

// ---- modal attività ----
let editingActLabel = null;
function openActModal(label, items){
  editingActLabel = label || null;
  $('act-modal-title').textContent = label ? 'Modifica attività' : 'Nuova attività';
  $('act-label').value = label || '';
  // giorni
  const dwrap=$('act-days'); dwrap.innerHTML='';
  const activeDays = new Set((items||[]).map(i=>i.weekday));
  WD_SHORT.forEach(([w,lbl])=>{
    const b=document.createElement('div'); b.className='dp'+(activeDays.has(w)?' on':''); b.textContent=lbl; b.dataset.wd=w;
    b.onclick=()=>b.classList.toggle('on');
    dwrap.appendChild(b);
  });
  $('act-start').value = items?.[0]?.start_time ? (items[0].start_time||'').slice(0,5) : '';
  $('act-end').value = items?.[0]?.end_time ? (items[0].end_time||'').slice(0,5) : '';
  $('act-delete').style.display = label ? 'block' : 'none';
  clearError('act-error');
  $('act-modal').classList.remove('hidden');
}
$('act-cancel').addEventListener('click', ()=>$('act-modal').classList.add('hidden'));
$('act-modal').addEventListener('click', e=>{ if(e.target.id==='act-modal') $('act-modal').classList.add('hidden'); });
$('sch-add-act').addEventListener('click', ()=>openActModal(null,null));

$('act-save').addEventListener('click', async ()=>{
  clearError('act-error');
  const label=$('act-label').value.trim();
  if(!label){ showError('act-error','Inserisci un nome.'); return; }
  const days=[...document.querySelectorAll('#act-days .dp.on')].map(b=>parseInt(b.dataset.wd));
  if(days.length===0){ showError('act-error','Scegli almeno un giorno.'); return; }
  const st=$('act-start').value||null, en=$('act-end').value||null;

  // se sto modificando, rimuovo le righe vecchie di quel label
  if(editingActLabel){
    const { data: old } = await sb.from('member_schedules').select('id').eq('member_id',schMemberId).eq('label',editingActLabel);
    for(const o of (old||[])){ await sb.from('member_schedules').delete().eq('id',o.id); }
  }
  const rows = days.map(wd=>({ member_id:schMemberId, weekday:wd, start_time:st, end_time:en, label, active:true }));
  const { error } = await sb.from('member_schedules').insert(rows);
  if(error){ showError('act-error','Errore: '+error.message); return; }
  $('act-modal').classList.add('hidden'); loadScuola();
});
$('act-delete').addEventListener('click', async ()=>{
  if(!editingActLabel) return;
  const { data: old } = await sb.from('member_schedules').select('id').eq('member_id',schMemberId).eq('label',editingActLabel);
  for(const o of (old||[])){ await sb.from('member_schedules').delete().eq('id',o.id); }
  $('act-modal').classList.add('hidden'); loadScuola();
});

// ---- modal vacanza/festa ----
let editingExc=null;
function openExcModal(x){
  editingExc = x ? x.id : null;
  $('exc-kind').value = x?.kind || 'vacanza';
  $('exc-note').value = x?.note || '';
  $('exc-start').value = x?.start_date || '';
  $('exc-end').value = x?.end_date || '';
  $('exc-delete').style.display = x ? 'block' : 'none';
  clearError('exc-error');
  $('exc-modal').classList.remove('hidden');
}
$('exc-cancel').addEventListener('click', ()=>$('exc-modal').classList.add('hidden'));
$('exc-modal').addEventListener('click', e=>{ if(e.target.id==='exc-modal') $('exc-modal').classList.add('hidden'); });
$('sch-add-exc').addEventListener('click', ()=>openExcModal(null));

$('exc-save').addEventListener('click', async ()=>{
  clearError('exc-error');
  const start=$('exc-start').value, end=$('exc-end').value||$('exc-start').value;
  if(!start){ showError('exc-error','Scegli almeno la data di inizio.'); return; }
  const payload={ member_id:schMemberId, kind:$('exc-kind').value, start_date:start, end_date:end, note:$('exc-note').value.trim()||null };
  let error;
  if(editingExc){ ({error}=await sb.from('schedule_exceptions').update(payload).eq('id',editingExc)); }
  else { ({error}=await sb.from('schedule_exceptions').insert(payload)); }
  if(error){ showError('exc-error','Errore: '+error.message); return; }
  $('exc-modal').classList.add('hidden'); loadScuola();
});
$('exc-delete').addEventListener('click', async ()=>{
  if(editingExc){ await sb.from('schedule_exceptions').delete().eq('id',editingExc); }
  $('exc-modal').classList.add('hidden'); loadScuola();
});
