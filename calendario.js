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
  renderCalFilter();
  await loadWeekEvents();
  renderWeek();
  renderDayAgenda();
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
    p.onclick=()=>{ state.cal.filterMember=id; renderCalFilter(); renderWeek(); renderDayAgenda(); };
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
$('cal-prev').addEventListener('click', async ()=>{
  state.cal.weekStart = addDays(state.cal.weekStart, -7);
  await loadWeekEvents(); renderWeek(); renderDayAgenda();
});
$('cal-next').addEventListener('click', async ()=>{
  state.cal.weekStart = addDays(state.cal.weekStart, 7);
  await loadWeekEvents(); renderWeek(); renderDayAgenda();
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
  await loadWeekEvents(); renderWeek(); renderDayAgenda();
});

$('ev-delete').addEventListener('click', async ()=>{
  if(!editingEventId) return;
  const { error } = await sb.from('events').delete().eq('id', editingEventId);
  if(error){ showError('ev-error','Errore: '+error.message); return; }
  closeEventModal();
  await loadWeekEvents(); renderWeek(); renderDayAgenda();
});

// ============================================================
// ============================================================
// SUBNAV calendario (Agenda / Voli) + IMPORT ROSTER
// ============================================================
document.querySelectorAll('#cal-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#cal-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['cal-agenda','cal-voli'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
    // FAB visibile solo in Agenda
    const fab=$('fab-event'); if(fab) fab.classList.toggle('hidden', s.dataset.s!=='cal-agenda');
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
    rosterDays = (data.days||[]).filter(d=>d.type==='flight' && Array.isArray(d.flights) && d.flights.length);
    if(rosterDays.length===0){
      setRosterStatus('err','Nessun giorno di volo trovato nello screenshot.');
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

function renderRosterPreview(){
  const wrap=$('roster-preview');
  let html=`<div class="sec-row"><h2>Voli trovati: ${rosterDays.length} giorni</h2></div><div class="card" style="padding:6px 16px;">`;
  rosterDays.forEach(d=>{
    const dLabel = new Date(d.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
    const tratte = d.flights.map(f=>`${f.from}→${f.to}`).join(' · ');
    const primo = d.flights[0];
    const orario = primo?.dep ? utcToLocalHHMM(primo.dep, d.date) : '';
    html+=`<div class="rday"><span class="rd">${dLabel}</span>
      <div><div class="rt">${tratte}<span class="rbadge">${d.assignment||'volo'}</span></div>
      <div class="rm">${d.flights.length} tratte${orario?' · primo decollo '+orario:''}</div></div></div>`;
  });
  html+=`</div>
    <button class="btn-primary" id="roster-confirm">Aggiungi ${rosterDays.length} voli al calendario</button>
    <button class="btn-ghost" id="roster-cancel" style="margin-top:8px;">Annulla</button>`;
  wrap.innerHTML=html;

  $('roster-confirm').addEventListener('click', saveRoster);
  $('roster-cancel').addEventListener('click', ()=>{ rosterDays=null; wrap.innerHTML=''; clearRosterStatus(); });
}

async function saveRoster(){
  if(!rosterDays || !rosterDays.length) return;
  const btn=$('roster-confirm'); btn.disabled=true; btn.textContent='Salvataggio…';

  const rows = rosterDays.map(d=>{
    const primo = d.flights[0];
    const ultimo = d.flights[d.flights.length-1];
    const depLocal = primo?.dep ? utcToLocalHHMM(primo.dep, d.date) : null;
    const arrLocal = ultimo?.arr ? utcToLocalHHMM(ultimo.arr, d.date) : null;
    const tratte = d.flights.map(f=>`${f.from}→${f.to}`).join(' ');
    return {
      household_id: state.household.id,
      member_id: state.me ? state.me.id : null,
      title: tratte,
      category: 'lavoro',
      start_at: `${d.date}T${depLocal||'06:00'}:00`,
      end_at: arrLocal ? `${d.date}T${arrLocal}:00` : null,
      all_day: false,
      location: 'PSR',
      note: `Roster · ${d.assignment||''} · ${d.flights.length} tratte`,
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
  await loadWeekEvents(); renderWeek(); renderDayAgenda();
}
