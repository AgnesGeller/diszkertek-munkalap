(function(){
  'use strict';
  let prices=[],draft=null,dirty=false,busy=false,generation=0,weekStart=startOfOfficeWeek(new Date()),allWeeks=false,savedDrafts=new Map();
  const priceEdits=new Map();
  const money=value=>new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0}).format(value);
  const cleanLabel=value=>String(value).replace(/^(Fenntartás|Építés\s*\/\s*fuvarozás)\s*[–-]\s*/i,'');
  const allowed=()=>session?.role==='manager';
  function setMode(mode){
    const pricesMode=mode==='prices';
    $('#budgetSettlementsPanel').hidden=pricesMode;$('#budgetPrices').hidden=!pricesMode;
    $('#budgetSettlementsTab').classList.toggle('active',!pricesMode);$('#budgetPricesTab').classList.toggle('active',pricesMode);
    if(!pricesMode){$('#budgetWorksheetPicker').hidden=Boolean(draft);$('#budgetForm').hidden=!draft;}
    message('');
  }
  function setBusy(value){busy=value;$('#budgetForm').inert=value;$('#budgetPriceList').inert=value;$('#budgetSheetList').inert=value;$('#budgetSheet').disabled=value;}
  const message=(text,error=false)=>{ for(const box of [$('#budgetStatus'),$('#budgetSaveStatus')]){box.textContent=text;box.classList.toggle('budget-warning',error);} };
  function reset(){generation++;draft=null;dirty=false;savedDrafts.clear();document.body.classList.remove('settlement-focus');setMode('settlements');weekStart=startOfOfficeWeek(new Date());allWeeks=false;$('#budgetSheetSearch').value='';$('#budgetPriceSearch').value='';$('#budgetSheetList').innerHTML='';$('#budgetSheetCount').textContent='';$('#budgetWeekLabel').textContent='';$('#budgetCatalog').innerHTML='<option value="">Válassz tételt</option>';prices=[];priceEdits.clear();setBusy(false);$('#budgetSave').disabled=false;$('#budgetView').hidden=true;$('#budgetForm').hidden=true;$('#budgetWorksheetPicker').hidden=false;$('#budgetPriceList').innerHTML='';$('#budgetItems').innerHTML='';$('#budgetSheet').innerHTML='<option value="">Válassz munkalapot</option>';$('#budgetNotes').value='';$('#budgetTotal').textContent='';$('#budgetFlat').textContent='';$('#budgetHeading').textContent='';message('');}
  const hasUnsaved=()=>dirty||busy||priceEdits.size>0;
  function filterPrices(){
    const key=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu').trim();
    const query=key($('#budgetPriceSearch').value);
    for(const row of $('#budgetPriceList').children)row.hidden=!key(row.textContent).includes(query);
  }
  $('#budgetPriceSearch').addEventListener('input',filterPrices);
  function canLeave(){return !busy&&(!hasUnsaved()||confirm('A költségvetésben nem mentett módosítások vannak. Elhagyod?'));}
  function renderPrices(){
    const selected=$('#budgetCatalog').value;
    const activePrices=prices.filter(p=>p.active!==false);
    $('#budgetCatalog').innerHTML='<option value="">Válassz tételt</option>'+activePrices.map(p=>`<option value="${escapeHTML(p.code)}">${escapeHTML(cleanLabel(p.label)+' · '+p.unit+' · '+money(p.unit_price)+(p.confirmed?'':' · ellenőrizendő'))}</option>`).join('');
    $('#budgetCatalog').value=selected;
    $('#budgetPriceList').innerHTML=activePrices.map(row=>({...row,...priceEdits.get(row.code)})).map(p=>`<div class="budget-price" data-price="${escapeHTML(p.code)}"><label>${escapeHTML(cleanLabel(p.label))} <small>(${escapeHTML(p.unit)})</small><input data-price-value type="number" min="0" max="100000000" step="0.01" value="${escapeHTML(p.unit_price)}"></label><label class="budget-check"><input data-price-confirmed type="checkbox" ${p.confirmed?'checked':''}>Egyeztetett ár</label><button type="button" data-save-price>Mentés</button><button type="button" class="budget-delete-price" data-remove-price>Törlés</button></div>`).join('');
  }
  async function show(){
    if(!allowed()||busy)return;const current=++generation,owner=session;message('Betöltés…');
    try{
      if(!officeLoaded) await loadOfficeWorksheets();
      const [loaded,allDrafts]=await Promise.all([MunkalapDB.billingPrices(),MunkalapDB.billingDrafts()]);if(current!==generation||session!==owner)return;
      prices=loaded;savedDrafts=new Map(allDrafts.map(row=>[row.worksheet_id,row]));renderPrices();filterPrices();
      renderSheetPicker();message('');
    }catch(e){if(current===generation)message('Nem sikerült betölteni: '+e.message,true);}
  }
  function renderDraft(){
    const s=draft.source_snapshot;
    document.body.classList.add('settlement-focus');$('#budgetWorksheetPicker').hidden=true;$('#budgetForm').hidden=false;$('#budgetHeading').textContent=`${s.customer} · ${s.address} · ${formatHungarianDate(s.date)}`;
    const flat=s.billingMode==='flat_monthly';$('#budgetFlat').hidden=!flat;
    $('#budgetFlat').textContent=flat?`Havi átalány: ${s.monthlyFlatFee==null?'nincs megadva':money(s.monthlyFlatFee)} – az ügyfél összes helyszínére együtt. A lenti számítás összehasonlításra szolgál, nem adódik automatikusan az átalányhoz.`:'';
    $('#budgetItems').innerHTML=draft.items.map((item,i)=>`<div class="budget-item" data-item="${i}"><b class="budget-item-number">${i+1}.</b><label class="budget-item-name"><span>Megnevezés</span><input data-field="label" maxlength="500" required value="${escapeHTML(cleanLabel(item.label))}"></label><label><span>Mennyiség (${escapeHTML(item.unit)})</span><input data-field="quantity" type="number" min="0" max="1000000" step="0.001" required value="${escapeHTML(item.quantity)}"></label><label><span>Egységár (${Number(item.divisor)===60?'Ft / fő / óra':'Ft'})</span><input data-field="unitPrice" type="number" min="0" max="100000000" step="0.01" required value="${escapeHTML(item.unitPrice)}"></label><span class="budget-line-total"><small>Összeg</small><b data-item-total></b></span><button type="button" data-remove-item="${i}" aria-label="Tétel eltávolítása">Törlés</button></div>`).join('');
    $('#budgetNotes').value=draft.notes;$('#budgetState').value=draft.status;renderStateHelp();$('#budgetResultActions').hidden=!draft.updated_at||draft.status==='draft';renderTotal();
  }
  function renderTotal(){try{$('#budgetTotal').textContent=money(BillingMath.total(draft.items));for(const [i,row] of [...$('#budgetItems').children].entries())row.querySelector('[data-item-total]').textContent=money(BillingMath.total([draft.items[i]]));}catch(e){$('#budgetTotal').textContent='Ellenőrizd a mennyiségeket és az árakat.';}}
  async function open(id){
    if(!allowed()||!id||!canLeave())return;const owner=session,current=++generation;setBusy(true);message('Elszámolás betöltése…');
    setMode('settlements');
    try{
      const item=worksheets.find(w=>w.id===id);if(!item)throw new Error('A munkalap nem található.');
      const saved=await MunkalapDB.billingDraft(id);if(current!==generation||session!==owner)return;
      const customer=customerDirectory.find(c=>c.id===item.customerId)||customerDirectory.find(c=>customerNameKey(c.fullName)===customerNameKey(item.customer));
      draft=saved||{worksheet_id:id,source_snapshot:{customer:item.customer,address:item.address,date:item.date,customerId:item.customerId,locationId:item.locationId,worksheetUpdatedAt:item.updatedAt,data:item.data,billingMode:customer?.billingMode||'per_job',monthlyFlatFee:customer?.monthlyFlatFee??null},items:BillingMath.build(item,prices),notes:'',status:'draft'};
      dirty=!saved;$('#budgetSheet').value=id;renderDraft();
      const stale=Boolean(saved&&saved.source_snapshot.worksheetUpdatedAt!==item.updatedAt);
      $('#budgetSourceWarning').hidden=!stale;$('#budgetSourceWarning').textContent=stale?'A munkalap az elszámolás mentése óta változott. Ellenőrizd az időket és a tételeket; a mentett árakat nem írtuk át.':'';
      message(saved?'Mentett elszámolás megnyitva.':'Az elszámolás még nincs mentve.');
    }catch(e){if(current===generation)message(e.message,true);}finally{if(current===generation)setBusy(false);}
  }
  function renderSheetPicker(){
    const query=String($('#budgetSheetSearch').value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu').trim();
    const from=dateToISO(weekStart),to=dateToISO(endOfOfficeWeek(weekStart));
    const shown=worksheets.filter(w=>(allWeeks||w.date>=from&&w.date<=to)&&[w.customer,w.address,w.leader,formatHungarianDate(w.date)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu').includes(query));
    $('#budgetWeekLabel').textContent=allWeeks?'Összes munkalap':`${shortHungarianDate(weekStart)} – ${shortHungarianDate(endOfOfficeWeek(weekStart))}`;
    $('#budgetSheetCount').textContent=`${shown.length} munkalap`;
    $('#budgetSheet').innerHTML='<option value="">Válassz munkalapot</option>'+worksheets.map(w=>`<option value="${escapeHTML(w.id)}"></option>`).join('');
    const state={draft:['● Piszkozat','draft'],ready:['✓ Ellenőrizve','ready'],sent:['✉ Elküldve','sent'],paid:['✓ Kifizetve','paid']};
    $('#budgetSheetList').innerHTML=shown.map(w=>{const saved=savedDrafts.get(w.id),badge=saved?state[saved.status]||state.draft:['Nincs elszámolás','empty'];return `<button type="button" data-open-sheet="${escapeHTML(w.id)}"><b>${escapeHTML(w.customer||'Névtelen ügyfél')}</b><span>${escapeHTML(w.address||'Cím nélkül')}</span><small>${escapeHTML(formatHungarianDate(w.date)+' · '+w.leader)}</small><em class="budget-sheet-state ${badge[1]}">${badge[0]}</em></button>`;}).join('')||'<p>Nincs munkalap ebben az időszakban vagy szűrésben.</p>';
    if(draft&&worksheets.some(w=>w.id===draft.worksheet_id))$('#budgetSheet').value=draft.worksheet_id;
  }
  $('#budgetSheetList').addEventListener('click',event=>{const button=event.target.closest('[data-open-sheet]');if(button)open(button.dataset.openSheet);});
  $('#budgetBack').addEventListener('click',()=>{if(!canLeave())return;generation++;draft=null;dirty=false;document.body.classList.remove('settlement-focus');$('#budgetForm').hidden=true;$('#budgetWorksheetPicker').hidden=false;$('#budgetItems').innerHTML='';$('#budgetSheet').value='';message('');renderSheetPicker();});
  $('#budgetSheetSearch').addEventListener('input',renderSheetPicker);
  $('#previousBudgetWeek').addEventListener('click',()=>{weekStart.setDate(weekStart.getDate()-7);allWeeks=false;renderSheetPicker();});
  $('#nextBudgetWeek').addEventListener('click',()=>{weekStart.setDate(weekStart.getDate()+7);allWeeks=false;renderSheetPicker();});
  $('#showAllBudgetWeeks').addEventListener('click',()=>{allWeeks=true;renderSheetPicker();});
  $('#budgetSettlementsTab').addEventListener('click',()=>setMode('settlements'));
  $('#budgetPricesTab').addEventListener('click',()=>setMode('prices'));
  $('#budgetAddCatalog').addEventListener('click',()=>{
    if(!allowed()||!draft||busy)return;
    const price=prices.find(p=>p.code===$('#budgetCatalog').value&&p.active!==false);
    if(!price){message('Válassz tételt az árlistából.',true);return;}
    if(draft.items.length>=200){message('Legfeljebb 200 tétel menthető.',true);return;}
    draft.items.push({label:price.label,quantity:price.code==='labor'?'60':'1',unit:price.code==='labor'?'főperc':price.unit,unitPrice:String(price.unit_price),divisor:price.code==='labor'?60:1,reviewed:false});
    draft.status='draft';dirty=true;renderDraft();$('#budgetResultActions').hidden=true;message('Tétel hozzáadva. Ellenőrizd a mennyiséget.');
  });
  $('#budgetAdd').addEventListener('click',()=>{if(!allowed()||!draft||busy)return;draft.items.push({label:'',quantity:'1',unit:'tétel',unitPrice:'0',divisor:1,reviewed:false});draft.status='draft';dirty=true;renderDraft();$('#budgetResultActions').hidden=true;});
  $('#budgetItems').addEventListener('input',event=>{if(!allowed()||!draft||busy)return;const row=event.target.closest('[data-item]'),field=event.target.dataset.field;if(!row||!field)return;const item=draft.items[Number(row.dataset.item)];item[field]=event.target.value;item.reviewed=false;draft.status='draft';$('#budgetState').value='draft';dirty=true;$('#budgetResultActions').hidden=true;message('A módosítás még nincs mentve.');renderTotal();});
  $('#budgetItems').addEventListener('click',event=>{const button=event.target.closest('[data-remove-item]');if(!button||busy||!allowed())return;if(!confirm('Eltávolítod ezt a tételt az elszámolásból?'))return;draft.items.splice(Number(button.dataset.removeItem),1);draft.status='draft';dirty=true;renderDraft();$('#budgetResultActions').hidden=true;});
  $('#budgetNotes').addEventListener('input',()=>{if(draft){draft.notes=$('#budgetNotes').value;dirty=true;$('#budgetResultActions').hidden=true;}});
  function renderStateHelp(){const text={draft:'Piszkozat: elmenthető, de még szerkesztés alatt áll.',ready:'Ellenőrizve: az elszámolás kész, PDF-be menthető és elküldhető.',sent:'Elküldve: az elszámolást már elküldtétek az ügyfélnek.',paid:'Kifizetve: az ügyfél kiegyenlítette az elszámolást.'};$('#budgetStateHelp').textContent=text[$('#budgetState').value]||'';}
  $('#budgetState').addEventListener('change',()=>{if(draft){draft.status=$('#budgetState').value;if(draft.status!=='draft')draft.items.forEach(item=>item.reviewed=true);renderStateHelp();dirty=true;$('#budgetResultActions').hidden=true;message('Az állapot megváltozott. Mentsd az elszámolást.');}});
  $('#budgetForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!allowed()||!draft||busy)return;const owner=session,current=generation;
    try{
      draft.total=BillingMath.total(draft.items);
      if(draft.items.length>200)throw new Error('Legfeljebb 200 tétel menthető.');
      if(draft.status!=='draft'&&(!draft.items.length||draft.items.some(i=>!i.reviewed)))throw new Error('Előbb minden tételt és egységárat ellenőrizz.');
      setBusy(true);$('#budgetSave').disabled=true;const saved=await MunkalapDB.saveBillingDraft(draft);
      if(owner!==session||current!==generation)return;
      draft=saved;savedDrafts.set(saved.worksheet_id,saved);dirty=false;message(draft.status==='draft'?'Piszkozat elmentve.':'Elszámolás mentve.');renderDraft();
    }catch(e){if(current===generation)message('A mentés nem sikerült: '+e.message,true);}finally{if(current===generation){setBusy(false);$('#budgetSave').disabled=false;}}
  });
  $('#budgetPriceList').addEventListener('click',async event=>{
    const removal=event.target.closest('[data-remove-price]');
    if(removal){
      if(busy||!allowed())return;
      const price=prices.find(p=>p.code===removal.closest('[data-price]').dataset.price),owner=session,current=generation;
      if(!confirm(`Törlöd az árlistából: ${cleanLabel(price.label)}? A mentett elszámolások megmaradnak.`))return;
      try{setBusy(true);const saved=await MunkalapDB.removeBillingPrice(price);
        if(owner!==session||current!==generation)return;
        prices=prices.map(p=>p.code===saved.code?saved:p);priceEdits.delete(saved.code);renderPrices();filterPrices();message('Tétel törölve az árlistából. A mentett elszámolások változatlanok.');
      }catch(e){if(current===generation)message('A törlés nem sikerült: '+e.message,true);}finally{if(current===generation)setBusy(false);}
      return;
    }
    const button=event.target.closest('[data-save-price]');if(!button||busy||!allowed())return;const row=button.closest('[data-price]'),price=prices.find(p=>p.code===row.dataset.price),owner=session,current=generation;
    try{const unit_price=BillingMath.decimal(row.querySelector('[data-price-value]').value,2,100000000);setBusy(true);button.disabled=true;
      const saved=await MunkalapDB.saveBillingPrice({...price,...priceEdits.get(price.code),unit_price,confirmed:row.querySelector('[data-price-confirmed]').checked});
      if(owner!==session||current!==generation)return;prices=prices.map(p=>p.code===saved.code?saved:p);priceEdits.delete(saved.code);renderPrices();message('Egységár mentve. A korábbi elszámolások változatlanok.');
    }catch(e){if(current===generation)message('Az ár mentése nem sikerült: '+e.message,true);}finally{if(current===generation){setBusy(false);button.disabled=false;}}
  });
  $('#budgetPriceList').addEventListener('input',event=>{const row=event.target.closest('[data-price]');if(!row||busy||!allowed())return;priceEdits.set(row.dataset.price,{updated_at:priceEdits.get(row.dataset.price)?.updated_at||prices.find(p=>p.code===row.dataset.price).updated_at,unit_price:row.querySelector('[data-price-value]').value,confirmed:row.querySelector('[data-price-confirmed]').checked});});
  async function printDraft(){
    if(!draft?.updated_at||draft.status==='draft'){message('Előbb válaszd az Ellenőrizve állapotot, majd mentsd el.',true);return;}
    renderSettlementDocument();
    const logo=$('#printSettlement img');
    if(logo&&!logo.complete)await Promise.race([new Promise(resolve=>{logo.addEventListener('load',resolve,{once:true});logo.addEventListener('error',resolve,{once:true});}),new Promise(resolve=>setTimeout(resolve,3000))]);
    document.body.classList.add('print-budget');const oldTitle=document.title;
    document.title=`Elszámolás-${draft.source_snapshot.customer}-${draft.source_snapshot.date}`;
    let done=false;const cleanup=()=>{if(done)return;done=true;document.body.classList.remove('print-budget');$('#printSettlement').hidden=true;document.title=oldTitle;};
    window.addEventListener('afterprint',cleanup,{once:true});setTimeout(cleanup,60000);window.print();
  }
  const number=value=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:2}).format(Number(value)||0);
  function settlementDetails(){
    const source=draft.source_snapshot,data=source.data||{};
    const customer=customerDirectory.find(c=>c.id===source.customerId)||customerDirectory.find(c=>customerNameKey(c.fullName)===customerNameKey(source.customer));
    const labor=draft.items.filter(item=>Number(item.divisor)===60),other=draft.items.filter(item=>Number(item.divisor)!==60);
    const teams=[];
    for(let i=1;i<=3;i++){
      const size=String(data[`team_${i}_size`]||'').trim(),from=String(data[`team_${i}_arrival`]||'').trim(),to=String(data[`team_${i}_departure`]||'').trim();
      if(!size&&!from&&!to)continue;
      const a=BillingMath.minutes(from),b=BillingMath.minutes(to),hours=a!==null&&b!==null&&b>a?(b-a)/60:null;
      teams.push(`Csapat ${i}: ${size||'?'} fő, ${from||'?'}–${to||'?'}${hours===null?'':` → ${number(hours)} óra`}`);
    }
    return {source,data,customer,labor,other,teams,laborHours:labor.reduce((sum,item)=>sum+Number(item.quantity||0)/60,0),laborTotal:BillingMath.total(labor),total:BillingMath.total(draft.items)};
  }
  function renderSettlementDocument(){
    const d=settlementDetails(),task=String(d.data.description||'').trim();
    const itemRows=d.other.map(item=>`<tr><td>${escapeHTML(cleanLabel(item.label))}</td><td>${escapeHTML(number(item.quantity))} ${escapeHTML(item.unit)}</td><td>${escapeHTML(money(Number(item.unitPrice)))}</td><td>${escapeHTML(money(BillingMath.total([item])))}</td></tr>`).join('');
    $('#printSettlement').innerHTML=`<header><img src="official-logo.png" alt="Díszkertek"><div><span>ELSZÁMOLÁS</span><b>${escapeHTML(formatHungarianDate(d.source.date))}</b></div></header><section class="settlement-customer"><p><small>Megrendelő</small><b>${escapeHTML(d.source.customer)}</b></p><p><small>Helyszín</small><b>${escapeHTML(d.source.address||'—')}</b></p></section>${task?`<section><h2>Elvégzett munka</h2><p>${escapeHTML(task)}</p></section>`:''}${d.teams.length?`<section><h2>Munkaidő</h2>${d.teams.map(line=>`<p>${escapeHTML(line)}</p>`).join('')}<p class="settlement-labor"><span>Munkadíj (${escapeHTML(number(d.laborHours))} munkaóra)</span><b>${escapeHTML(money(d.laborTotal))}</b></p></section>`:''}${itemRows?`<section><h2>Tételek</h2><table><thead><tr><th>Megnevezés</th><th>Mennyiség</th><th>Egységár</th><th>Összeg</th></tr></thead><tbody>${itemRows}</tbody></table></section>`:''}${draft.notes?`<section><h2>Megjegyzés</h2><p>${escapeHTML(draft.notes)}</p></section>`:''}<div class="settlement-total"><span>Összesen</span><b>${escapeHTML(money(d.total))}</b></div><footer><b>Köszönjük, hogy minket választott!</b><span>Díszkertek · www.diszkertek.hu · 06 70 634 9630 · info@diszkertek.hu</span></footer>`;
    const brandLogo=document.querySelector('.brand-logo');
    if(brandLogo?.currentSrc)$('#printSettlement img').src=brandLogo.currentSrc;
    $('#printSettlement').hidden=false;
  }
  async function emailDraft(){
    if(!draft?.updated_at||draft.status==='draft'){message('Előbb válaszd az Ellenőrizve állapotot, majd mentsd el.',true);return;}
    const d=settlementDetails();
    const greeting=String(d.customer?.contactName||d.source.customer).trim();
    const task=String(d.data.description||'').trim();
    const lines=d.other.map(item=>`${cleanLabel(item.label)}: ${number(item.quantity)} ${item.unit} × ${money(Number(item.unitPrice))} = ${money(BillingMath.total([item]))}`);
    const subject=`Díszkertek – elszámolás – ${d.source.customer} – ${formatHungarianDate(d.source.date)}`;
    const body=[`Kedves ${greeting}!`,'',`Ezúton küldöm a ${formatHungarianDate(d.source.date)}-én elvégzett munkák elszámolását.`,'',`Megrendelő: ${d.source.customer}`,`Cím: ${d.source.address||'—'}`,'',task?'Feladat leírás:':'',task,'',d.teams.length?'Munkaidő:':'',...d.teams,'',d.labor.length?'Munkadíj (összes munkaidő):':'',d.labor.length?`${number(d.laborHours)} óra = ${money(d.laborTotal)}`:'',lines.length?'':'',lines.length?'Tételek:':'',...lines,'','Összesen: '+money(d.total),draft.notes?`Megjegyzés: ${draft.notes}`:'','','Köszönjük, hogy minket választott!','','Díszkertek'].filter(Boolean).join('\n');
    const recipient=String(d.customer?.email||'').trim();
    try{await navigator.clipboard?.writeText(`Tárgy: ${subject}\n${recipient?`Címzett: ${recipient}\n`:''}\n${body}`);}catch(_){/* A megosztás ettől még működhet. */}
    if(navigator.share){
      try{await navigator.share({title:subject,text:body});message('Az e-mail szövegét átadtuk a kiválasztott alkalmazásnak.');return;}
      catch(error){if(error?.name==='AbortError'){message('A megosztást megszakítottad.');return;}}
    }
    message(recipient?'A levelezőprogram megnyitása…':'A levelezőprogram megnyitása… Válaszd ki a címzettet.');
    window.location.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  $('#budgetPrint').addEventListener('click',printDraft);
  $('#budgetEmail').addEventListener('click',emailDraft);
  window.addEventListener('beforeunload',event=>{if(hasUnsaved()&&allowed()){event.preventDefault();event.returnValue='';}});
  window.Billing={show,open,reset,canLeave,hasUnsaved};
})();
