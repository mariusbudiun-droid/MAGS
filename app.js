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
};

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
    // Nessuna famiglia per questo utente: serve setup.
    // Ma forse la famiglia esiste già (creata dall'altro genitore)?
    const { data: anyHh } = await sb.from('households').select('id, name').limit(1);
    if(anyHh && anyHh.length){
      // La famiglia esiste ma io non sono ancora agganciato: scelgo il mio profilo.
      await prepareJoin(anyHh[0]);
    } else {
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
    // 1. crea famiglia
    const { data: hh, error: e1 } = await sb.from('households').insert({ name: hhName }).select().single();
    if(e1) throw e1;

    // 2. crea membri
    const toInsert = membersInput.map(m=>({
      household_id: hh.id,
      display_name: m.name,
      member_type: m.type,
      color: m.color,
      is_expected: m.type==='neonato',
      occupation: m.type==='neonato' ? 'nessuna' : (m.type==='bambino' ? 'materna' : 'lavoro'),
    }));
    const { data: created, error: e2 } = await sb.from('members').insert(toInsert).select();
    if(e2) throw e2;

    // 3. aggancia il mio account al profilo scelto, come admin
    const myProfile = created.find(c=>c.display_name===iam) || created[0];
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
// HOME (minima per ora)
// ============================================================
function renderHome(){
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
}

function etichettaOcc(o){
  const map={nessuna:'—',nido:'Nido',materna:'Materna',elementari:'Elementari',medie:'Medie',lavoro:'Lavoro',cabin_crew:'Cabin crew'};
  return map[o]||o;
}

// ============================================================
// LOGOUT
// ============================================================
$('btn-logout').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

// Via!
boot();
