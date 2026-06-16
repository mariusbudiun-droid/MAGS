// ============================================================
// MAGS — Logica applicazione
// Schermate: loading -> login -> (setup primo avvio) -> home
// ============================================================

// blocca il pinch-zoom e il doppio-tap-zoom su iOS Safari
document.addEventListener('gesturestart', e=>e.preventDefault());
document.addEventListener('gesturechange', e=>e.preventDefault());
document.addEventListener('gestureend', e=>e.preventDefault());
let _lastTouch=0;
document.addEventListener('touchend', e=>{
  const now=Date.now();
  if(now-_lastTouch<=300){ e.preventDefault(); }
  _lastTouch=now;
}, {passive:false});

// Client Supabase puntato allo schema dedicato mags_app
const sb = supabase.createClient(
  MAGS_CONFIG.SUPABASE_URL,
  MAGS_CONFIG.SUPABASE_ANON_KEY,
  { db: { schema: MAGS_CONFIG.DB_SCHEMA } }
);

// Stato runtime
const state = {
  user: null,        // utente Supabase loggato
  household: null,   // famiglia
  members: [],       // profili membri
  me: null,          // il mio profilo (member collegato al mio account)
  cal: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),   // 0-11
    weekStart: null,                // lunedì della settimana visibile 'YYYY-MM-DD'
    view: 'mese',                   // 'mese' | 'settimana' | 'giorno'
    selDate: null,                  // 'YYYY-MM-DD'
    filterMember: 'all',            // 'all' o member.id
    events: [],                     // eventi caricati
  },
};

const CAT_COLORS = { lavoro:'var(--accent)', scuola:'#ffaa3c', appuntamento:'#9d7bff', salute:'#22b8a6', famiglia:'#7a85a8', viaggio:'#f5915c' };
const CAT_LABELS = { lavoro:'Lavoro', scuola:'Scuola', appuntamento:'Appuntamento', salute:'Salute', famiglia:'Famiglia', viaggio:'Viaggio' };

// ordina i membri secondo le lettere di MAGS (Marius, Alice, Giada, Samuel),
// gli altri in coda in ordine alfabetico
const MAGS_ORDER = ['m','a','g','s'];
function magsSort(arr){
  return [...(arr||[])].sort((x,y)=>{
    const ix=MAGS_ORDER.indexOf((x.display_name||'?').charAt(0).toLowerCase());
    const iy=MAGS_ORDER.indexOf((y.display_name||'?').charAt(0).toLowerCase());
    const ax=ix<0?99:ix, ay=iy<0?99:iy;
    if(ax!==ay) return ax-ay;
    return (x.display_name||'').localeCompare(y.display_name||'');
  });
}

// Helper DOM
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');
function onlyShow(id){
  ['loading','login','setup','home'].forEach(s => $(s).classList.add('hidden'));
  show(id);
}
function showError(id, msg){ const e=$(id); e.textContent=msg; e.classList.remove('hidden'); }
function clearError(id){ $(id).classList.add('hidden'); }

// ============================================================
// TEMA: applica famiglia + luminosità del membro corrente
// ============================================================
const sysMq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(fam, lum){
  document.body.dataset.fam = fam || 'aurora';
  const realLum = (lum === 'system' || !lum) ? (sysMq.matches ? 'dark' : 'light') : lum;
  document.body.dataset.lum = realLum;
  // theme-color della barra di sistema
  const tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', realLum==='dark' ? '#0f1424' : '#5b6cff');
}
// se sono in "sistema", reagisci al cambio del telefono
sysMq.addEventListener('change', ()=>{
  if(state.me && state.me.theme_lum === 'system') applyTheme(state.me.theme_family,'system');
});
function applyMyTheme(){
  if(state.me) applyTheme(state.me.theme_family, state.me.theme_lum);
}

// ============================================================
// AVVIO: controlla se c'è già una sessione
// ============================================================
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    state.user = session.user;
    await afterLogin();
  } else {
    onlyShow('login');
  }
}

// ============================================================
// LOGIN
// ============================================================
$('btn-login').addEventListener('click', doLogin);
$('password').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

async function doLogin(){
  clearError('login-error');
  const email = $('email').value.trim();
  const password = $('password').value;
  if(!email || !password){ showError('login-error','Inserisci email e password.'); return; }

  const btn = $('btn-login'); btn.disabled = true; btn.textContent = 'Accesso…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Accedi';

  if(error){
    showError('login-error', traduciErrore(error.message));
    return;
  }
  state.user = data.user;
  await afterLogin();
}

function traduciErrore(msg){
  if(/invalid login credentials/i.test(msg)) return 'Email o password non corretti.';
  if(/email not confirmed/i.test(msg)) return 'Email non confermata. Controlla le impostazioni del progetto.';
  return 'Accesso non riuscito. Riprova.';
}

// ============================================================
// DOPO LOGIN: c'è già una famiglia per questo utente?
// ============================================================
async function afterLogin(){
  onlyShow('loading');

  // Sono già collegato a una famiglia? (household_members)
  const { data: hm, error } = await sb
    .from('household_members')
    .select('household_id, member_id, role')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if(error){ console.error(error); }

  if(hm){
    // Carico famiglia + membri
    await loadHousehold(hm.household_id, hm.member_id);
    renderHome();
    onlyShow('home');
  } else {
    // Nessun aggancio per questo utente.
    // La famiglia esiste già (con membri validi)?
    const { data: anyHh } = await sb.from('households').select('id, name').limit(1);
    let joinable = false;
    if(anyHh && anyHh.length){
      const { data: adults } = await sb
        .from('members').select('id')
        .eq('household_id', anyHh[0].id)
        .eq('member_type','adulto');
      joinable = !!(adults && adults.length);
    }
    if(joinable){
      await prepareJoin(anyHh[0]);
    } else {
      // Nessuna famiglia, o famiglia incompleta (senza membri): setup pulito.
      prepareSetup();
    }
  }
}

async function loadHousehold(householdId, myMemberId){
  const { data: hh } = await sb.from('households').select('*').eq('id', householdId).single();
  const { data: ms } = await sb.from('members').select('*').eq('household_id', householdId).order('created_at');
  state.household = hh;
  state.members = magsSort(ms || []);
  state.me = state.members.find(m => m.id === myMemberId) || null;
}

// ============================================================
// SETUP PRIMO AVVIO (nessuna famiglia esiste ancora)
// ============================================================
const defaultMembers = [
  { name:'Marius', type:'adulto',  occ:'cabin_crew' },
  { name:'Giada',  type:'adulto',  occ:'lavoro' },
  { name:'Alice',  type:'bambino', occ:'materna' },
  { name:'Samuel', type:'neonato', occ:'nessuna', expected:true },
];

function prepareSetup(){
  renderSetupRows(defaultMembers);
  refreshIamSelect();
  onlyShow('setup');
}

function renderSetupRows(list){
  const wrap = $('su-members'); wrap.innerHTML = '';
  list.forEach((m,i)=>{
    const color = MAGS_CONFIG.MEMBER_COLORS[i % MAGS_CONFIG.MEMBER_COLORS.length];
    const row = document.createElement('div');
    row.className = 'su-row';
    row.innerHTML = `
      <input type="color" class="su-dot" value="${color}">
      <input type="text" class="field su-name" value="${m.name||''}" placeholder="Nome">
      <select class="field su-type">
        <option value="adulto"${m.type==='adulto'?' selected':''}>Adulto</option>
        <option value="bambino"${m.type==='bambino'?' selected':''}>Bambino</option>
        <option value="neonato"${m.type==='neonato'?' selected':''}>Neonato</option>
      </select>
      <button class="su-del" title="Rimuovi">×</button>`;
    row.querySelector('.su-del').addEventListener('click', ()=>{ row.remove(); refreshIamSelect(); });
    row.querySelector('.su-name').addEventListener('input', refreshIamSelect);
    wrap.appendChild(row);
  });
}

$('su-add').addEventListener('click', ()=>{
  const wrap = $('su-members');
  const i = wrap.children.length;
  const color = MAGS_CONFIG.MEMBER_COLORS[i % MAGS_CONFIG.MEMBER_COLORS.length];
  const row = document.createElement('div');
  row.className='su-row';
  row.innerHTML = `
    <input type="color" class="su-dot" value="${color}">
    <input type="text" class="field su-name" value="" placeholder="Nome">
    <select class="field su-type">
      <option value="adulto">Adulto</option>
      <option value="bambino">Bambino</option>
      <option value="neonato">Neonato</option>
    </select>
    <button class="su-del" title="Rimuovi">×</button>`;
  row.querySelector('.su-del').addEventListener('click', ()=>{ row.remove(); refreshIamSelect(); });
  row.querySelector('.su-name').addEventListener('input', refreshIamSelect);
  wrap.appendChild(row);
  refreshIamSelect();
});

// "Chi sei tu?" elenca i nomi adulti inseriti
function refreshIamSelect(){
  const names = [...document.querySelectorAll('#su-members .su-row')].map(r=>({
    name: r.querySelector('.su-name').value.trim(),
    type: r.querySelector('.su-type').value
  })).filter(x=>x.name);
  const sel = $('su-iam');
  const prev = sel.value;
  sel.innerHTML = names.map(n=>`<option value="${n.name}">${n.name}</option>`).join('');
  if([...sel.options].some(o=>o.value===prev)) sel.value = prev;
}

$('btn-setup').addEventListener('click', doSetup);

async function doSetup(){
  clearError('setup-error');
  const hhName = $('su-household').value.trim() || 'Famiglia MAGS';
  const rows = [...document.querySelectorAll('#su-members .su-row')];
  const membersInput = rows.map(r=>({
    name: r.querySelector('.su-name').value.trim(),
    color: r.querySelector('.su-dot').value,
    type: r.querySelector('.su-type').value,
  })).filter(m=>m.name);

  if(membersInput.length===0){ showError('setup-error','Aggiungi almeno un membro.'); return; }
  const iam = $('su-iam').value;
  if(!iam){ showError('setup-error','Indica chi sei tu.'); return; }

  const btn=$('btn-setup'); btn.disabled=true; btn.textContent='Creazione…';

  try{
    // 1. famiglia: riusa quella esistente (se c'è) o creane una.
    //    Evita doppioni se un tentativo precedente si è interrotto.
    let hh;
    const { data: existing } = await sb.from('households').select('*').limit(1);
    if(existing && existing.length){
      hh = existing[0];
      await sb.from('households').update({ name: hhName }).eq('id', hh.id);
    } else {
      const { data: created, error: e1 } = await sb.from('households').insert({ name: hhName }).select().single();
      if(e1) throw e1;
      hh = created;
    }

    // 2. crea i membri (solo se non ce ne sono già)
    let createdMembers;
    const { data: existingMembers } = await sb.from('members').select('*').eq('household_id', hh.id);
    if(existingMembers && existingMembers.length){
      createdMembers = existingMembers;
    } else {
      const toInsert = membersInput.map(m=>({
        household_id: hh.id,
        display_name: m.name,
        member_type: m.type,
        color: m.color,
        is_expected: m.type==='neonato',
        occupation: m.type==='neonato' ? 'nessuna' : (m.type==='bambino' ? 'materna' : 'lavoro'),
      }));
      const { data: ins, error: e2 } = await sb.from('members').insert(toInsert).select();
      if(e2) throw e2;
      createdMembers = ins;
    }

    // 3. aggancia il mio account al profilo scelto, come admin
    const myProfile = createdMembers.find(c=>c.display_name===iam) || createdMembers[0];
    const { error: e3 } = await sb.from('household_members').insert({
      household_id: hh.id,
      member_id: myProfile.id,
      user_id: state.user.id,
      role: 'admin',
    });
    if(e3) throw e3;

    // 4. carica e vai alla home
    await loadHousehold(hh.id, myProfile.id);
    renderHome();
    onlyShow('home');
  }catch(err){
    console.error(err);
    showError('setup-error', 'Creazione non riuscita: ' + (err.message||'errore'));
    btn.disabled=false; btn.textContent='Crea la famiglia';
  }
}

// ============================================================
// JOIN: la famiglia esiste, io (secondo genitore) mi aggancio
// ============================================================
async function prepareJoin(hh){
  // Carico i membri esistenti e mostro il setup in modalità "scegli chi sei"
  const { data: ms } = await sb.from('members').select('*').eq('household_id', hh.id).order('created_at');
  // Riuso la schermata setup ma bloccata sui membri esistenti
  $('su-household').value = hh.name;
  $('su-household').disabled = true;
  $('su-add').style.display = 'none';
  const wrap = $('su-members'); wrap.innerHTML='';
  (ms||[]).forEach(m=>{
    const row=document.createElement('div'); row.className='su-row';
    row.innerHTML = `<span class="su-dot" style="background:${m.color}"></span>
      <span class="field" style="flex:1;background:transparent;border:none;">${m.display_name}</span>`;
    wrap.appendChild(row);
  });
  document.querySelector('#setup .auth-title').textContent = 'Unisciti alla famiglia';
  document.querySelector('#setup .auth-sub').textContent = 'La famiglia esiste già. Indica chi sei tu per entrare.';
  const sel=$('su-iam');
  sel.innerHTML = (ms||[]).filter(m=>m.member_type==='adulto').map(m=>`<option value="${m.id}">${m.display_name}</option>`).join('');
  $('btn-setup').textContent = 'Entra';
  // sostituisco l'handler
  $('btn-setup').replaceWith($('btn-setup').cloneNode(true));
  $('btn-setup').addEventListener('click', async ()=>{
    const memberId = $('su-iam').value;
    const btn=$('btn-setup'); btn.disabled=true; btn.textContent='Accesso…';
    const { error } = await sb.from('household_members').insert({
      household_id: hh.id, member_id: memberId, user_id: state.user.id, role:'admin'
    });
    if(error){ showError('setup-error','Errore: '+error.message); btn.disabled=false; btn.textContent='Entra'; return; }
    await loadHousehold(hh.id, memberId);
    renderHome(); onlyShow('home');
  });
  onlyShow('setup');
}

// ============================================================
// HOME + navigazione
// ============================================================
function renderHome(){
  applyMyTheme();

  const oggi = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  $('home-date').textContent = oggi.charAt(0).toUpperCase()+oggi.slice(1);
  $('home-name').textContent = state.me ? state.me.display_name : 'famiglia';

  renderHomeMembersOnly();
  renderFamiglia();
  initThemePicker();
  loadHomeExtras();
  loadTodayStates();  // statepill veri (volo/scuola di oggi)
}

// dati di oggi per gli statepill: eventi lavoro + orari attivi - vacanze
const todayState = { flightMembers:new Set(), dutyLabels:new Map(), schoolMembers:new Set(), activityMembers:new Map(), loaded:false };
async function loadTodayStates(){
  const today = todayYmd();
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const weekday = (()=>{ let d=new Date(today+'T12:00:00').getDay(); return d===0?7:d; })();

  // chi è in turno ADESSO + che tipo di turno (per la statepill)
  const { data: evs } = await sb.from('events').select('member_id,category,start_at,end_at,duty_type,title')
    .eq('household_id', state.household.id).eq('category','lavoro')
    .gte('start_at', today+'T00:00:00').lt('start_at', today+'T23:59:59');
  todayState.flightMembers = new Set();
  todayState.dutyLabels = new Map();
  (evs||[]).forEach(e=>{
    if(!e.member_id) return;
    const s = e.start_at ? toMin(e.start_at.slice(11,16)) : null;
    const en = e.end_at ? toMin(e.end_at.slice(11,16)) : (s!=null ? s+120 : null);
    if(s==null) return;
    if(nowMin>=s && nowMin<=en){
      todayState.flightMembers.add(e.member_id);
      todayState.dutyLabels.set(e.member_id, dutyShort(e.duty_type, e.title));
    }
  });

  // orari di oggi (scuola/attività) attivi ADESSO, escludendo chi è in vacanza
  const memberIds = state.members.map(m=>m.id);
  const { data: scheds } = await sb.from('member_schedules').select('member_id,weekday,label,active,start_time,end_time')
    .in('member_id', memberIds).eq('weekday', weekday).eq('active', true);
  const { data: excs } = await sb.from('schedule_exceptions').select('member_id,start_date,end_date')
    .in('member_id', memberIds).lte('start_date', today).gte('end_date', today);
  const inVacanza = new Set((excs||[]).map(e=>e.member_id));

  todayState.schoolMembers = new Set();
  todayState.activityMembers = new Map();
  (scheds||[]).forEach(s=>{
    if(inVacanza.has(s.member_id)) return;
    // se ha orario, controlla la fascia; se non ha orario, considera "tutto il giorno"
    const st = s.start_time ? toMin(s.start_time.slice(0,5)) : 0;
    const en = s.end_time ? toMin(s.end_time.slice(0,5)) : 1440;
    if(nowMin < st || nowMin > en) return; // fuori orario → non attivo ora
    if(/scuola/i.test(s.label||'')){
      todayState.schoolMembers.add(s.member_id);
    } else {
      todayState.activityMembers.set(s.member_id, (s.label||'Attività').toUpperCase());
    }
  });

  todayState.loaded = true;
  renderHomeMembersOnly();
}

function toMin(hhmm){ if(!hhmm) return 0; const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0); }

// etichetta breve del turno per la statepill
function dutyShort(duty, title){
  const t=(title||'').toUpperCase();
  // riconosci sigle comuni dal titolo del turno
  if(/HSBY|HOME STANDBY|HSTBY/.test(t)) return 'HSBY';
  if(/\bAD\b|AIRPORT DUTY|ASBY|ASTBY/.test(t)) return 'AD';
  if(/SBY|STANDBY/.test(t)) return 'STANDBY';
  switch(duty){
    case 'standby': case 'standby_early': case 'standby_late': return 'STANDBY';
    case 'ferie': return 'FERIE';
    case 'off': return 'RIPOSO';
    case 'early': case 'late': default: return 'IN VOLO';
  }
}

// statepill: usa i dati reali di ADESSO se disponibili, altrimenti CASA
function memberState(m){
  if(m.is_expected) return { t:'ATTESA', c:'#22b8a6' };
  if(todayState.loaded){
    if(todayState.flightMembers.has(m.id)){
      const lbl = todayState.dutyLabels ? (todayState.dutyLabels.get(m.id)||'IN VOLO') : 'IN VOLO';
      const col = lbl==='IN VOLO' ? '#5b6cff' : (lbl==='RIPOSO'?'#78d296':(lbl==='FERIE'?'#22b8a6':'#ffaa3c'));
      return { t:lbl, c:col };
    }
    if(todayState.schoolMembers.has(m.id)) return { t:'SCUOLA', c:'#ffaa3c' };
    if(todayState.activityMembers.has(m.id)) return { t:todayState.activityMembers.get(m.id), c:'#9d7bff' };
    return { t:'CASA', c:'#7a85a8' };
  }
  switch(m.occupation){
    case 'cabin_crew': return { t:'CASA', c:'#5b6cff' };
    case 'lavoro': return { t:'CASA', c:'#9d7bff' };
    default: return { t:'CASA', c:'#7a85a8' };
  }
}

function renderHomeMembersOnly(){
  const wrap = $('home-members'); if(!wrap) return; wrap.innerHTML='';
  wrap.className='members-grid';
  state.members.forEach(m=>{
    const initial = (m.display_name||'?').charAt(0).toUpperCase();
    const st = memberState(m);
    // sottotitolo: occupazione + età; per chi è in arrivo, countdown/settimana parto
    let sub;
    if(m.is_expected){
      const gw = gravidanzaLabel(m);
      sub = gw || 'in arrivo';
    } else {
      const occ = etichettaOcc(m.occupation);
      const eta = homeBirth[m.id] ? etaLabel(homeBirth[m.id]) : '';
      sub = [occ, eta].filter(Boolean).join(' · ');
    }
    const cell=document.createElement('div');
    cell.className='mcell'+(m.is_expected?' locked':'');
    cell.innerHTML = `<span class="av" style="background:${m.color}">${initial}</span>
      <div class="mcell-txt"><div class="mn">${m.display_name}</div><div class="ms">${sub}</div></div>
      <span class="statepill" style="background:color-mix(in srgb,${st.c} 20%,transparent);color:${st.c}">${st.t}</span>`;
    wrap.appendChild(cell);
  });
}

// etichetta settimana gravidanza per il membro in arrivo (es. "31+3")
const homeDueDates = {}; // memberId -> due_date (caricata in loadHomeExtras)
const homeBirth = {};    // memberId -> birth_date
function etaLabel(birth){
  const b=new Date(birth+'T12:00:00'), n=new Date();
  let e=n.getFullYear()-b.getFullYear();
  const mm=n.getMonth()-b.getMonth();
  if(mm<0 || (mm===0 && n.getDate()<b.getDate())) e--;
  if(e<0) return '';
  if(e===0){ // meno di un anno: mostra i mesi
    let mesi=(n.getFullYear()-b.getFullYear())*12 + (n.getMonth()-b.getMonth());
    if(n.getDate()<b.getDate()) mesi--;
    return `${Math.max(0,mesi)} mesi`;
  }
  return `${e} anni`;
}
function gravidanzaLabel(m){
  const due = homeDueDates[m.id];
  if(!due) return null;
  const oggi=new Date(); const parto=new Date(due+'T12:00:00');
  const giorniMancanti=Math.round((parto-oggi)/86400000);
  const giorniGravidanza=280-giorniMancanti;
  if(giorniGravidanza<0) return 'in arrivo';
  const sett=Math.floor(giorniGravidanza/7);
  const gg=giorniGravidanza%7;
  const mancano = giorniMancanti>0 ? ` · -${giorniMancanti}gg` : '';
  return `${sett}+${gg} sett.${mancano}`;
}

// blocchi "Prossimi impegni" + "Questo mese"
async function loadHomeExtras(){
  // date nascita + parto per i sottotitoli membri
  const { data: hr } = await sb.from('health_records').select('member_id,due_date,birth_date')
    .in('member_id', state.members.map(m=>m.id));
  (hr||[]).forEach(r=>{
    if(r.due_date) homeDueDates[r.member_id]=r.due_date;
    if(r.birth_date) homeBirth[r.member_id]=r.birth_date;
  });
  renderHomeMembersOnly();
  // prossimi eventi: include anche i multi-giorno ancora in corso (iniziati prima, non finiti)
  const today = new Date().toISOString().slice(0,10);
  const wide = (()=>{ const d=new Date(); d.setDate(d.getDate()-60); return d.toISOString().slice(0,10); })();
  const { data: evsRaw } = await sb.from('events')
    .select('*').eq('household_id', state.household.id)
    .gte('start_at', wide+'T00:00:00').order('start_at');
  // tieni quelli che non sono ancora finiti (oggi <= fine), poi i primi 3
  const evs = (evsRaw||[]).filter(e=>{
    const d1=(e.end_at||'').slice(0,10) || (e.start_at||'').slice(0,10);
    return d1>=today;
  }).slice(0,3);
  const aw=$('home-agenda');
  if(aw){
    aw.innerHTML='';
    if(!evs || evs.length===0){ aw.innerHTML='<div class="ev-empty">Nessun impegno in programma.</div>'; }
    else evs.forEach(e=>{
      const t = e.all_day ? 'all-day' : (e.start_at||'').slice(11,16);
      // nome partecipanti: lista se gruppo, singolo altrimenti
      const mids = (Array.isArray(e.member_ids)&&e.member_ids.length) ? e.member_ids : (e.member_id?[e.member_id]:[]);
      let memName='';
      if(mids.length>=2){
        const allIds=state.members.map(m=>m.id);
        const isAll = allIds.length && allIds.every(id=>mids.includes(id));
        memName = isAll ? 'Tutta la famiglia' : mids.map(id=>{const m=state.members.find(x=>x.id===id);return m?m.display_name:'';}).filter(Boolean).join(', ');
      } else if(mids.length===1){
        const m=state.members.find(x=>x.id===mids[0]); memName=m?m.display_name:'';
      }
      const col = CAT_COLORS[e.category]||'var(--ink-soft)';
      const row=document.createElement('div'); row.className='ev';
      row.innerHTML=`<span class="time">${t}</span><span class="dot" style="background:${col}"></span>
        <div><div class="ti">${e.title}</div><div class="meta">${[memName,e.location].filter(Boolean).join(' · ')}</div></div>`;
      aw.appendChild(row);
    });
  }

  // questo mese: speso vs budget totale
  const ym = new Date().toISOString().slice(0,7);
  const [{ data: tx }, { data: buds }] = await Promise.all([
    sb.from('transactions').select('amount,kind,tx_date').eq('household_id', state.household.id).gte('tx_date', ym+'-01'),
    sb.from('budgets').select('monthly_limit').eq('household_id', state.household.id),
  ]);
  const speso = (tx||[]).filter(t=>t.kind==='uscita').reduce((s,t)=>s+(+t.amount||0),0);
  const budget = (buds||[]).reduce((s,b)=>s+(+b.monthly_limit||0),0);
  const pct = budget>0 ? Math.min(100, Math.round(speso/budget*100)) : 0;
  const over = budget>0 && speso>budget;
  const mw=$('home-money');
  if(mw){
    mw.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Speso</div>
          <div style="font-family:var(--mono);font-size:22px;font-weight:800;margin-top:3px;">${eur(speso)}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Budget</div>
          <div style="font-family:var(--mono);font-size:22px;font-weight:800;margin-top:3px;color:${over?'#e23b5a':'#1fb46b'};">${budget>0?eur(budget):'—'}</div></div>
      </div>
      ${budget>0?`<div class="bar" style="margin-top:12px;"><i style="width:${pct}%;background:${over?'#e23b5a':'var(--accent)'};"></i></div>`:''}`;
  }
}

function etichettaOcc(o){
  const map={nessuna:'—',nido:'Nido',materna:'Materna',elementari:'Elementari',medie:'Medie',lavoro:'Lavoro',cabin_crew:'Cabin crew'};
  return map[o]||o;
}

function refreshPatternToggle(){
  const btn=$('toggle-pattern'); if(!btn) return;
  const on = localStorage.getItem('mags_pattern')==='1';
  btn.textContent = 'Proiezione turni: '+(on?'ATTIVA':'spenta');
  btn.style.color = on ? 'var(--accent)' : '';
  const inp=$('pattern-anchor');
  if(inp && state.me) inp.value = localStorage.getItem('mags_anchor_'+state.me.id)||'';
}
// salva la data ancora del membro loggato e ridisegna
document.addEventListener('change', (e)=>{
  if(e.target && e.target.id==='pattern-anchor'){
    if(!state.me) return;
    const key='mags_anchor_'+state.me.id;
    if(e.target.value) localStorage.setItem(key, e.target.value);
    else localStorage.removeItem(key);
    if(typeof openCalendar==='function') openCalendar();
  }
});

// scorciatoie dai blocchi home
document.addEventListener('click', (e)=>{
  if(e.target.id==='home-goto-cal'){ document.querySelector('#tabbar .tab[data-v="cal"]').click(); }
  if(e.target.id==='home-goto-soldi'){ document.querySelector('#tabbar .tab[data-v="soldi"]').click(); }
  if(e.target.id==='home-open-settings'){ $('settings-modal').classList.remove('hidden'); refreshPatternToggle(); }
  if(e.target.id==='settings-close'){ $('settings-modal').classList.add('hidden'); }
  if(e.target.id==='settings-modal'){ $('settings-modal').classList.add('hidden'); }
  if(e.target.id==='toggle-pattern'){
    const on = localStorage.getItem('mags_pattern')==='1';
    localStorage.setItem('mags_pattern', on?'0':'1');
    refreshPatternToggle();
    if(typeof openCalendar==='function') openCalendar();
  }
});

// ---- navigazione tab principali ----
document.querySelectorAll('#tabbar .tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('#tabbar .tab').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    document.querySelectorAll('#home .view').forEach(v=>v.classList.remove('on'));
    $('v-'+t.dataset.v).classList.add('on');
    // FAB visibile solo nel calendario, sottosezione Agenda
    const inAgenda = $('cal-agenda') && $('cal-agenda').classList.contains('on');
    $('fab-event').classList.toggle('hidden', !(t.dataset.v === 'cal' && inAgenda));
    if(t.dataset.v === 'cal') openCalendar();
    if(t.dataset.v === 'casa') openCasa();
    if(t.dataset.v === 'soldi') openSoldi();
    if(t.dataset.v === 'home') renderHome();
    if(t.dataset.v === 'fam') renderFamiglia();
    window.scrollTo({top:0,behavior:'smooth'});
  });
});

// ---- navigazione sottosezioni Casa ----
document.querySelectorAll('#casa-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#casa-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['casa-spesa','casa-menu'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
  });
});

// ============================================================
// ============================================================
// LOGOUT
// ============================================================
$('btn-logout').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

// Via!
// mostra la versione nell'etichetta (sezione tema)
document.addEventListener('DOMContentLoaded', ()=>{
  const vt=$('version-tag'); if(vt) vt.textContent = 'MAGS · v'+MAGS_CONFIG.APP_VERSION; const vf=$('version-foot'); if(vf) vf.textContent='v'+MAGS_CONFIG.APP_VERSION;
});

applyTheme('aurora','system');  // tema neutro finché non carico il profilo
boot();
// imposta subito la versione se il DOM è già pronto
(()=>{ const vt=$('version-tag'); if(vt) vt.textContent = 'MAGS · v'+MAGS_CONFIG.APP_VERSION; const vf=$('version-foot'); if(vf) vf.textContent='v'+MAGS_CONFIG.APP_VERSION; })();
