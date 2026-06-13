// ============================================================
// MAGS — Sezione Famiglia (membri, accessi, tema)
// ============================================================
// SEZIONE FAMIGLIA
// ============================================================
function renderFamiglia(){
  openSalute(); // carica i record salute (hrRecords) e poi disegna la vista unificata
}

const OCC_OPTS = [['nessuna','Nessuna'],['nido','Nido'],['materna','Materna'],['elementari','Elementari'],['medie','Medie'],['lavoro','Lavoro'],['cabin_crew','Cabin crew']];
const TYPE_OPTS = [['adulto','Adulto'],['bambino','Bambino'],['neonato','Neonato']];

// vista unica: una hero per membro con anagrafica + accesso + salute
function renderFamUnified(){
  const wrap=$('fam-unified'); if(!wrap) return; wrap.innerHTML='';
  state.members.forEach(m=>{
    const initial=(m.display_name||'?').charAt(0).toUpperCase();
    const r=(typeof hrRecords!=='undefined' && hrRecords[m.id])||{};
    const ruolo = m.is_expected ? 'In arrivo' : etichettaOcc(m.occupation);
    let etaTxt='';
    if(m.is_expected && r.due_date){ etaTxt = gravidanzaLabel ? '' : ''; }
    const eta = m.is_expected ? (r.due_date?dueLabel(r.due_date):'') : (r.birth_date?etaFromBirth(r.birth_date):'');
    const accesso = m.user_id ? '🟢 Account attivo' : '⚪ Profilo gestito';
    const card=document.createElement('section'); card.className='hero-card';
    card.innerHTML=`
      <div class="hero-card-head" style="gap:12px;">
        <div style="display:flex;align-items:center;gap:11px;">
          <span class="av" style="background:${m.color};width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;">${initial}</span>
          <div><h2 style="font-size:16px;">${m.display_name}</h2><div style="font-size:11px;color:rgba(0,0,0,.5);">${ruolo}${eta?' · '+eta:''}</div></div>
        </div>
        <button class="editbtn" data-edit="${m.id}">✎</button>
      </div>
      <div>
        <div class="hr-grid">
          <div class="hr-cell"><span class="hl">Accesso</span><span class="hv" style="font-size:12px">${accesso}</span></div>
          <div class="hr-cell"><span class="hl">Gruppo</span><span class="hv">${r.blood_type||'—'}</span></div>
          <div class="hr-cell"><span class="hl">Allergie</span><span class="hv">${r.allergies||'—'}</span></div>
          <div class="hr-cell"><span class="hl">Cod. fiscale</span><span class="hv mono">${r.fiscal_code||'—'}</span></div>
        </div>
        ${r.notes?`<div style="font-size:12.5px;color:rgba(0,0,0,.6);margin-top:10px;">📝 ${r.notes}</div>`:''}
      </div>`;
    wrap.appendChild(card);
  });
  // il ✎ apre la modifica unica (anagrafica + salute)
  state.members.forEach(m=>{
    const eb=wrap.querySelector(`[data-edit="${m.id}"]`);
    if(eb) eb.onclick=()=>openMemberFull(m);
  });
}

function etaFromBirth(birth){
  const b=new Date(birth+'T12:00:00'), n=new Date();
  let e=n.getFullYear()-b.getFullYear();
  const mm=n.getMonth()-b.getMonth();
  if(mm<0||(mm===0&&n.getDate()<b.getDate())) e--;
  if(e<0) return '';
  if(e===0){ let mesi=(n.getFullYear()-b.getFullYear())*12+(n.getMonth()-b.getMonth()); if(n.getDate()<b.getDate())mesi--; return `${Math.max(0,mesi)} mesi`; }
  return `${e} anni`;
}
function dueLabel(due){
  const oggi=new Date(), parto=new Date(due+'T12:00:00');
  const gg=Math.round((parto-oggi)/86400000);
  const g=280-gg; if(g<0) return 'in arrivo';
  return `${Math.floor(g/7)}+${g%7} sett.`;
}

// modifica completa: anagrafica + salute in un unico form
function openMemberFull(m){
  const wrap=$('fam-unified');
  const card=[...wrap.children].find(c=>c.querySelector(`[data-edit="${m.id}"]`));
  if(!card) return;
  const r=(typeof hrRecords!=='undefined' && hrRecords[m.id])||{};
  const inArrivo=m.is_expected;
  card.innerHTML=`
    <div class="hero-card-head"><h2 style="font-size:16px;">✎ ${m.display_name}</h2></div>
    <div>
      <label class="field-label">Nome</label>
      <div style="display:flex;gap:9px;align-items:center;">
        <input type="color" class="su-dot" id="mf-color" value="${m.color}" style="width:42px;height:42px;border:none;border-radius:12px;padding:0;">
        <input type="text" class="field" id="mf-name" value="${m.display_name}" style="flex:1;margin:0;">
      </div>
      <div class="row2" style="margin-top:10px;">
        <select class="field" id="mf-type">${TYPE_OPTS.map(([v,l])=>`<option value="${v}"${m.member_type===v?' selected':''}>${l}</option>`).join('')}</select>
        <select class="field" id="mf-occ">${OCC_OPTS.map(([v,l])=>`<option value="${v}"${m.occupation===v?' selected':''}>${l}</option>`).join('')}</select>
      </div>
      ${inArrivo
        ? `<label class="field-label">Data presunta parto</label><input class="field" id="mf-due" type="date" value="${r.due_date||''}">`
        : `<label class="field-label">Data di nascita</label><input class="field" id="mf-birth" type="date" value="${r.birth_date||''}">`}
      <label class="field-label">Gruppo sanguigno</label>
      <select class="field" id="mf-blood">${['','0+','0-','A+','A-','B+','B-','AB+','AB-'].map(b=>`<option value="${b}"${r.blood_type===b?' selected':''}>${b||'—'}</option>`).join('')}</select>
      <label class="field-label">Allergie</label>
      <input class="field" id="mf-allergies" value="${r.allergies||''}" placeholder="Es. Nichel, lattosio">
      <label class="field-label">Codice fiscale</label>
      <input class="field" id="mf-fiscal" value="${r.fiscal_code||''}" placeholder="RSSMRA..." style="text-transform:uppercase;">
      <label class="field-label">Note mediche</label>
      <input class="field" id="mf-notes" value="${r.notes||''}" placeholder="Es. pediatra Dr. Bianchi">
      ${inArrivo?`<button class="btn-ghost" id="mf-born" style="margin-top:12px;">🍼 È nato! · attiva profilo</button>`:''}
      <button class="btn-primary" id="mf-save" style="margin-top:14px;">Salva</button>
      ${(state.me && m.id===state.me.id)?'':`<button class="btn-ghost" id="mf-delete" style="margin-top:8px;color:#e23b5a;border-color:#e23b5a;">Elimina membro</button>`}
      <button class="btn-ghost" id="mf-cancel" style="margin-top:8px;">Annulla</button>
      <p class="auth-error hidden" id="mf-error"></p>
    </div>`;
  $('mf-cancel').onclick=()=>renderFamUnified();
  $('mf-save').onclick=()=>saveMemberFull(m);
  const del=$('mf-delete'); if(del) del.onclick=()=>deleteMember(m);
  const born=$('mf-born'); if(born) born.onclick=()=>markBorn(m);
}

async function saveMemberFull(m){
  const g=id=>$(id);
  // anagrafica
  const memberPatch={
    display_name:g('mf-name').value.trim()||m.display_name,
    color:g('mf-color').value,
    member_type:g('mf-type').value,
    occupation:g('mf-occ').value,
  };
  const { error:e1 }=await sb.from('members').update(memberPatch).eq('id',m.id);
  if(e1){ const e=$('mf-error'); e.textContent='Errore: '+e1.message; e.classList.remove('hidden'); return; }
  // salute
  const r=(hrRecords&&hrRecords[m.id])||{};
  const healthPatch={
    member_id:m.id,
    birth_date:m.is_expected?null:(g('mf-birth')?.value||null),
    due_date:m.is_expected?(g('mf-due')?.value||null):null,
    blood_type:g('mf-blood').value||null,
    allergies:g('mf-allergies').value.trim()||null,
    fiscal_code:g('mf-fiscal').value.trim().toUpperCase()||null,
    notes:g('mf-notes').value.trim()||null,
  };
  if(r&&r.id){ await sb.from('health_records').update(healthPatch).eq('id',r.id); }
  else { await sb.from('health_records').insert(healthPatch); }
  // ricarica membri e record
  await reloadMembers();
  await openSalute();
}

async function deleteMember(m){
  if(!confirm(`Eliminare "${m.display_name}"? Verranno rimossi anche i suoi dati.`)) return;
  await sb.from('members').delete().eq('id',m.id);
  await reloadMembers();
  await openSalute();
}
async function markBorn(m){
  if(!confirm(`Confermi che ${m.display_name} è nato? Il profilo diventerà attivo.`)) return;
  await sb.from('members').update({ is_expected:false, member_type:'neonato' }).eq('id',m.id);
  await reloadMembers();
  await openSalute();
}
async function reloadMembers(){
  const { data }=await sb.from('members').select('*').eq('household_id',state.household.id).order('created_at');
  if(data) state.members=magsSort(data);
}

function renderMembersList(){ renderFamUnified(); }

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
    state.members = magsSort(ms||[]);
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
  state.members = magsSort(ms||[]);
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
  state.members = magsSort(ms||[]);
  renderMembersList();
});

// ---- Accessi: chi ha un account collegato ----
async function renderAccessi(){
  const wrap=$('fam-accessi-list'); if(!wrap) return; wrap.innerHTML='';
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
// SALUTE — schede mediche di TUTTI i membri, ognuna in una hero
// ============================================================
let hrRecords = {};   // member_id -> record
let hrEditing = null; // member_id in modifica

function calcEta(birth){
  if(!birth) return '';
  const b=new Date(birth+'T12:00:00'), n=new Date();
  let e=n.getFullYear()-b.getFullYear();
  const m=n.getMonth()-b.getMonth();
  if(m<0 || (m===0 && n.getDate()<b.getDate())) e--;
  return e>=0 ? `${e} anni` : '';
}

async function openSalute(){
  const ids = state.members.map(m=>m.id);
  const { data } = await sb.from('health_records').select('*').in('member_id', ids);
  hrRecords = {};
  (data||[]).forEach(r=>{ hrRecords[r.member_id]=r; });
  renderFamUnified();
}

function renderSaluteAll(){
  const wrap=$('hr-all'); if(!wrap) return; wrap.innerHTML='';
  state.members.forEach(m=>{
    const card=document.createElement('section'); card.className='hero-card hr-hero';
    if(hrEditing===m.id){ card.innerHTML = saluteEditHTML(m); }
    else { card.innerHTML = saluteViewHTML(m); }
    wrap.appendChild(card);
  });
  // collega i pulsanti
  state.members.forEach(m=>{
    const ed=$(`hr-edit-${m.id}`); if(ed) ed.onclick=()=>{ hrEditing=m.id; renderSaluteAll(); };
    const sv=$(`hr-save-${m.id}`); if(sv) sv.onclick=()=>saveSalute(m);
    const cn=$(`hr-cancel-${m.id}`); if(cn) cn.onclick=()=>{ hrEditing=null; renderSaluteAll(); };
  });
}

function saluteViewHTML(m){
  const r=hrRecords[m.id]||{};
  const initial=(m.display_name||'?').charAt(0).toUpperCase();
  let etaLine;
  if(m.is_expected){
    etaLine = r.due_date ? `Parto previsto ${new Date(r.due_date+'T12:00:00').toLocaleDateString('it-IT')}` : 'Data parto da impostare';
  } else {
    const eta=calcEta(r.birth_date);
    etaLine = r.birth_date ? `${new Date(r.birth_date+'T12:00:00').toLocaleDateString('it-IT')}${eta?' · '+eta:''}` : 'Data di nascita da impostare';
  }
  return `
    <div class="hr-hero-head">
      <span class="av" style="background:${m.color}">${initial}</span>
      <div class="grow"><div class="hr-name">${m.display_name}</div><div class="hr-eta">${etaLine}</div></div>
      <button class="edit-ic" id="hr-edit-${m.id}" title="Modifica">✎</button>
    </div>
    <div class="hr-grid">
      <div class="hr-cell"><span class="hl">Gruppo</span><span class="hv">${r.blood_type||'—'}</span></div>
      <div class="hr-cell"><span class="hl">Allergie</span><span class="hv">${r.allergies||'—'}</span></div>
      <div class="hr-cell"><span class="hl">Cod. fiscale</span><span class="hv mono">${r.fiscal_code||'—'}</span></div>
      <div class="hr-cell"><span class="hl">Note</span><span class="hv">${r.notes||'—'}</span></div>
    </div>`;
}

function saluteEditHTML(m){
  const r=hrRecords[m.id]||{};
  const inArrivo=m.is_expected;
  return `
    <div class="hr-hero-head"><div class="hr-name">✎ ${m.display_name}</div></div>
    ${inArrivo
      ? `<label class="field-label">Data presunta del parto</label><input class="field" id="he-due-${m.id}" type="date" value="${r.due_date||''}">`
      : `<label class="field-label">Data di nascita</label><input class="field" id="he-birth-${m.id}" type="date" value="${r.birth_date||''}">`}
    <label class="field-label">Gruppo sanguigno</label>
    <select class="field" id="he-blood-${m.id}">
      ${['','0+','0-','A+','A-','B+','B-','AB+','AB-'].map(b=>`<option value="${b}"${r.blood_type===b?' selected':''}>${b||'—'}</option>`).join('')}
    </select>
    <label class="field-label">Allergie</label>
    <input class="field" id="he-allergies-${m.id}" value="${r.allergies||''}" placeholder="Es. Nichel, lattosio">
    <label class="field-label">Codice fiscale</label>
    <input class="field" id="he-fiscal-${m.id}" value="${r.fiscal_code||''}" placeholder="RSSMRA..." style="text-transform:uppercase;">
    <label class="field-label">Note mediche</label>
    <input class="field" id="he-notes-${m.id}" value="${r.notes||''}" placeholder="Es. pediatra Dr. Bianchi">
    <button class="btn-primary" id="hr-save-${m.id}" style="margin-top:12px;">Salva</button>
    <button class="btn-ghost" id="hr-cancel-${m.id}" style="margin-top:8px;">Annulla</button>`;
}

async function saveSalute(m){
  const r=hrRecords[m.id]||{};
  const g=(id)=>$(`${id}-${m.id}`);
  const payload={
    member_id:m.id,
    birth_date: m.is_expected ? null : (g('he-birth')?.value || null),
    due_date:   m.is_expected ? (g('he-due')?.value || null) : null,
    blood_type: g('he-blood')?.value || null,
    allergies:  g('he-allergies')?.value.trim() || null,
    fiscal_code:g('he-fiscal')?.value.trim().toUpperCase() || null,
    notes:      g('he-notes')?.value.trim() || null,
  };
  let error;
  if(r && r.id){ ({error}=await sb.from('health_records').update(payload).eq('id', r.id)); }
  else { ({error}=await sb.from('health_records').insert(payload)); }
  if(error){ alert('Errore: '+error.message); return; }
  hrEditing=null;
  await openSalute();
}
