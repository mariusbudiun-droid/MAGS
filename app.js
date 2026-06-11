// ============================================================
// MAGS — Logica applicazione
// Schermate: loading -> login -> (setup primo avvio) -> home
// ============================================================

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
    selDate: null,                  // 'YYYY-MM-DD'
    filterMember: 'all',            // 'all' o member.id
    events: [],                     // eventi del mese caricati
  },
};

const CAT_COLORS = { lavoro:'var(--accent)', scuola:'#ffaa3c', appuntamento:'#9d7bff', salute:'#22b8a6', famiglia:'#7a85a8' };
const CAT_LABELS = { lavoro:'Lavoro', scuola:'Scuola', appuntamento:'Appuntamento', salute:'Salute', famiglia:'Famiglia' };

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
  state.members = ms || [];
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

  const wrap = $('home-members'); wrap.innerHTML='';
  state.members.forEach(m=>{
    const initial = (m.display_name||'?').charAt(0).toUpperCase();
    const occ = m.is_expected ? 'in arrivo' : etichettaOcc(m.occupation);
    const row=document.createElement('div'); row.className='mrow';
    row.innerHTML = `<span class="av" style="background:${m.color}">${initial}</span>
      <div><div class="mn">${m.display_name}</div><div class="ms">${occ}</div></div>`;
    wrap.appendChild(row);
  });

  renderFamiglia();
  initThemePicker();
}

function etichettaOcc(o){
  const map={nessuna:'—',nido:'Nido',materna:'Materna',elementari:'Elementari',medie:'Medie',lavoro:'Lavoro',cabin_crew:'Cabin crew'};
  return map[o]||o;
}

// ---- navigazione tab principali ----
document.querySelectorAll('#tabbar .tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('#tabbar .tab').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    document.querySelectorAll('#home .view').forEach(v=>v.classList.remove('on'));
    $('v-'+t.dataset.v).classList.add('on');
    // FAB visibile solo nel calendario
    $('fab-event').classList.toggle('hidden', t.dataset.v !== 'cal');
    if(t.dataset.v === 'cal') openCalendar();
    window.scrollTo({top:0,behavior:'smooth'});
  });
});
// ---- navigazione sottosezioni Famiglia ----
document.querySelectorAll('#fam-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#fam-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['fam-membri','fam-accessi','fam-tema'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
  });
});

// ============================================================
// SEZIONE FAMIGLIA
// ============================================================
function renderFamiglia(){
  renderMembersList();
  renderAccessi();
}

const OCC_OPTS = [['nessuna','Nessuna'],['nido','Nido'],['materna','Materna'],['elementari','Elementari'],['medie','Medie'],['lavoro','Lavoro'],['cabin_crew','Cabin crew']];
const TYPE_OPTS = [['adulto','Adulto'],['bambino','Bambino'],['neonato','Neonato']];

function renderMembersList(){
  const wrap = $('fam-members-list'); wrap.innerHTML='';
  state.members.forEach(m=>{
    const initial=(m.display_name||'?').charAt(0).toUpperCase();
    const sub = m.is_expected ? 'In arrivo' : `${tipoLabel(m.member_type)} · ${etichettaOcc(m.occupation)}`;
    const row=document.createElement('div'); row.className='medit';
    row.innerHTML = `<span class="av" style="background:${m.color}">${initial}</span>
      <div class="grow"><div class="nm">${m.display_name}</div><div class="ms">${sub}</div></div>
      <button class="edit-ic" title="Modifica">✎</button>`;
    row.querySelector('.edit-ic').addEventListener('click', ()=>openMemberEdit(m, row));
    wrap.appendChild(row);
  });
}

function tipoLabel(t){ return ({adulto:'Adulto',bambino:'Bambino',neonato:'Neonato'})[t]||t; }

function openMemberEdit(m, rowEl){
  const form=document.createElement('div'); form.className='medit-form';
  form.innerHTML = `
    <div style="display:flex;gap:9px;align-items:center;">
      <input type="color" class="su-dot" id="me-color" value="${m.color}">
      <input type="text" class="field" id="me-name" value="${m.display_name}" style="flex:1;margin:0;">
    </div>
    <div class="row2">
      <select class="field" id="me-type">${TYPE_OPTS.map(([v,l])=>`<option value="${v}"${m.member_type===v?' selected':''}>${l}</option>`).join('')}</select>
      <select class="field" id="me-occ">${OCC_OPTS.map(([v,l])=>`<option value="${v}"${m.occupation===v?' selected':''}>${l}</option>`).join('')}</select>
    </div>
    ${m.is_expected ? `<button class="btn-ghost" id="me-born" style="margin-top:10px;">🍼 È nato! · attiva profilo</button>` : ''}
    <button class="btn-primary save" id="me-save">Salva</button>
    <button class="btn-ghost" id="me-cancel" style="margin-top:8px;">Annulla</button>
    <p class="auth-error hidden" id="me-error"></p>`;
  rowEl.replaceWith(form);

  $('me-cancel').addEventListener('click', renderMembersList);
  if($('me-born')){
    $('me-born').addEventListener('click', async ()=>{
      const today = new Date().toISOString().slice(0,10);
      await updateMember(m.id, { is_expected:false, member_type:'neonato', birth_date:today });
    });
  }
  $('me-save').addEventListener('click', async ()=>{
    const patch = {
      display_name: $('me-name').value.trim() || m.display_name,
      color: $('me-color').value,
      member_type: $('me-type').value,
      occupation: $('me-occ').value,
    };
    await updateMember(m.id, patch);
  });
}

async function updateMember(id, patch){
  const { error } = await sb.from('members').update(patch).eq('id', id);
  if(error){ const e=$('me-error'); if(e){e.textContent='Errore: '+error.message; e.classList.remove('hidden');} return; }
  // ricarico i membri
  const { data: ms } = await sb.from('members').select('*').eq('household_id', state.household.id).order('created_at');
  state.members = ms||[];
  state.me = state.members.find(x=>x.id===state.me?.id) || state.me;
  applyMyTheme();
  renderMembersList();
  // aggiorno anche la home
  renderHomeMembersOnly();
}
function renderHomeMembersOnly(){
  const wrap = $('home-members'); if(!wrap) return; wrap.innerHTML='';
  state.members.forEach(m=>{
    const initial=(m.display_name||'?').charAt(0).toUpperCase();
    const occ = m.is_expected ? 'in arrivo' : etichettaOcc(m.occupation);
    const row=document.createElement('div'); row.className='mrow';
    row.innerHTML = `<span class="av" style="background:${m.color}">${initial}</span>
      <div><div class="mn">${m.display_name}</div><div class="ms">${occ}</div></div>`;
    wrap.appendChild(row);
  });
}

// aggiungi nuovo membro
$('fam-add-member').addEventListener('click', async ()=>{
  const color = MAGS_CONFIG.MEMBER_COLORS[state.members.length % MAGS_CONFIG.MEMBER_COLORS.length];
  const { data, error } = await sb.from('members').insert({
    household_id: state.household.id, display_name:'Nuovo membro', member_type:'adulto', color, occupation:'nessuna'
  }).select().single();
  if(error){ alert('Errore: '+error.message); return; }
  const { data: ms } = await sb.from('members').select('*').eq('household_id', state.household.id).order('created_at');
  state.members = ms||[];
  renderMembersList();
});

// ---- Accessi: chi ha un account collegato ----
async function renderAccessi(){
  const wrap=$('fam-accessi-list'); wrap.innerHTML='';
  const { data: links } = await sb.from('household_members').select('member_id, role, user_id').eq('household_id', state.household.id);
  const linkedIds = new Set((links||[]).map(l=>l.member_id));
  state.members.forEach(m=>{
    const linked = linkedIds.has(m.id);
    const initial=(m.display_name||'?').charAt(0).toUpperCase();
    const badge = linked
      ? `<span class="badge">account attivo</span>`
      : `<span class="badge muted">profilo</span>`;
    const row=document.createElement('div'); row.className='medit';
    row.innerHTML = `<span class="av" style="background:${m.color}">${initial}</span>
      <div class="grow"><div class="nm">${m.display_name} ${badge}</div>
      <div class="ms">${linked?'può accedere':'gestito dai genitori'}</div></div>`;
    wrap.appendChild(row);
  });
}

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
  renderCalFilter();
  await loadMonthEvents();
  renderCalGrid();
  renderDayAgenda();
}

function renderCalFilter(){
  const wrap=$('cal-filter'); wrap.innerHTML='';
  const mk=(id,label,color)=>{
    const p=document.createElement('div');
    p.className='fpill'+(state.cal.filterMember===id?' on':'');
    p.textContent=label;
    if(color && state.cal.filterMember===id) p.style.cssText='';
    p.onclick=()=>{ state.cal.filterMember=id; renderCalFilter(); renderCalGrid(); renderDayAgenda(); };
    wrap.appendChild(p);
  };
  mk('all','Tutti');
  state.members.forEach(m=> mk(m.id, m.display_name, m.color));
}

async function loadMonthEvents(){
  const { year, month } = state.cal;
  const start = `${year}-${pad(month+1)}-01`;
  const endDate = new Date(year, month+1, 1);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-01`;
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

function renderCalGrid(){
  const { year, month } = state.cal;
  $('cal-monthname').textContent = `${MONTHS_IT[month]} ${year}`;
  $('cal-title').innerHTML = `${MONTHS_IT[month].charAt(0).toUpperCase()+MONTHS_IT[month].slice(1)} <span class="nm">${year}</span>`;

  const grid=$('cal-grid'); grid.innerHTML='';
  DOW_IT.forEach(d=>{ const e=document.createElement('div'); e.className='cal-dow'; e.textContent=d; grid.appendChild(e); });

  const first = new Date(year, month, 1);
  let startDow = first.getDay(); // 0=dom
  startDow = (startDow===0)?6:startDow-1; // lun=0
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for(let i=0;i<startDow;i++){ const e=document.createElement('div'); e.className='cal-cell empty'; grid.appendChild(e); }

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = ymd(year, month, d);
    const cell=document.createElement('div');
    cell.className='cal-cell';
    if(dateStr===todayYmd()) cell.classList.add('today');
    if(dateStr===state.cal.selDate) cell.classList.add('sel');

    const evs = eventsForDay(dateStr);
    const cats = [...new Set(evs.map(e=>e.category))].slice(0,4);
    const pips = cats.map(c=>`<span class="dpip" style="background:${CAT_COLORS[c]||'var(--ink-soft)'}"></span>`).join('');
    cell.innerHTML = `<span class="dnum">${d}</span><span class="dpips">${pips}</span>`;
    cell.onclick=()=>{ state.cal.selDate=dateStr; renderCalGrid(); renderDayAgenda(); };
    grid.appendChild(cell);
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

// nav mesi
$('cal-prev').addEventListener('click', async ()=>{
  state.cal.month--; if(state.cal.month<0){ state.cal.month=11; state.cal.year--; }
  await loadMonthEvents(); renderCalGrid(); renderDayAgenda();
});
$('cal-next').addEventListener('click', async ()=>{
  state.cal.month++; if(state.cal.month>11){ state.cal.month=0; state.cal.year++; }
  await loadMonthEvents(); renderCalGrid(); renderDayAgenda();
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
  // se l'evento è in un altro mese, spostati lì
  const evMonth = parseInt(date.slice(5,7))-1, evYear=parseInt(date.slice(0,4));
  if(evMonth!==state.cal.month || evYear!==state.cal.year){ state.cal.month=evMonth; state.cal.year=evYear; }
  state.cal.selDate = date;
  await loadMonthEvents(); renderCalGrid(); renderDayAgenda();
});

$('ev-delete').addEventListener('click', async ()=>{
  if(!editingEventId) return;
  const { error } = await sb.from('events').delete().eq('id', editingEventId);
  if(error){ showError('ev-error','Errore: '+error.message); return; }
  closeEventModal();
  await loadMonthEvents(); renderCalGrid(); renderDayAgenda();
});

// ============================================================
// TEMA: picker nella sezione Famiglia
// ============================================================
function initThemePicker(){
  if(!state.me) return;
  // famiglia
  document.querySelectorAll('#theme-fam .theme-opt').forEach(b=>{
    b.classList.toggle('on', b.dataset.fam===state.me.theme_family);
    b.onclick = ()=> setMyTheme({ theme_family:b.dataset.fam });
  });
  // luminosità
  document.querySelectorAll('#theme-lum .theme-opt').forEach(b=>{
    b.classList.toggle('on', b.dataset.lum===state.me.theme_lum);
    b.onclick = ()=> setMyTheme({ theme_lum:b.dataset.lum });
  });
  // colori personali
  const cw=$('theme-colors'); cw.innerHTML='';
  MAGS_CONFIG.MEMBER_COLORS.forEach(c=>{
    const d=document.createElement('button'); d.className='color-dot'+(c.toLowerCase()===(state.me.color||'').toLowerCase()?' on':'');
    d.style.background=c; d.onclick=()=>setMyTheme({ color:c });
    cw.appendChild(d);
  });
}

async function setMyTheme(patch){
  const { error } = await sb.from('members').update(patch).eq('id', state.me.id);
  if(error){ alert('Errore tema: '+error.message); return; }
  Object.assign(state.me, patch);
  applyMyTheme();
  initThemePicker();
  renderHomeMembersOnly();
}

// ============================================================
// LOGOUT
// ============================================================
$('btn-logout').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

// Via!
applyTheme('aurora','system');  // tema neutro finché non carico il profilo
boot();
