// ============================================================
// MAGS — Sezione Soldi (finanze)
// conti, categorie, movimenti, budget, bollette, obiettivi
// ============================================================
const soldi = { accounts: [], categories: [], transactions: [], budgets: [], bills: [], goals: [] };

const DEFAULT_ACCOUNTS = [
  { name:'Conto comune', kind:'comune', icon:'🏦' },
  { name:'Risparmi', kind:'risparmi', icon:'🐷' },
];
const DEFAULT_CATEGORIES = [
  { name:'Casa', icon:'🏠' }, { name:'Spesa', icon:'🛒' },
  { name:'Bimbi', icon:'👶' }, { name:'Auto', icon:'🚗' },
  { name:'Bollette', icon:'💡' }, { name:'Svago', icon:'🎉' },
];

function eur(n){ return '€ ' + (Math.round((+n||0)*100)/100).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:2}); }

async function openSoldi(){
  await loadSoldiAll();
  renderPanoramica();
  renderMovimenti();
  renderBudget();
  renderBollette();
  renderObiettivi();
  renderConti();
  renderCategorie();
}

async function loadSoldiAll(){
  const hid = state.household.id;
  // conti — crea default se mancano
  let { data: acc } = await sb.from('accounts').select('*').eq('household_id', hid).order('sort_order');
  if(!acc || acc.length===0){
    const toIns = DEFAULT_ACCOUNTS.map((a,i)=>({ household_id:hid, name:a.name, kind:a.kind, icon:a.icon, sort_order:i, balance:0 }));
    ({ data: acc } = await sb.from('accounts').insert(toIns).select());
  }
  soldi.accounts = acc||[];
  // categorie — crea default se mancano
  let { data: cats } = await sb.from('categories').select('*').eq('household_id', hid).order('sort_order');
  if(!cats || cats.length===0){
    const toIns = DEFAULT_CATEGORIES.map((c,i)=>({ household_id:hid, name:c.name, icon:c.icon, kind:'spesa', sort_order:i }));
    ({ data: cats } = await sb.from('categories').insert(toIns).select());
  }
  soldi.categories = cats||[];

  const [{ data: tx }, { data: bud }, { data: bills }, { data: goals }] = await Promise.all([
    sb.from('transactions').select('*').eq('household_id', hid).order('tx_date',{ascending:false}).limit(100),
    sb.from('budgets').select('*').eq('household_id', hid),
    sb.from('recurring_bills').select('*').eq('household_id', hid).eq('active',true).order('next_due'),
    sb.from('savings_goals').select('*').eq('household_id', hid).order('sort_order'),
  ]);
  soldi.transactions = tx||[];
  soldi.budgets = bud||[];
  soldi.bills = bills||[];
  soldi.goals = goals||[];
}

function catById(id){ return soldi.categories.find(c=>c.id===id); }
function thisMonthTx(){
  const ym = new Date().toISOString().slice(0,7);
  return soldi.transactions.filter(t=> (t.tx_date||'').slice(0,7)===ym );
}

// ---------- PANORAMICA ----------
function renderPanoramica(){
  const total = soldi.accounts.reduce((s,a)=>s + (+a.balance||0), 0);
  $('sol-total').textContent = eur(total);
  const tm = thisMonthTx();
  const inc = tm.filter(t=>t.kind==='entrata').reduce((s,t)=>s+(+t.amount||0),0);
  const out = tm.filter(t=>t.kind==='uscita').reduce((s,t)=>s+(+t.amount||0),0);
  $('sol-in').textContent = eur(inc);
  $('sol-out').textContent = eur(out);

  // spese per categoria (mese)
  const wrap=$('sol-bycat'); wrap.innerHTML='';
  const byCat={};
  tm.filter(t=>t.kind==='uscita').forEach(t=>{ const k=t.category_id||'_'; byCat[k]=(byCat[k]||0)+(+t.amount||0); });
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(entries.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna spesa questo mese.</div>'; return; }
  entries.forEach(([cid,amt])=>{
    const c=catById(cid);
    const row=document.createElement('div'); row.className='cat';
    row.innerHTML=`<div class="ci">${c?.icon||'💸'}</div>
      <div><div class="cn">${c?c.name:'Senza categoria'}</div></div>
      <div class="camt">${eur(amt)}</div>`;
    wrap.appendChild(row);
  });
}

// ---------- MOVIMENTI ----------
function renderMovimenti(){
  const wrap=$('sol-txlist'); wrap.innerHTML='';
  if(soldi.transactions.length===0){ wrap.innerHTML='<div class="sol-empty">Nessun movimento. Tocca + per aggiungere.</div>'; return; }
  soldi.transactions.slice(0,60).forEach(t=>{
    const c=catById(t.category_id);
    const sign = t.kind==='entrata' ? 'pos' : (t.kind==='uscita'?'neg':'');
    const pref = t.kind==='entrata'?'+':(t.kind==='uscita'?'−':'');
    const d = new Date((t.tx_date||'')+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
    const row=document.createElement('div'); row.className='tx';
    row.innerHTML=`<div><div class="ti">${t.description||(c?c.name:'Movimento')}</div>
      <div class="tm">${d} · ${t.kind}${c?' · '+c.name:''}</div></div>
      <div class="ta ${sign}">${pref}${eur(t.amount).replace('€ ','')}</div>`;
    row.onclick=()=>openTxModal(t);
    wrap.appendChild(row);
  });
}

// ---------- BUDGET ----------
function renderBudget(){
  const wrap=$('sol-budgetlist'); wrap.innerHTML='';
  if(soldi.budgets.length===0){ wrap.innerHTML='<div class="sol-empty">Nessun budget impostato.</div>'; return; }
  const tm = thisMonthTx();
  soldi.budgets.forEach(b=>{
    const c=catById(b.category_id);
    const spent = tm.filter(t=>t.kind==='uscita'&&t.category_id===b.category_id).reduce((s,t)=>s+(+t.amount||0),0);
    const pct = Math.min(100, Math.round(spent/(+b.monthly_limit||1)*100));
    const over = spent > (+b.monthly_limit||0);
    const item=document.createElement('div'); item.className='budget-item';
    item.innerHTML=`<div class="bh"><span>${c?.icon||''} ${c?c.name:'?'}</span><span class="amt">${eur(spent)} / ${eur(b.monthly_limit)}</span></div>
      <div class="bar"><i style="width:${pct}%;background:${over?'#e23b5a':'var(--accent)'}"></i></div>`;
    wrap.appendChild(item);
  });
}

// ---------- BOLLETTE ----------
function renderBollette(){
  const wrap=$('sol-billlist'); wrap.innerHTML='';
  if(soldi.bills.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna scadenza. Tocca + per aggiungere.</div>'; return; }
  soldi.bills.forEach(b=>{
    const d=new Date((b.next_due||'')+'T12:00:00');
    const m=d.toLocaleDateString('it-IT',{month:'short'}); const day=d.getDate();
    const row=document.createElement('div'); row.className='bill';
    row.innerHTML=`<div class="bd"><div class="m">${m}</div><div class="d">${day}</div></div>
      <div><div class="bn">${b.name}</div><div class="bm">${b.frequency}${b.auto_debit?' · domiciliato':''}</div></div>
      <div class="ba">${eur(b.amount)}</div>`;
    row.onclick=()=>openBillModal(b);
    wrap.appendChild(row);
  });
}

// ---------- OBIETTIVI ----------
function renderObiettivi(){
  const wrap=$('sol-goallist'); wrap.innerHTML='';
  if(soldi.goals.length===0){ wrap.innerHTML='<div class="sol-empty">Nessun obiettivo. Tocca + Nuovo.</div>'; return; }
  soldi.goals.forEach(g=>{
    const cur=+g.current_amount||0, tgt=+g.target_amount||1;
    const pct=Math.min(100, Math.round(cur/tgt*100));
    const manca = Math.max(0, tgt-cur);
    const row=document.createElement('div'); row.className='goal';
    row.innerHTML=`<div class="gh"><span class="gn">${g.name}</span><span class="gv">${eur(cur)} / ${eur(tgt)}</span></div>
      <div class="bar"><i style="width:${pct}%;background:var(--accent)"></i></div>
      <div class="gp">${pct}% · ${manca>0?'mancano '+eur(manca):'completato'} · default ${(+g.default_pct||0)}%</div>`;
    row.onclick=()=>openGoalModal(g);
    wrap.appendChild(row);
  });
}

// ---------- CONTI + CATEGORIE ----------
function renderConti(){
  const wrap=$('sol-accountlist'); wrap.innerHTML='';
  soldi.accounts.forEach(a=>{
    const row=document.createElement('div'); row.className='acct';
    row.innerHTML=`<div class="ic">${a.icon||'🏦'}</div>
      <div><div class="an">${a.name}</div><div class="ah2">${a.kind==='risparmi'?'obiettivi di risparmio':'spese famiglia'}</div></div>
      <div class="av2">${eur(a.balance)}</div>`;
    wrap.appendChild(row);
  });
}
function renderCategorie(){
  const wrap=$('sol-catlist'); wrap.innerHTML='';
  soldi.categories.forEach(c=>{
    const row=document.createElement('div'); row.className='cat';
    row.innerHTML=`<div class="ci">${c.icon||'💸'}</div>
      <div class="grow"><div class="cn">${c.name}</div></div>
      <button class="del" title="Elimina">×</button>`;
    row.querySelector('.del').onclick=async ()=>{
      if(!confirm(`Eliminare la categoria "${c.name}"?`)) return;
      await sb.from('categories').delete().eq('id', c.id);
      await loadSoldiAll(); renderCategorie(); renderPanoramica();
    };
    wrap.appendChild(row);
  });
}

// ============================================================
// MODAL MOVIMENTO
// ============================================================
let editingTx=null;
function openTxModal(tx){
  editingTx = tx ? tx.id : null;
  $('tx-modal-title').textContent = tx ? 'Modifica movimento' : 'Nuovo movimento';
  // kind
  let kind = tx ? tx.kind : 'uscita';
  setTxKind(kind);
  // selects
  $('tx-cat').innerHTML = soldi.categories.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  $('tx-account').innerHTML = soldi.accounts.map(a=>`<option value="${a.id}">${a.icon||''} ${a.name}</option>`).join('');
  $('tx-goal-target').innerHTML = soldi.goals.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
  $('tx-amount').value = tx ? tx.amount : '';
  $('tx-desc').value = tx ? (tx.description||'') : '';
  $('tx-cat').value = tx ? (tx.category_id||'') : (soldi.categories[0]?.id||'');
  $('tx-account').value = tx ? (tx.account_id||'') : (soldi.accounts.find(a=>a.kind==='comune')?.id||'');
  $('tx-date').value = tx ? tx.tx_date : new Date().toISOString().slice(0,10);
  clearError('tx-error');
  $('tx-modal').classList.remove('hidden');
}
function setTxKind(k){
  document.querySelectorAll('#tx-kind .seg-opt').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  $('tx-modal').dataset.kind = k;
  // categoria nascosta per "risparmio"; conto forzato a risparmi
  $('tx-cat-wrap').style.display = (k==='risparmio') ? 'none' : 'block';
  $('tx-goal-wrap').style.display = (k==='risparmio') ? 'block' : 'none';
}
document.querySelectorAll('#tx-kind .seg-opt').forEach(b=>{
  b.onclick=()=>setTxKind(b.dataset.k);
});
$('tx-goal-mode').addEventListener('change', ()=>{
  $('tx-goal-target').style.display = $('tx-goal-mode').value==='manuale' ? 'block' : 'none';
});
$('tx-cancel').addEventListener('click', ()=>$('tx-modal').classList.add('hidden'));
$('tx-modal').addEventListener('click', e=>{ if(e.target.id==='tx-modal') $('tx-modal').classList.add('hidden'); });

$('tx-save').addEventListener('click', async ()=>{
  clearError('tx-error');
  const kind = $('tx-modal').dataset.kind;
  const amount = parseFloat(($('tx-amount').value||'').replace(',','.'));
  if(!(amount>0)){ showError('tx-error','Inserisci un importo valido.'); return; }
  const hid = state.household.id;
  const btn=$('tx-save'); btn.disabled=true; btn.textContent='Salvataggio…';

  try{
    if(kind==='risparmio'){
      // versamento ai risparmi: crea transazione + contributi obiettivi
      const acc = soldi.accounts.find(a=>a.kind==='risparmi');
      const { data: txRow, error: e1 } = await sb.from('transactions').insert({
        household_id:hid, account_id:acc?.id||null, kind:'giroconto', amount,
        description:$('tx-desc').value.trim()||'Versamento risparmi', tx_date:$('tx-date').value,
        member_id: state.me?state.me.id:null
      }).select().single();
      if(e1) throw e1;

      const mode=$('tx-goal-mode').value;
      let contribs=[];
      if(mode==='manuale'){
        const gid=$('tx-goal-target').value;
        if(!gid) throw new Error('Seleziona un obiettivo.');
        contribs=[{ household_id:hid, goal_id:gid, transaction_id:txRow.id, amount, mode:'manuale' }];
      } else {
        const active=soldi.goals.filter(g=>!g.completed && (+g.default_pct||0)>0);
        if(active.length===0) throw new Error('Nessun obiettivo con % impostata. Vai in Obiettivi.');
        contribs=active.map(g=>({ household_id:hid, goal_id:g.id, transaction_id:txRow.id, amount: Math.round(amount*(+g.default_pct)/100*100)/100, mode:'auto' }));
      }
      const { error: e2 } = await sb.from('savings_contributions').insert(contribs);
      if(e2) throw e2;
    } else {
      // entrata/uscita normale
      const payload={
        household_id:hid, account_id:$('tx-account').value||null, category_id:$('tx-cat').value||null,
        member_id: state.me?state.me.id:null, kind, amount,
        description:$('tx-desc').value.trim()||null, tx_date:$('tx-date').value,
      };
      let error;
      if(editingTx){ ({error}=await sb.from('transactions').update(payload).eq('id', editingTx)); }
      else { ({error}=await sb.from('transactions').insert(payload)); }
      if(error) throw error;
      // aggiorna saldo conto comune
      const acc=soldi.accounts.find(a=>a.id===payload.account_id);
      if(acc && acc.kind==='comune' && !editingTx){
        const delta = kind==='entrata'? amount : -amount;
        await sb.from('accounts').update({ balance:(+acc.balance||0)+delta }).eq('id', acc.id);
      }
    }
    $('tx-modal').classList.add('hidden');
    await openSoldi();
  }catch(err){
    showError('tx-error','Errore: '+(err.message||err));
  }
  btn.disabled=false; btn.textContent='Salva';
});
$('sol-add-tx').addEventListener('click', ()=>openTxModal(null));

// ============================================================
// MODAL BOLLETTA
// ============================================================
let editingBill=null;
function openBillModal(b){
  editingBill=b?b.id:null;
  $('bill-name').value=b?b.name:''; $('bill-amount').value=b?b.amount:'';
  $('bill-freq').value=b?b.frequency:'mensile'; $('bill-due').value=b?b.next_due:new Date().toISOString().slice(0,10);
  $('bill-delete').style.display=b?'block':'none';
  clearError('bill-error'); $('bill-modal').classList.remove('hidden');
}
$('bill-cancel').addEventListener('click', ()=>$('bill-modal').classList.add('hidden'));
$('bill-modal').addEventListener('click', e=>{ if(e.target.id==='bill-modal') $('bill-modal').classList.add('hidden'); });
$('sol-add-bill').addEventListener('click', ()=>openBillModal(null));
$('bill-save').addEventListener('click', async ()=>{
  const name=$('bill-name').value.trim();
  const amount=parseFloat(($('bill-amount').value||'').replace(',','.'));
  if(!name||!(amount>0)){ showError('bill-error','Nome e importo richiesti.'); return; }
  const payload={ household_id:state.household.id, name, amount, frequency:$('bill-freq').value, next_due:$('bill-due').value, active:true };
  let error;
  if(editingBill){ ({error}=await sb.from('recurring_bills').update(payload).eq('id', editingBill)); }
  else { ({error}=await sb.from('recurring_bills').insert(payload)); }
  if(error){ showError('bill-error','Errore: '+error.message); return; }
  $('bill-modal').classList.add('hidden'); await loadSoldiAll(); renderBollette();
});
$('bill-delete').addEventListener('click', async ()=>{
  if(editingBill){ await sb.from('recurring_bills').delete().eq('id', editingBill); }
  $('bill-modal').classList.add('hidden'); await loadSoldiAll(); renderBollette();
});

// ============================================================
// MODAL OBIETTIVO
// ============================================================
let editingGoal=null;
function openGoalModal(g){
  editingGoal=g?g.id:null;
  $('goal-name').value=g?g.name:''; $('goal-target').value=g?g.target_amount:''; $('goal-pct').value=g?g.default_pct:'';
  $('goal-delete').style.display=g?'block':'none';
  clearError('goal-error'); $('goal-modal').classList.remove('hidden');
}
$('goal-cancel').addEventListener('click', ()=>$('goal-modal').classList.add('hidden'));
$('goal-modal').addEventListener('click', e=>{ if(e.target.id==='goal-modal') $('goal-modal').classList.add('hidden'); });
$('sol-add-goal').addEventListener('click', ()=>openGoalModal(null));
$('goal-save').addEventListener('click', async ()=>{
  const name=$('goal-name').value.trim();
  const target=parseFloat(($('goal-target').value||'').replace(',','.'));
  const pct=parseFloat(($('goal-pct').value||'0').replace(',','.'))||0;
  if(!name||!(target>0)){ showError('goal-error','Nome e obiettivo richiesti.'); return; }
  const payload={ household_id:state.household.id, name, target_amount:target, default_pct:pct };
  let error;
  if(editingGoal){ ({error}=await sb.from('savings_goals').update(payload).eq('id', editingGoal)); }
  else { ({error}=await sb.from('savings_goals').insert(payload)); }
  if(error){ showError('goal-error','Errore: '+error.message); return; }
  $('goal-modal').classList.add('hidden'); await loadSoldiAll(); renderObiettivi(); renderConti();
});
$('goal-delete').addEventListener('click', async ()=>{
  if(editingGoal){ await sb.from('savings_goals').delete().eq('id', editingGoal); }
  $('goal-modal').classList.add('hidden'); await loadSoldiAll(); renderObiettivi(); renderConti();
});

// ============================================================
// MODAL CATEGORIA
// ============================================================
$('sol-add-cat').addEventListener('click', ()=>{
  $('cat-name').value=''; $('cat-icon').value=''; $('cat-delete').style.display='none';
  clearError('cat-error'); $('cat-modal').classList.remove('hidden');
});
$('cat-cancel').addEventListener('click', ()=>$('cat-modal').classList.add('hidden'));
$('cat-modal').addEventListener('click', e=>{ if(e.target.id==='cat-modal') $('cat-modal').classList.add('hidden'); });
$('cat-save').addEventListener('click', async ()=>{
  const name=$('cat-name').value.trim();
  if(!name){ showError('cat-error','Inserisci un nome.'); return; }
  const { error } = await sb.from('categories').insert({ household_id:state.household.id, name, icon:$('cat-icon').value.trim()||null, kind:'spesa', sort_order:soldi.categories.length });
  if(error){ showError('cat-error','Errore: '+error.message); return; }
  $('cat-modal').classList.add('hidden'); await loadSoldiAll(); renderCategorie();
});

// ============================================================
// MODAL BUDGET
// ============================================================
$('sol-add-budget').addEventListener('click', ()=>{
  $('budget-cat').innerHTML = soldi.categories.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  $('budget-limit').value=''; clearError('budget-error'); $('budget-modal').classList.remove('hidden');
});
$('budget-cancel').addEventListener('click', ()=>$('budget-modal').classList.add('hidden'));
$('budget-modal').addEventListener('click', e=>{ if(e.target.id==='budget-modal') $('budget-modal').classList.add('hidden'); });
$('budget-save').addEventListener('click', async ()=>{
  const cat=$('budget-cat').value;
  const limit=parseFloat(($('budget-limit').value||'').replace(',','.'));
  if(!cat||!(limit>0)){ showError('budget-error','Categoria e limite richiesti.'); return; }
  // upsert: se esiste aggiorna
  const existing=soldi.budgets.find(b=>b.category_id===cat);
  let error;
  if(existing){ ({error}=await sb.from('budgets').update({ monthly_limit:limit }).eq('id', existing.id)); }
  else { ({error}=await sb.from('budgets').insert({ household_id:state.household.id, category_id:cat, monthly_limit:limit })); }
  if(error){ showError('budget-error','Errore: '+error.message); return; }
  $('budget-modal').classList.add('hidden'); await loadSoldiAll(); renderBudget();
});

// ---- navigazione sottosezioni Soldi ----
document.querySelectorAll('#soldi-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#soldi-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['sol-pan','sol-mov','sol-bud','sol-bol','sol-obi','sol-con'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
  });
});
