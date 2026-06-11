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
