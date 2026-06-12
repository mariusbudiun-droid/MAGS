// ============================================================
// MAGS — Sezione Casa (liste spesa, menù)
// ============================================================
// CASA — liste spesa + menù
// ============================================================
const casaState = { lists: [], currentList: null, menu: [] };
const DEFAULT_LISTS = [
  { name:'Spesa', icon:'🛒' }, { name:'Farmacia', icon:'💊' },
  { name:'Casa', icon:'🏠' }, { name:'Bebè', icon:'👶' },
];

async function openCasa(){
  await loadLists();
  await loadMenu();
  renderMenu();
}

async function loadLists(){
  let { data } = await sb.from('shopping_lists').select('*').eq('household_id', state.household.id).order('sort_order');
  if(!data || data.length===0){
    const toInsert = DEFAULT_LISTS.map((l,i)=>({ household_id:state.household.id, name:l.name, icon:l.icon, sort_order:i }));
    const { data: created } = await sb.from('shopping_lists').insert(toInsert).select();
    data = created || [];
  }
  casaState.lists = data;
  if(!casaState.currentList && data.length) casaState.currentList = data[0].id;
  renderListPills();
  await loadItems();
}

function renderListPills(){
  const wrap=$('casa-listpills'); wrap.innerHTML='';
  casaState.lists.forEach(l=>{
    const p=document.createElement('div');
    p.className='listpill'+(casaState.currentList===l.id?' on':'');
    p.textContent = (l.icon? l.icon+' ':'')+l.name;
    p.onclick=()=>{ casaState.currentList=l.id; renderListPills(); loadItems(); };
    wrap.appendChild(p);
  });
  const add=document.createElement('div'); add.className='listpill add'; add.textContent='+ Lista';
  add.onclick=async ()=>{
    const name=prompt('Nome della nuova lista:'); if(!name) return;
    const { data } = await sb.from('shopping_lists').insert({ household_id:state.household.id, name:name.trim(), sort_order:casaState.lists.length }).select().single();
    if(data){ casaState.currentList=data.id; await loadLists(); }
  };
  wrap.appendChild(add);
}

async function loadItems(){
  if(!casaState.currentList){ $('casa-items').innerHTML=''; return; }
  const { data } = await sb.from('shopping_items').select('*').eq('list_id', casaState.currentList).order('created_at');
  renderItems(data||[]);
}

function renderItems(items){
  const wrap=$('casa-items'); wrap.innerHTML='';
  if(items.length===0){ wrap.innerHTML='<div class="shop-empty">Lista vuota. Aggiungi qualcosa qui sotto.</div>'; return; }
  items.forEach(it=>{
    const who = state.members.find(m=>m.id===it.added_by);
    const row=document.createElement('div'); row.className='shop'+(it.checked?' done':'');
    row.innerHTML = `<span class="box ${it.checked?'ck':''}"></span>
      <span class="nm">${it.name}</span>
      <span class="who">${who?who.display_name:''}</span>
      <button class="del" title="Elimina">×</button>`;
    row.querySelector('.box').onclick=async ()=>{
      await sb.from('shopping_items').update({ checked: !it.checked }).eq('id', it.id);
      loadItems();
    };
    row.querySelector('.del').onclick=async ()=>{
      await sb.from('shopping_items').delete().eq('id', it.id);
      loadItems();
    };
    wrap.appendChild(row);
  });
}

async function addItem(){
  const inp=$('casa-newitem'); const name=inp.value.trim();
  if(!name || !casaState.currentList) return;
  inp.value='';
  await sb.from('shopping_items').insert({
    list_id: casaState.currentList, name, added_by: state.me?state.me.id:null, source:'manuale'
  });
  loadItems();
}
$('casa-additem').addEventListener('click', addItem);
$('casa-newitem').addEventListener('keydown', e=>{ if(e.key==='Enter') addItem(); });

// ---- import lista spesa da screenshot ----
let spesaItems = null;
$('spesa-pick').addEventListener('click', ()=>$('spesa-file').click());
$('spesa-file').addEventListener('change', async (e)=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(!casaState.currentList){ setSpesaStatus('err','Seleziona prima una lista.'); return; }
  setSpesaStatus('load','Leggo la lista dalla foto…');
  try{
    const { base64, mediaType } = await fileToB64Spesa(file);
    const r = await fetch('/api/import-spesa', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ imageBase64:base64, mediaType })
    });
    const data = await r.json();
    if(!r.ok){ setSpesaStatus('err', data.error || 'Errore lettura'); return; }
    spesaItems = (data.items||[]).map(s=>({ name:s, keep:true }));
    if(spesaItems.length===0){ setSpesaStatus('err','Nessun articolo trovato.'); return; }
    clearSpesaStatus(); renderSpesaPreview();
  }catch(err){ setSpesaStatus('err','Errore: '+(err.message||err)); }
  finally{ e.target.value=''; }
});

function renderSpesaPreview(){
  const wrap=$('spesa-preview');
  let html=`<div class="sec-row"><h2>Trovati ${spesaItems.length} articoli</h2></div><div class="card" style="padding:6px 16px;">`;
  spesaItems.forEach((it,i)=>{
    html+=`<label class="spesa-prev-row">
      <input type="checkbox" ${it.keep?'checked':''} data-i="${i}">
      <span>${it.name}</span></label>`;
  });
  html+=`</div>
    <button class="btn-primary" id="spesa-confirm">Aggiungi selezionati</button>
    <button class="btn-ghost" id="spesa-cancel" style="margin-top:8px;">Annulla</button>`;
  wrap.innerHTML=html;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change',()=>{ spesaItems[parseInt(cb.dataset.i)].keep=cb.checked; });
  });
  $('spesa-confirm').addEventListener('click', confirmSpesa);
  $('spesa-cancel').addEventListener('click', ()=>{ spesaItems=null; wrap.innerHTML=''; });
}

async function confirmSpesa(){
  const keep = spesaItems.filter(it=>it.keep);
  if(keep.length===0 || !casaState.currentList){ spesaItems=null; $('spesa-preview').innerHTML=''; return; }
  const rows = keep.map(it=>({ list_id:casaState.currentList, name:it.name, added_by:state.me?state.me.id:null, source:'manuale' }));
  const btn=$('spesa-confirm'); if(btn){ btn.disabled=true; btn.textContent='Aggiungo…'; }
  const { error } = await sb.from('shopping_items').insert(rows);
  spesaItems=null; $('spesa-preview').innerHTML='';
  if(error){ setSpesaStatus('err','Errore: '+error.message); return; }
  loadItems();
}

function setSpesaStatus(kind,msg){
  const el=$('spesa-status'); if(!el) return;
  const col = kind==='err'?'#e23b5a':kind==='load'?'var(--ink-soft)':'var(--accent)';
  el.innerHTML=`<div style="text-align:center;padding:10px;color:${col};font-size:13px;">${msg}</div>`;
}
function clearSpesaStatus(){ const el=$('spesa-status'); if(el) el.innerHTML=''; }

// converte un File in base64 (riusa lo stesso helper del roster se esiste)
async function fileToB64Spesa(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{ const res=reader.result; const base64=String(res).split(',')[1]; resolve({ base64, mediaType:file.type||'image/jpeg' }); };
    reader.onerror=()=>reject(new Error('Lettura file fallita'));
    reader.readAsDataURL(file);
  });
}


// ---- menù settimanale ----
const MEALS = [['pranzo','Pranzo'],['cena','Cena']];

// quanti giorni mostrare di default (da oggi). Aumenta con "+ Aggiungi giorno".
let menuDaysCount = 3;

function menuToday(){ return new Date().toISOString().slice(0,10); }
function menuAddDays(dateStr, n){
  const d=new Date(dateStr+'T12:00:00'); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

async function loadMenu(){
  // carico solo i giorni da oggi in avanti
  const today = menuToday();
  const { data } = await sb.from('menu_entries').select('*')
    .eq('household_id', state.household.id)
    .gte('entry_date', today).order('entry_date');
  casaState.menu = data||[];
  // se ci sono giorni pianificati oltre i 3 di default, mostrali tutti
  if(casaState.menu.length){
    const last = casaState.menu[casaState.menu.length-1].entry_date;
    const diff = Math.round((new Date(last+'T12:00:00') - new Date(today+'T12:00:00'))/86400000);
    menuDaysCount = Math.max(menuDaysCount, diff+1);
  }
}
function menuEntry(dateStr, meal){
  return casaState.menu.find(m=>m.entry_date===dateStr && m.meal===meal);
}
function menuDayLabel(dateStr){
  const today=menuToday();
  if(dateStr===today) return 'Oggi';
  if(dateStr===menuAddDays(today,1)) return 'Domani';
  const d=new Date(dateStr+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'short'});
  return d.charAt(0).toUpperCase()+d.slice(1);
}

function renderMenu(){
  const wrap=$('casa-menu-list'); wrap.innerHTML='';
  const today=menuToday();
  for(let i=0;i<menuDaysCount;i++){
    const dateStr=menuAddDays(today,i);
    const day=document.createElement('div'); day.className='menu-day';
    let html=`<div class="dh">${menuDayLabel(dateStr)}</div>`;
    MEALS.forEach(([meal,mlabel])=>{
      const e=menuEntry(dateStr,meal);
      const dish = e?.dish ? `<div class="md">${e.dish}${e.variant_note?`<div class="note">${e.variant_note}</div>`:''}</div>` : `<div class="md empty">— tocca per aggiungere —</div>`;
      html+=`<div class="menu-meal" data-date="${dateStr}" data-meal="${meal}"><span class="mt">${mlabel}</span>${dish}</div>`;
    });
    day.innerHTML=html;
    day.querySelectorAll('.menu-meal').forEach(mm=>{
      mm.onclick=()=>openMenuModal(mm.dataset.date, mm.dataset.meal);
    });
    wrap.appendChild(day);
  }
  // pulsante aggiungi giorno
  const addBtn=document.createElement('button');
  addBtn.className='btn-ghost'; addBtn.id='menu-add-day'; addBtn.textContent='+ Aggiungi giorno';
  addBtn.style.marginTop='4px';
  addBtn.onclick=()=>{ menuDaysCount++; renderMenu(); };
  wrap.appendChild(addBtn);
}

let editingMenu = null;
function openMenuModal(dateStr, meal){
  editingMenu = { dateStr, meal };
  const e=menuEntry(dateStr, meal);
  const mealLabel = MEALS.find(([m])=>m===meal)[1];
  $('menu-modal-title').textContent = `${menuDayLabel(dateStr)} · ${mealLabel}`;
  $('mn-dish').value = e?.dish || '';
  $('mn-note').value = e?.variant_note || '';
  $('mn-clear').style.display = e ? 'block' : 'none';
  clearError('mn-error');
  $('menu-modal').classList.remove('hidden');
}
function closeMenuModal(){ $('menu-modal').classList.add('hidden'); }
$('mn-cancel').addEventListener('click', closeMenuModal);
$('menu-modal').addEventListener('click', e=>{ if(e.target.id==='menu-modal') closeMenuModal(); });

$('mn-save').addEventListener('click', async ()=>{
  const dish=$('mn-dish').value.trim();
  if(!dish){ showError('mn-error','Inserisci un piatto o usa Svuota.'); return; }
  const { dateStr, meal } = editingMenu;
  const existing = menuEntry(dateStr, meal);
  // weekday lo calcolo per compatibilità con la colonna esistente
  let wd=new Date(dateStr+'T12:00:00').getDay(); wd=wd===0?7:wd;
  const payload = { household_id:state.household.id, entry_date:dateStr, weekday:wd, meal, dish, variant_note:$('mn-note').value.trim()||null };
  let error;
  if(existing){ ({error}=await sb.from('menu_entries').update(payload).eq('id', existing.id)); }
  else { ({error}=await sb.from('menu_entries').insert(payload)); }
  if(error){ showError('mn-error','Errore: '+error.message); return; }
  closeMenuModal(); await loadMenu(); renderMenu();
});
$('mn-clear').addEventListener('click', async ()=>{
  const { dateStr, meal } = editingMenu;
  const existing = menuEntry(dateStr, meal);
  if(existing){ await sb.from('menu_entries').delete().eq('id', existing.id); }
  closeMenuModal(); await loadMenu(); renderMenu();
});

// ============================================================
