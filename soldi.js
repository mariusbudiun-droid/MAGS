// ============================================================
// MAGS — Sezione Soldi (finanze)
// conti, categorie, movimenti, budget, bollette, obiettivi
// ============================================================
const soldi = { accounts: [], categories: [], transactions: [], budgets: [], bills: [], goals: [] };

// palette per le icone-categoria (come nel mockup)
const CAT_PALETTE = ['#5b6cff','#ffaa3c','#22b8a6','#ff5e9c','#9d7bff','#ff7a4f','#1fb46b','#5ea8ff'];
function catColor(cat){
  const i = soldi.categories.findIndex(c=>c.id===cat?.id);
  return CAT_PALETTE[(i<0?0:i) % CAT_PALETTE.length];
}

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
  // bollette: nascondi quelle la cui scadenza è passata da più di 30 giorni
  const limite = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  soldi.bills = (bills||[]).filter(b => !b.next_due || b.next_due >= limite);
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
    const col=catColor(c);
    const row=document.createElement('div'); row.className='cat';
    row.innerHTML=`<div class="ci" style="background:color-mix(in srgb,${col} 18%,transparent)">${c?.icon||'💸'}</div>
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

// ---------- BUSTE (ex budget) ----------
function renderBudget(){
  const wrap=$('sol-budgetlist'); wrap.innerHTML='';
  if(soldi.budgets.length===0){ wrap.innerHTML='<div class="sol-empty">Nessuna busta. Tocca + Nuova per crearne una.</div>'; return; }
  soldi.budgets.forEach(b=>{
    const c=catById(b.category_id);
    const col=catColor(c);
    const bal=+b.balance||0;
    const limit=+b.monthly_limit||0;
    const usato=Math.max(0, limit-bal);
    const pct=limit>0?Math.min(100,Math.round(usato/limit*100)):0;
    const vuota=bal<=0;
    const sforata=bal<0;
    const item=document.createElement('div'); item.className='budget-item';
    item.innerHTML=`<div class="bh"><span>${c?.icon||'🧧'} ${c?c.name:'?'}</span>
      <span class="amt" style="${sforata?'color:#e23b5a':''}">${eur(bal)} <span style="color:var(--ink-soft);font-weight:600">disp.</span></span></div>
      <div class="bar"><i style="width:${pct}%;background:${vuota?'#e23b5a':col}"></i></div>
      <div class="bsub">${sforata?'⚠️ busta sforata · ':''}nella busta ${eur(bal)} di ${eur(limit)} · tocca per gestire</div>`;
    item.style.cursor='pointer';
    item.onclick=()=>openBustaDetail(b);
    wrap.appendChild(item);
  });
}

let currentBusta=null;
function openBustaDetail(b){
  currentBusta=b;
  const c=catById(b.category_id);
  const col=catColor(c);
  const bal=+b.balance||0, limit=+b.monthly_limit||0;
  const usato=Math.max(0,limit-bal);
  const pct=limit>0?Math.min(100,Math.round(usato/limit*100)):0;
  const sforata=bal<0;
  $('busta-title').textContent=`${c?.icon||'🧧'} ${c?c.name:'Busta'}`;
  $('busta-head').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-family:var(--mono);font-size:22px;font-weight:800;${sforata?'color:#e23b5a':''}">${eur(bal)}</span>
      <span style="color:var(--ink-soft);font-size:13px;">di ${eur(limit)}</span>
    </div>
    <div class="bar" style="margin-top:8px;"><i style="width:${pct}%;background:${bal<=0?'#e23b5a':col}"></i></div>
    <div style="color:var(--ink-soft);font-size:12px;margin-top:6px;">${sforata?'⚠️ busta sforata · ':''}usato ${eur(usato)} questo ciclo</div>`;
  // movimenti collegati a questa busta (entrate e uscite)
  const txs=soldi.transactions.filter(t=>t.from_budget===b.id||t.to_budget===b.id);
  const list=$('busta-txlist');
  if(!txs.length){ list.innerHTML='<div class="sol-empty">Nessun movimento su questa busta.</div>'; }
  else {
    list.innerHTML='';
    txs.slice(0,60).forEach(t=>{
      const entra = t.to_budget===b.id; // soldi entrati nella busta
      const sign = entra?'pos':'neg';
      const pref = entra?'+':'−';
      const d=new Date((t.tx_date||'')+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
      const row=document.createElement('div'); row.className='tx';
      row.innerHTML=`<div><div class="ti">${t.description||'Movimento'}</div>
        <div class="tm">${d} · ${t.kind}</div></div>
        <div class="ta ${sign}">${pref}${eur(t.amount).replace('€ ','')}</div>`;
      list.appendChild(row);
    });
  }
  $('busta-modal').classList.remove('hidden');
}
$('busta-close').addEventListener('click', ()=>$('busta-modal').classList.add('hidden'));
$('busta-manage').addEventListener('click', ()=>{ $('busta-modal').classList.add('hidden'); if(currentBusta) manageBusta(currentBusta); });

async function manageBusta(b){
  const c=catById(b.category_id);
  const bal=+b.balance||0;
  const nome=c?c.name:'?';
  const scelta = prompt(
    `Busta "${nome}" — dentro ci sono ${eur(bal)} (budget ${eur(+b.monthly_limit||0)}).\n\n`+
    `Scrivi il NUMERO dell'azione:\n`+
    `1 — Aggiungi soldi dal conto\n`+
    `2 — Togli soldi e rimettili nel conto\n`+
    `3 — Reset busta (azzera e reimposta budget)\n`+
    `4 — Elimina busta`
  );
  if(scelta===null) return;
  const corrente=soldi.accounts.find(a=>a.kind==='comune')||soldi.accounts[0];
  const risparmi=soldi.accounts.find(a=>a.kind==='risparmi');
  const hid=state.household.id;
  const opt=scelta.trim();

  try{
    if(opt==='1'){
      const amt=parseFloat((prompt('Quanto aggiungere dal conto comune? (€)','0')||'0').replace(',','.'));
      if(!(amt>0)) return;
      await sb.from('budgets').update({ balance:bal+amt, monthly_limit:(+b.monthly_limit||0)+amt }).eq('id', b.id);
      if(corrente){ await sb.from('accounts').update({ balance:(+corrente.balance||0)-amt }).eq('id', corrente.id);
        await sb.from('transactions').insert({ household_id:hid, kind:'giroconto', amount:amt, from_account:corrente.id, to_budget:b.id, description:`Aggiunta busta ${nome}`, tx_date:new Date().toISOString().slice(0,10), member_id:state.me?state.me.id:null }); }

    } else if(opt==='2'){
      const amt=parseFloat((prompt('Quanto togliere e rimettere nel conto? (€)','0')||'0').replace(',','.'));
      if(!(amt>0)) return;
      const tolto=Math.min(amt, bal);
      await sb.from('budgets').update({ balance:bal-tolto }).eq('id', b.id);
      if(corrente){ await sb.from('accounts').update({ balance:(+corrente.balance||0)+tolto }).eq('id', corrente.id);
        await sb.from('transactions').insert({ household_id:hid, kind:'giroconto', amount:tolto, from_budget:b.id, to_account:corrente.id, description:`Prelievo busta ${nome}`, tx_date:new Date().toISOString().slice(0,10), member_id:state.me?state.me.id:null }); }

    } else if(opt==='3'){
      // RESET: i soldi attuali tornano al conto, poi azzera e reimposta budget
      const nuovo=parseFloat((prompt(`Reset busta "${nome}".\nNuovo budget mensile? (€)`, String(+b.monthly_limit||0))||'').replace(',','.'));
      if(isNaN(nuovo)||nuovo<0) return;
      // rimetti l'eventuale saldo residuo nel conto
      if(corrente && bal!==0){
        await sb.from('accounts').update({ balance:(+corrente.balance||0)+bal }).eq('id', corrente.id);
        await sb.from('transactions').insert({ household_id:hid, kind:'giroconto', amount:Math.abs(bal), from_budget:b.id, to_account:corrente.id, description:`Reset busta ${nome}`, tx_date:new Date().toISOString().slice(0,10), member_id:state.me?state.me.id:null });
      }
      // azzera il saldo e imposta il nuovo budget (NON riempie: lo riempi tu con "Aggiungi")
      await sb.from('budgets').update({ balance:0, monthly_limit:nuovo }).eq('id', b.id);
      alert(`Busta "${nome}" azzerata. Budget impostato a ${eur(nuovo)}.\nUsa "Aggiungi soldi" per riempirla.`);

    } else if(opt==='4'){
      // ELIMINA: chiedi dove vanno i soldi rimasti
      let dest='3';
      if(bal>0){
        dest = prompt(
          `Eliminare la busta "${nome}" — ci sono ancora ${eur(bal)}.\n\n`+
          `Dove vanno i soldi rimasti?\n`+
          `1 — Conto comune\n`+
          `2 — Risparmi\n`+
          `3 — Eliminali (spariscono)`
        );
        if(dest===null) return;
        dest=dest.trim();
      }
      if(bal>0 && dest==='1' && corrente){
        await sb.from('accounts').update({ balance:(+corrente.balance||0)+bal }).eq('id', corrente.id);
        await sb.from('transactions').insert({ household_id:hid, kind:'giroconto', amount:bal, from_budget:b.id, to_account:corrente.id, description:`Chiusura busta ${nome} → conto`, tx_date:new Date().toISOString().slice(0,10), member_id:state.me?state.me.id:null });
      } else if(bal>0 && dest==='2' && risparmi){
        await sb.from('accounts').update({ balance:(+risparmi.balance||0)+bal }).eq('id', risparmi.id);
        await sb.from('transactions').insert({ household_id:hid, kind:'giroconto', amount:bal, from_budget:b.id, to_account:risparmi.id, description:`Chiusura busta ${nome} → risparmi`, tx_date:new Date().toISOString().slice(0,10), member_id:state.me?state.me.id:null });
      }
      // scollega eventuali liste spesa che usano questa categoria
      if(c){ await sb.from('shopping_lists').update({ category_id:null }).eq('category_id', c.id); }
      // scollega le transazioni che referenziano questa busta (altrimenti la FK blocca la delete)
      await sb.from('transactions').update({ from_budget:null }).eq('from_budget', b.id);
      await sb.from('transactions').update({ to_budget:null }).eq('to_budget', b.id);
      // ora elimina la busta e verifica l'esito
      const { error: delErr } = await sb.from('budgets').delete().eq('id', b.id);
      if(delErr){ alert('Non riesco a eliminare la busta: '+delErr.message); return; }
      alert(`Busta "${nome}" eliminata.`);

    } else { return; }

    await loadSoldiAll(); renderBudget(); renderConti(); renderPanoramica(); renderCategorie();
  }catch(err){ alert('Errore: '+(err.message||err)); }
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
      <div class="bill-mid"><div class="bn">${b.name}</div><div class="bm">in scadenza${b.auto_debit?' · domiciliato':''}</div></div>
      <div class="bill-right"><div class="ba">${b.amount?eur(b.amount):'—'}</div>
      <button class="bill-pay" data-id="${b.id}">Pagato</button></div>`;
    row.querySelector('.bill-mid').onclick=()=>openBillModal(b);
    row.querySelector('.bd').onclick=()=>openBillModal(b);
    row.querySelector('.bill-pay').onclick=(e)=>{ e.stopPropagation(); payBill(b); };
    wrap.appendChild(row);
  });
}

// ============================================================
// ALLERTE SCADENZE (popup) + domiciliate automatiche
// ============================================================
let billAlertQueue = [];
let billAlertSnoozed = {}; // id → true (per questa sessione, "più tardi")

async function checkBillAlerts(){
  if(!soldi.bills || !soldi.bills.length) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const in3 = new Date(today); in3.setDate(in3.getDate()+3);
  const todayStr = today.toISOString().slice(0,10);

  // 1) domiciliate scadute → pagale da sole (con avviso)
  const autoPaid = [];
  for(const b of soldi.bills){
    if(!b.auto_debit) continue;
    if(!b.next_due || b.next_due > todayStr) continue;
    // importo: se variabile non possiamo indovinare → salta (la gestisci a mano)
    const amount = +b.amount||0;
    if(!amount || b.variable_amount) continue;
    // scala dal conto comune (o primo conto)
    const acc = soldi.accounts.find(a=>a.kind==='comune')||soldi.accounts[0];
    if(!acc) continue;
    await settleBill(b, amount, { kind:'acc', id:acc.id });
    autoPaid.push(`${b.name} (${eur(amount)})`);
  }
  if(autoPaid.length){
    await loadSoldiAll();
    alert('Domiciliazioni addebitate automaticamente:\n\n• '+autoPaid.join('\n• '));
  }

  // 2) manuali in scadenza (entro 3 giorni o già scadute) → coda popup
  billAlertQueue = soldi.bills.filter(b=>{
    if(b.auto_debit) return false;
    if(!b.next_due) return false;
    if(billAlertSnoozed[b.id]) return false;
    return b.next_due <= in3.toISOString().slice(0,10);
  });
  showNextBillAlert();
}

function showNextBillAlert(){
  if(!billAlertQueue.length){ $('billalert-modal').classList.add('hidden'); return; }
  const b = billAlertQueue[0];
  const due = new Date(b.next_due+'T12:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.round((due-today)/86400000);
  const when = days<0 ? `scaduta da ${-days} giorni` : days===0 ? 'scade oggi' : `scade tra ${days} giorni`;
  $('billalert-title').textContent = b.name;
  $('billalert-msg').textContent = `${b.amount?eur(b.amount):'Importo variabile'} · ${when}.`;
  $('billalert-modal').classList.remove('hidden');
}

$('billalert-pay').addEventListener('click', async ()=>{
  const b = billAlertQueue.shift();
  $('billalert-modal').classList.add('hidden');
  if(b) await payBill(b);
  showNextBillAlert();
});
$('billalert-later').addEventListener('click', ()=>{
  const b = billAlertQueue.shift();
  if(b) billAlertSnoozed[b.id]=true; // non ripresentare in questa sessione
  $('billalert-modal').classList.add('hidden');
  showNextBillAlert();
});

// segna una scadenza come pagata: scala da conto/busta, crea movimento, sposta avanti
async function payBill(b){
  const hid=state.household.id;
  // importo: fisso salvato, oppure chiedi se variabile o mancante
  let amount = +b.amount || 0;
  if(b.variable_amount || !amount){
    const raw = prompt(`Quanto hai pagato per "${b.name}"? (€)`, '');
    if(raw===null) return;
    amount = parseFloat((raw||'').replace(',','.'));
    if(isNaN(amount) || amount<=0){ alert('Importo non valido.'); return; }
  }
  // fonti: conti + buste
  const sources = [];
  soldi.accounts.forEach(a=> sources.push({ kind:'acc', id:a.id, label:`${a.icon||'🏦'} ${a.name} (${eur(+a.balance||0)})` }));
  soldi.budgets.forEach(bu=>{ const c=catById(bu.category_id); sources.push({ kind:'bud', id:bu.id, label:`✉️ ${c?c.name:'Busta'} (${eur(+bu.balance||0)})` }); });
  if(!sources.length){ alert('Nessun conto disponibile.'); return; }
  const menu = sources.map((s,i)=>`${i+1}. ${s.label}`).join('\n');
  const pick = prompt(`Pagare "${b.name}" — ${eur(amount)}\nDa dove prendo i soldi?\n\n${menu}\n\nScrivi il numero:`, '1');
  if(pick===null) return;
  const idx = parseInt(pick,10)-1;
  if(isNaN(idx) || idx<0 || idx>=sources.length){ alert('Scelta non valida.'); return; }
  const src = sources[idx];
  await settleBill(b, amount, src);
  alert(`✓ ${b.name} pagato — ${eur(amount)} scalati da ${src.label.replace(/\s*\(.*\)/,'')}.`);
}

// esegue il pagamento vero e proprio (movimento + saldo + avanzamento scadenza)
async function settleBill(b, amount, src){
  const hid=state.household.id;
  const today = new Date().toISOString().slice(0,10);
  if(src.kind==='acc'){
    const acc = soldi.accounts.find(a=>a.id===src.id);
    await sb.from('transactions').insert({ household_id:hid, kind:'uscita', amount, from_account:acc.id, category_id:b.category_id||null, description:`Pagamento ${b.name}`, tx_date:today, member_id:state.me?state.me.id:null });
    await sb.from('accounts').update({ balance:(+acc.balance||0)-amount }).eq('id', acc.id);
  } else {
    const bud = soldi.budgets.find(x=>x.id===src.id);
    await sb.from('transactions').insert({ household_id:hid, kind:'uscita', amount, from_budget:bud.id, category_id:b.category_id||null, description:`Pagamento ${b.name}`, tx_date:today, member_id:state.me?state.me.id:null });
    await sb.from('budgets').update({ balance:(+bud.balance||0)-amount }).eq('id', bud.id);
  }
  // avanza la scadenza secondo la frequenza (0 = una tantum → disattiva)
  const freq = (b.freq_months!=null) ? b.freq_months : 1;
  if(freq>0 && b.next_due){
    const nd=new Date(b.next_due+'T12:00:00'); nd.setMonth(nd.getMonth()+freq);
    await sb.from('recurring_bills').update({ next_due: nd.toISOString().slice(0,10) }).eq('id', b.id);
  } else if(freq===0){
    await sb.from('recurring_bills').update({ active:false }).eq('id', b.id);
  }
  await loadSoldiAll();
  renderBollette(); renderConti(); reloadBalances && reloadBalances();
}

// ---------- OBIETTIVI ----------
function renderObiettivi(){
  const wrap=$('sol-goallist'); wrap.innerHTML='';
  if(soldi.goals.length===0){ wrap.innerHTML='<div class="sol-empty">Nessun obiettivo. Tocca + Nuovo.</div>'; return; }
  soldi.goals.forEach((g,gi)=>{
    const cur=+g.current_amount||0, tgt=+g.target_amount||1;
    const pct=Math.min(100, Math.round(cur/tgt*100));
    const manca = Math.max(0, tgt-cur);
    const col = CAT_PALETTE[gi % CAT_PALETTE.length];
    const row=document.createElement('div'); row.className='goal';
    row.innerHTML=`<div class="gh"><span class="gn">${g.name}</span><span class="gv">${eur(cur)} / ${eur(tgt)}</span></div>
      <div class="bar"><i style="width:${pct}%;background:${col}"></i></div>
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
  // speso del mese per categoria (solo uscite)
  const spesoCat={};
  thisMonthTx().filter(t=>t.kind==='uscita').forEach(t=>{ const k=t.category_id||'_'; spesoCat[k]=(spesoCat[k]||0)+(+t.amount||0); });
  soldi.categories.forEach(c=>{
    const col=catColor(c);
    const speso=spesoCat[c.id]||0;
    const row=document.createElement('div'); row.className='cat';
    row.innerHTML=`<div class="ci" style="background:color-mix(in srgb,${col} 18%,transparent)">${c.icon||'💸'}</div>
      <div class="grow"><div class="cn">${c.name}</div><div class="cat-spent">${speso>0?eur(speso)+' questo mese':'—'}</div></div>
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
// opzioni "da/a" per sposta: tutti i conti + tutte le buste
function moveOptions(){
  const accs = soldi.accounts.map(a=>`<option value="acc:${a.id}">${a.icon||'🏦'} ${a.name}</option>`);
  const buds = soldi.budgets.map(b=>{ const c=catById(b.category_id); return `<option value="bud:${b.id}">🧧 Busta ${c?c.name:'?'}</option>`; });
  return [...accs, ...buds].join('');
}
function openTxModal(tx){
  editingTx = tx ? tx.id : null;
  $('tx-modal-title').textContent = tx ? 'Modifica movimento' : 'Nuovo movimento';
  let kind = tx ? (tx.kind==='giroconto'?'sposta':tx.kind) : 'uscita';
  $('tx-cat').innerHTML = soldi.categories.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  const accOpts = soldi.accounts.map(a=>`<option value="acc:${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('');
  const budOpts = soldi.budgets.map(b=>{ const c=catById(b.category_id); return `<option value="bud:${b.id}">🧧 Busta ${c?c.name:'?'}</option>`; }).join('');
  $('tx-account').innerHTML = accOpts + budOpts;
  $('tx-from').innerHTML = moveOptions();
  $('tx-to').innerHTML = moveOptions();
  $('tx-amount').value = tx ? tx.amount : '';
  $('tx-desc').value = tx ? (tx.description||'') : '';
  $('tx-cat').value = tx ? (tx.category_id||'') : (soldi.categories[0]?.id||'');
  $('tx-account').value = tx ? ('acc:'+(tx.account_id||'')) : ('acc:'+(soldi.accounts.find(a=>a.kind==='comune')?.id||soldi.accounts[0]?.id||''));
  $('tx-date').value = tx ? tx.tx_date : new Date().toISOString().slice(0,10);
  // se il movimento è su una busta, seleziona la busta nel dropdown
  if(tx && tx.from_budget) $('tx-account').value='bud:'+tx.from_budget;
  else if(tx && tx.to_budget && tx.kind==='entrata') $('tx-account').value='bud:'+tx.to_budget;
  $('tx-delete').style.display = tx ? 'block' : 'none';
  setTxKind(kind);
  clearError('tx-error');
  $('tx-modal').classList.remove('hidden');
}

// annulla l'effetto di un movimento sui saldi (ridà indietro i soldi)
async function revertTxEffect(tx){
  const amt=+tx.amount||0;
  if(tx.kind==='giroconto'){
    // sposta: rimetti all'origine, togli dalla destinazione
    if(tx.from_account){ const a=soldi.accounts.find(x=>x.id===tx.from_account); if(a) await sb.from('accounts').update({balance:(+a.balance||0)+amt}).eq('id',a.id); }
    if(tx.from_budget){ const b=soldi.budgets.find(x=>x.id===tx.from_budget); if(b) await sb.from('budgets').update({balance:(+b.balance||0)+amt}).eq('id',b.id); }
    if(tx.to_account){ const a=soldi.accounts.find(x=>x.id===tx.to_account); if(a) await sb.from('accounts').update({balance:(+a.balance||0)-amt}).eq('id',a.id); }
    if(tx.to_budget){ const b=soldi.budgets.find(x=>x.id===tx.to_budget); if(b) await sb.from('budgets').update({balance:(+b.balance||0)-amt}).eq('id',b.id); }
  } else if(tx.kind==='entrata'){
    if(tx.to_budget){ const b=soldi.budgets.find(x=>x.id===tx.to_budget); if(b) await sb.from('budgets').update({balance:(+b.balance||0)-amt}).eq('id',b.id); }
    else { const a=soldi.accounts.find(x=>x.id===tx.account_id); if(a) await sb.from('accounts').update({balance:(+a.balance||0)-amt}).eq('id',a.id); }
  } else { // uscita
    if(tx.from_budget){ const b=soldi.budgets.find(x=>x.id===tx.from_budget); if(b) await sb.from('budgets').update({balance:(+b.balance||0)+amt}).eq('id',b.id); }
    else { const bud=soldi.budgets.find(b=>b.category_id===tx.category_id); if(bud){ await sb.from('budgets').update({balance:(+bud.balance||0)+amt}).eq('id',bud.id); } else { const a=soldi.accounts.find(x=>x.id===tx.account_id); if(a) await sb.from('accounts').update({balance:(+a.balance||0)+amt}).eq('id',a.id); } }
  }
}
function setTxKind(k){
  document.querySelectorAll('#tx-kind .seg-opt').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  $('tx-modal').dataset.kind = k;
  const isSposta = k==='sposta';
  $('tx-cat-wrap').style.display = (k==='uscita') ? 'block' : 'none';
  $('tx-account-wrap').style.display = isSposta ? 'none' : 'block';
  $('tx-move-wrap').style.display = isSposta ? 'block' : 'none';
}
document.querySelectorAll('#tx-kind .seg-opt').forEach(b=>{
  b.onclick=()=>setTxKind(b.dataset.k);
});
$('tx-cancel').addEventListener('click', ()=>$('tx-modal').classList.add('hidden'));
$('tx-modal').addEventListener('click', e=>{ if(e.target.id==='tx-modal') $('tx-modal').classList.add('hidden'); });

// applica un giroconto: aggiorna i saldi di origine e destinazione
async function applyMove(fromVal, toVal, amount){
  const parse=(v)=>{ const [t,id]=v.split(':'); return {t,id}; };
  const f=parse(fromVal), t=parse(toVal);
  // scala dall'origine
  if(f.t==='acc'){ const a=soldi.accounts.find(x=>x.id===f.id); if(a) await sb.from('accounts').update({balance:(+a.balance||0)-amount}).eq('id',a.id); }
  else { const b=soldi.budgets.find(x=>x.id===f.id); if(b) await sb.from('budgets').update({balance:(+b.balance||0)-amount}).eq('id',b.id); }
  // aggiungi alla destinazione
  if(t.t==='acc'){ const a=soldi.accounts.find(x=>x.id===t.id); if(a) await sb.from('accounts').update({balance:(+a.balance||0)+amount}).eq('id',a.id); }
  else { const b=soldi.budgets.find(x=>x.id===t.id); if(b) await sb.from('budgets').update({balance:(+b.balance||0)+amount}).eq('id',b.id); }
  // registra il movimento
  await sb.from('transactions').insert({
    household_id:state.household.id, kind:'giroconto', amount,
    from_account: f.t==='acc'?f.id:null, to_account: t.t==='acc'?t.id:null,
    from_budget: f.t==='bud'?f.id:null, to_budget: t.t==='bud'?t.id:null,
    description:$('tx-desc').value.trim()||'Spostamento', tx_date:$('tx-date').value,
    member_id: state.me?state.me.id:null
  });
}

// ricarica i saldi correnti di conti e buste dal DB nello stato locale
async function reloadBalances(){
  const hid=state.household.id;
  const [{data:accs},{data:buds}]=await Promise.all([
    sb.from('accounts').select('*').eq('household_id',hid),
    sb.from('budgets').select('*').eq('household_id',hid),
  ]);
  if(accs) soldi.accounts=accs;
  if(buds) soldi.budgets=buds;
}

// elimina un movimento e ridà indietro i soldi
$('tx-delete').addEventListener('click', async ()=>{
  if(!editingTx) return;
  if(!confirm('Eliminare questo movimento? I soldi torneranno al conto/busta.')) return;
  const tx=soldi.transactions.find(t=>t.id===editingTx);
  try{
    if(tx) await revertTxEffect(tx);
    await sb.from('transactions').delete().eq('id', editingTx);
    $('tx-modal').classList.add('hidden');
    await openSoldi();
  }catch(err){ showError('tx-error','Errore: '+(err.message||err)); }
});

$('tx-save').addEventListener('click', async ()=>{
  clearError('tx-error');
  const kind = $('tx-modal').dataset.kind;
  const amount = parseFloat(($('tx-amount').value||'').replace(',','.'));
  if(!(amount>0)){ showError('tx-error','Inserisci un importo valido.'); return; }
  const hid = state.household.id;
  const btn=$('tx-save'); btn.disabled=true; btn.textContent='Salvataggio…';

  try{
    // se sto modificando, prima annullo l'effetto del movimento vecchio sui saldi
    if(editingTx){
      const oldTx = soldi.transactions.find(t=>t.id===editingTx);
      if(oldTx) await revertTxEffect(oldTx);
    }
    if(kind==='sposta'){
      if(editingTx) await reloadBalances();
      const fromVal=$('tx-from').value, toVal=$('tx-to').value;
      if(fromVal===toVal){ throw new Error('Origine e destinazione coincidono.'); }
      await applyMove(fromVal, toVal, amount);
    } else {
      // entrata/uscita — la fonte può essere un conto (acc:) o una busta (bud:)
      const sel = $('tx-account').value||'';
      const isBud = sel.startsWith('bud:');
      const selId = sel.split(':')[1]||null;
      const payload={
        household_id:hid, account_id: isBud ? null : selId,
        category_id: kind==='uscita' ? ($('tx-cat').value||null) : null,
        member_id: state.me?state.me.id:null, kind, amount,
        description:$('tx-desc').value.trim()||null, tx_date:$('tx-date').value,
      };
      // se è una busta, salvo il riferimento nel campo budget appropriato
      if(isBud){ if(kind==='uscita') payload.from_budget=selId; else payload.to_budget=selId; }
      let error;
      if(editingTx){ ({error}=await sb.from('transactions').update(payload).eq('id', editingTx)); }
      else { ({error}=await sb.from('transactions').insert(payload)); }
      if(error) throw error;
      // ricarico i saldi freschi (il revert ha già aggiornato il DB)
      if(editingTx){ await reloadBalances(); }
      // applico l'effetto del movimento (nuovo o modificato)
      {
        if(isBud){
          const bud=soldi.budgets.find(b=>b.id===selId);
          if(bud){ const delta=kind==='entrata'?amount:-amount; await sb.from('budgets').update({ balance:(+bud.balance||0)+delta }).eq('id', bud.id); }
        } else if(kind==='entrata'){
          const acc=soldi.accounts.find(a=>a.id===selId);
          if(acc) await sb.from('accounts').update({ balance:(+acc.balance||0)+amount }).eq('id', acc.id);
        } else {
          const bud = soldi.budgets.find(b=>b.category_id===payload.category_id);
          if(bud){ await sb.from('budgets').update({ balance:(+bud.balance||0)-amount }).eq('id', bud.id); }
          else { const acc=soldi.accounts.find(a=>a.id===selId); if(acc) await sb.from('accounts').update({ balance:(+acc.balance||0)-amount }).eq('id', acc.id); }
        }
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
  $('bill-name').value=b?b.name:''; $('bill-amount').value=b&&b.amount?b.amount:'';
  $('bill-due').value=b?b.next_due:new Date().toISOString().slice(0,10);
  $('bill-variable').checked = b ? !!b.variable_amount : false;
  $('bill-freq').value = b && b.freq_months!=null ? String(b.freq_months) : '1';
  $('bill-paytype').value = b && b.auto_debit ? 'auto' : 'manuale';
  $('bill-cat').innerHTML = '<option value="">— Senza categoria —</option>' +
    soldi.categories.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('');
  $('bill-cat').value = (b && b.category_id) ? b.category_id : '';
  $('bill-delete').style.display=b?'block':'none';
  clearError('bill-error'); $('bill-modal').classList.remove('hidden');
}
$('bill-cancel').addEventListener('click', ()=>$('bill-modal').classList.add('hidden'));
$('bill-modal').addEventListener('click', e=>{ if(e.target.id==='bill-modal') $('bill-modal').classList.add('hidden'); });
$('sol-add-bill').addEventListener('click', ()=>openBillModal(null));
$('bill-save').addEventListener('click', async ()=>{
  const name=$('bill-name').value.trim();
  const variable=$('bill-variable').checked;
  const amount=variable?null:(parseFloat(($('bill-amount').value||'').replace(',','.'))||null);
  if(!name){ showError('bill-error','Il nome è richiesto.'); return; }
  const payload={ household_id:state.household.id, name, amount,
    freq_months: parseInt($('bill-freq').value,10),
    variable_amount: variable,
    category_id: $('bill-cat').value || null,
    auto_debit: $('bill-paytype').value==='auto',
    next_due:$('bill-due').value, active:true };
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
// MODAL BUSTA (ex budget)
// ============================================================
const BUDGET_EMOJIS = ['🛒','🏠','💡','🚗','👶','🎉','🍕','✈️','💊','🎁','👕','📚','🐶','💰'];
let budgetEmoji = '🛒';
$('sol-add-budget').addEventListener('click', ()=>{
  budgetEmoji='🛒';
  $('budget-name').value='';
  $('budget-limit').value='';
  const ep=$('budget-emoji');
  ep.innerHTML = BUDGET_EMOJIS.map(e=>`<span class="emo${e===budgetEmoji?' on':''}" data-e="${e}">${e}</span>`).join('');
  ep.querySelectorAll('.emo').forEach(el=>{
    el.onclick=()=>{ ep.querySelectorAll('.emo').forEach(x=>x.classList.remove('on')); el.classList.add('on'); budgetEmoji=el.dataset.e; };
  });
  clearError('budget-error');
  $('budget-modal').classList.remove('hidden');
});
$('budget-cancel').addEventListener('click', ()=>$('budget-modal').classList.add('hidden'));
$('budget-modal').addEventListener('click', e=>{ if(e.target.id==='budget-modal') $('budget-modal').classList.add('hidden'); });
$('budget-save').addEventListener('click', async ()=>{
  clearError('budget-error');
  const name=$('budget-name').value.trim();
  const limit=parseFloat(($('budget-limit').value||'').replace(',','.'));
  if(!name){ showError('budget-error','Dai un nome alla busta.'); return; }
  if(!(limit>0)){ showError('budget-error','Inserisci quanto metterci dentro.'); return; }
  const hid=state.household.id;
  const corrente=soldi.accounts.find(a=>a.kind==='comune')||soldi.accounts[0];

  try{
    // crea (o riusa) la categoria con lo stesso nome
    let cat = soldi.categories.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(!cat){
      const { data: newCat, error: ce } = await sb.from('categories').insert({
        household_id:hid, name, icon:budgetEmoji, kind:'spesa'
      }).select().single();
      if(ce) throw ce;
      cat=newCat;
    }
    // crea la busta (budget) e riempila dal conto comune
    const { data: bud, error: be } = await sb.from('budgets').insert({
      household_id:hid, category_id:cat.id, monthly_limit:limit, balance:limit
    }).select().single();
    if(be) throw be;
    if(corrente){
      await sb.from('accounts').update({ balance:(+corrente.balance||0)-limit }).eq('id', corrente.id);
      await sb.from('transactions').insert({
        household_id:hid, kind:'giroconto', amount:limit,
        from_account:corrente.id, to_budget:bud.id,
        description:`Busta ${name}`, tx_date:new Date().toISOString().slice(0,10),
        member_id: state.me?state.me.id:null
      });
    }
    $('budget-modal').classList.add('hidden');
    await loadSoldiAll(); renderBudget(); renderConti(); renderPanoramica(); renderCategorie();
  }catch(err){ showError('budget-error','Errore: '+(err.message||err)); }
});

// ---- navigazione sottosezioni Soldi ----
document.querySelectorAll('#soldi-subnav .s').forEach(s=>{
  s.addEventListener('click', ()=>{
    document.querySelectorAll('#soldi-subnav .s').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    ['sol-pan','sol-mov','sol-bol','sol-obi','sol-con'].forEach(id=>$(id).classList.remove('on'));
    $(s.dataset.s).classList.add('on');
  });
});
