// ============================================================
// MAGS — Sezione Famiglia (membri, accessi, tema)
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
    <button class="btn-ghost" id="me-delete" style="margin-top:8px;color:#e23b5a;border-color:#e23b5a;">Elimina membro</button>
    <button class="btn-ghost" id="me-cancel" style="margin-top:8px;">Annulla</button>
    <p class="auth-error hidden" id="me-error"></p>`;
  rowEl.replaceWith(form);

  $('me-cancel').addEventListener('click', renderMembersList);
  $('me-delete').addEventListener('click', async ()=>{
    // non permettere di eliminare il proprio profilo collegato
    if(state.me && m.id===state.me.id){
      const e=$('me-error'); if(e){e.textContent='Non puoi eliminare il tuo profilo.'; e.classList.remove('hidden');}
      return;
    }
    if(!confirm(`Eliminare "${m.display_name}"? Verranno rimossi anche i suoi eventi e dati collegati.`)) return;
    // rimuovi eventuale aggancio account, poi il membro
    await sb.from('household_members').delete().eq('member_id', m.id);
    const { error } = await sb.from('members').delete().eq('id', m.id);
    if(error){ const e=$('me-error'); if(e){e.textContent='Errore: '+error.message; e.classList.remove('hidden');} return; }
    const { data: ms } = await sb.from('members').select('*').eq('household_id', state.household.id).order('created_at');
    state.members = ms||[];
    renderMembersList();
    renderHomeMembersOnly();
  });
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
// SALUTE — schede mediche per membro (dati testuali)
// ============================================================
let hrMemberId = null;
let hrCurrent = null; // record salute corrente

function openSalute(){
  const sel=$('hr-member');
  sel.innerHTML = state.members.map(m=>`<option value="${m.id}">${m.display_name}</option>`).join('');
  if(!hrMemberId) hrMemberId = state.members[0]?.id;
  if(hrMemberId) sel.value = hrMemberId;
  sel.onchange = ()=>{ hrMemberId = sel.value; loadSalute(); };
  loadSalute();
}

async function loadSalute(){
  if(!hrMemberId) return;
  const { data } = await sb.from('health_records').select('*').eq('member_id', hrMemberId).maybeSingle();
  hrCurrent = data || null;
  renderSaluteCard();
  loadVisite();
}

function calcEta(birth){
  if(!birth) return '';
  const b=new Date(birth+'T12:00:00'), n=new Date();
  let e=n.getFullYear()-b.getFullYear();
  const m=n.getMonth()-b.getMonth();
  if(m<0 || (m===0 && n.getDate()<b.getDate())) e--;
  return e>=0 ? `${e} anni` : '';
}

function renderSaluteCard(){
  const m = state.members.find(x=>x.id===hrMemberId);
  const r = hrCurrent || {};
  const eta = calcEta(r.birth_date);
  const wrap=$('hr-card');
  wrap.innerHTML = `
    <div class="hr-row"><span class="hl">Data di nascita</span><span class="hv" id="hr-birth-v">${r.birth_date ? new Date(r.birth_date+'T12:00:00').toLocaleDateString('it-IT')+(eta?` · ${eta}`:'') : '—'}</span></div>
    <div class="hr-row"><span class="hl">Gruppo sanguigno</span><span class="hv">${r.blood_type||'—'}</span></div>
    <div class="hr-row"><span class="hl">Allergie</span><span class="hv">${r.allergies||'—'}</span></div>
    <div class="hr-row"><span class="hl">Codice fiscale</span><span class="hv mono">${r.fiscal_code||'—'}</span></div>
    <div class="hr-row" style="border:none;"><span class="hl">Note</span><span class="hv">${r.notes||'—'}</span></div>
    <button class="btn-ghost" id="hr-edit" style="margin-top:14px;">✎ Modifica scheda</button>`;
  $('hr-edit').onclick = openSaluteEdit;
}

function openSaluteEdit(){
  const r = hrCurrent || {};
  const wrap=$('hr-card');
  wrap.innerHTML = `
    <label class="field-label">Data di nascita</label>
    <input class="field" id="he-birth" type="date" value="${r.birth_date||''}">
    <label class="field-label">Gruppo sanguigno</label>
    <select class="field" id="he-blood">
      ${['','0+','0-','A+','A-','B+','B-','AB+','AB-'].map(b=>`<option value="${b}"${r.blood_type===b?' selected':''}>${b||'—'}</option>`).join('')}
    </select>
    <label class="field-label">Allergie</label>
    <input class="field" id="he-allergies" value="${r.allergies||''}" placeholder="Es. Nichel, lattosio">
    <label class="field-label">Codice fiscale</label>
    <input class="field" id="he-fiscal" value="${r.fiscal_code||''}" placeholder="RSSMRA..." style="text-transform:uppercase;">
    <label class="field-label">Note mediche</label>
    <input class="field" id="he-notes" value="${r.notes||''}" placeholder="Es. gruppo pediatrico Dr. Bianchi">
    <button class="btn-primary" id="he-save">Salva scheda</button>
    <button class="btn-ghost" id="he-cancel" style="margin-top:8px;">Annulla</button>
    <p class="auth-error hidden" id="he-error"></p>`;
  $('he-cancel').onclick = renderSaluteCard;
  $('he-save').onclick = saveSalute;
}

async function saveSalute(){
  const payload = {
    member_id: hrMemberId,
    birth_date: $('he-birth').value || null,
    blood_type: $('he-blood').value || null,
    allergies: $('he-allergies').value.trim() || null,
    fiscal_code: $('he-fiscal').value.trim().toUpperCase() || null,
    notes: $('he-notes').value.trim() || null,
  };
  let error;
  if(hrCurrent && hrCurrent.id){
    ({ error } = await sb.from('health_records').update(payload).eq('id', hrCurrent.id));
  } else {
    ({ error } = await sb.from('health_records').insert(payload));
  }
  if(error){ const e=$('he-error'); if(e){ e.textContent='Errore: '+error.message; e.classList.remove('hidden'); } return; }
  await loadSalute();
}

// visite mediche = eventi categoria salute del membro, da oggi in avanti
async function loadVisite(){
  const today = new Date().toISOString().slice(0,10);
  const { data } = await sb.from('events').select('*')
    .eq('household_id', state.household.id).eq('member_id', hrMemberId).eq('category','salute')
    .gte('start_at', today+'T00:00:00').order('start_at').limit(10);
  const wrap=$('hr-visits'); wrap.innerHTML='';
  if(!data || data.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna visita in programma.</div>'; return; }
  data.forEach(e=>{
    const d=new Date(e.start_at).toLocaleDateString('it-IT',{day:'numeric',month:'short'});
    const t=e.all_day?'':(e.start_at||'').slice(11,16);
    const row=document.createElement('div'); row.className='ev';
    row.innerHTML=`<span class="time">${d}</span><span class="dot" style="background:#22b8a6"></span>
      <div><div class="ti">${e.title}</div><div class="meta">${[t,e.location].filter(Boolean).join(' · ')}</div></div>`;
    row.onclick=()=>{ if(typeof openEventModal==='function') openEventModal(e); };
    wrap.appendChild(row);
  });
}

// aggiungi visita: apre il modal evento precompilato salute + membro
$('hr-add-visit').addEventListener('click', ()=>{
  if(typeof openEventModal!=='function') return;
  openEventModal(null);
  // precompila categoria salute e membro corrente
  setTimeout(()=>{
    const cat=$('ev-category'); if(cat) cat.value='salute';
    const mem=$('ev-member'); if(mem) mem.value=hrMemberId||'';
  },0);
});
