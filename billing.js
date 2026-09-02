(function(){
  'use strict';
  let prices=[],draft=null,dirty=false,busy=false,generation=0;
  const priceEdits=new Map();
  const money=value=>new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:2}).format(value);
  const allowed=()=>session?.role==='manager';
  function setBusy(value){busy=value;$('#budgetForm').inert=value;$('#budgetPriceList').inert=value;$('#budgetOpen').disabled=value;$('#budgetSheet').disabled=value;}
  const message=(text,error=false)=>{ $('#budgetStatus').textContent=text;$('#budgetStatus').classList.toggle('budget-warning',error); };
  function reset(){generation++;$('#budgetCatalog').innerHTML='<option value="">Válassz tételt</option>';prices=[];priceEdits.clear();draft=null;dirty=false;setBusy(false);$('#budgetSave').disabled=false;$('#budgetView').hidden=true;$('#budgetForm').hidden=true;$('#budgetPriceList').innerHTML='';$('#budgetItems').innerHTML='';$('#budgetSheet').innerHTML='<option value="">Válassz munkalapot</option>';$('#budgetNotes').value='';$('#budgetTotal').textContent='';$('#budgetFlat').textContent='';$('#budgetHeading').textContent='';message('');}
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
    $('#budgetCatalog').innerHTML='<option value="">Válassz tételt</option>'+prices.map(p=>`<option value="${escapeHTML(p.code)}">${escapeHTML(p.label+' · '+p.unit+' · '+money(p.unit_price)+(p.confirmed?'':' · ellenőrizendő'))}</option>`).join('');
    $('#budgetCatalog').value=selected;
    $('#budgetPriceList').innerHTML=prices.map(row=>({...row,...priceEdits.get(row.code)})).map(p=>`<div class="budget-price" data-price="${escapeHTML(p.code)}"><label>${escapeHTML(p.label)} <small>(${escapeHTML(p.unit)})</small><input data-price-value type="number" min="0" max="100000000" step="0.01" value="${escapeHTML(p.unit_price)}"></label><label class="budget-check"><input data-price-confirmed type="checkbox" ${p.confirmed?'checked':''}>Egyeztetett ár</label><button type="button" data-save-price>Mentés</button></div>`).join('');
  }
  async function show(){
    if(!allowed()||busy)return;const current=++generation,owner=session;message('Betöltés…');
    try{
      if(!officeLoaded) await loadOfficeWorksheets();
      const loaded=await MunkalapDB.billingPrices();if(current!==generation||session!==owner)return;
      prices=loaded;renderPrices();filterPrices();
      const selected=$('#budgetSheet').value;
      $('#budgetSheet').innerHTML='<option value="">Válassz munkalapot</option>'+worksheets.map(w=>`<option value="${escapeHTML(w.id)}">${escapeHTML(formatHungarianDate(w.date)+' · '+w.customer+' · '+w.address+' · '+w.leader)}</option>`).join('');
      $('#budgetSheet').value=worksheets.some(w=>w.id===selected)?selected:'';message('');
    }catch(e){if(current===generation)message('Nem sikerült betölteni: '+e.message,true);}
  }
  function renderDraft(){
    const s=draft.source_snapshot;
    $('#budgetForm').hidden=false;$('#budgetHeading').textContent=`${s.customer} · ${s.address} · ${formatHungarianDate(s.date)}`;
    const flat=s.billingMode==='flat_monthly';$('#budgetFlat').hidden=!flat;
    $('#budgetFlat').textContent=flat?`Havi átalány: ${s.monthlyFlatFee==null?'nincs megadva':money(s.monthlyFlatFee)} – az ügyfél összes helyszínére együtt. A lenti számítás összehasonlításra szolgál, nem adódik automatikusan az átalányhoz.`:'';
    $('#budgetItems').innerHTML=draft.items.map((item,i)=>`<fieldset class="budget-item" data-item="${i}"><legend>${i+1}. tétel</legend><label class="budget-item-name">Megnevezés<input data-field="label" maxlength="500" required value="${escapeHTML(item.label)}"></label><label>Mennyiség (${escapeHTML(item.unit)})<input data-field="quantity" type="number" min="0" max="1000000" step="0.001" required value="${escapeHTML(item.quantity)}"></label><label>Egységár (${Number(item.divisor)===60?'Ft / fő / óra':'Ft'})<input data-field="unitPrice" type="number" min="0" max="100000000" step="0.01" required value="${escapeHTML(item.unitPrice)}"></label><label class="budget-check"><input data-field="reviewed" type="checkbox" ${item.reviewed?'checked':''}>Tétel ellenőrizve</label><button type="button" data-remove-item="${i}">Tétel eltávolítása</button></fieldset>`).join('');
    $('#budgetNotes').value=draft.notes;$('#budgetState').value=draft.status;renderTotal();
  }
  function renderTotal(){try{$('#budgetTotal').textContent=money(BillingMath.total(draft.items));}catch(e){$('#budgetTotal').textContent='Ellenőrizd a mennyiségeket és az árakat.';}}
  async function open(id){
    if(!allowed()||!id||!canLeave())return;const owner=session,current=++generation;setBusy(true);message('Elszámolás betöltése…');
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
  $('#budgetOpen').addEventListener('click',()=>open($('#budgetSheet').value));
  $('#budgetSheet').addEventListener('change',()=>{
    const same=Boolean(draft&&draft.worksheet_id===$('#budgetSheet').value);
    $('#budgetForm').hidden=!same;
    message(same?'': 'A kiválasztott munkalaphoz nyomd meg az Elszámolás megnyitása gombot.');
  });
  $('#budgetAddCatalog').addEventListener('click',()=>{
    if(!allowed()||!draft||busy)return;
    const price=prices.find(p=>p.code===$('#budgetCatalog').value);
    if(!price){message('Válassz tételt az árlistából.',true);return;}
    if(draft.items.length>=200){message('Legfeljebb 200 tétel menthető.',true);return;}
    draft.items.push({label:price.label,quantity:price.code==='labor'?'60':'1',unit:price.code==='labor'?'főperc':price.unit,unitPrice:String(price.unit_price),divisor:price.code==='labor'?60:1,reviewed:false});
    draft.status='draft';dirty=true;renderDraft();message('Tétel hozzáadva. Ellenőrizd a mennyiséget.');
  });
  $('#budgetAdd').addEventListener('click',()=>{if(!allowed()||!draft||busy)return;draft.items.push({label:'',quantity:'1',unit:'tétel',unitPrice:'0',divisor:1,reviewed:false});draft.status='draft';dirty=true;renderDraft();});
  $('#budgetItems').addEventListener('input',event=>{if(!allowed()||!draft||busy)return;const row=event.target.closest('[data-item]'),field=event.target.dataset.field;if(!row||!field)return;const item=draft.items[Number(row.dataset.item)];item[field]=field==='reviewed'?event.target.checked:event.target.value;if(field!=='reviewed'){item.reviewed=false;row.querySelector('[data-field="reviewed"]').checked=false;}draft.status='draft';$('#budgetState').value='draft';dirty=true;renderTotal();});
  $('#budgetItems').addEventListener('click',event=>{const button=event.target.closest('[data-remove-item]');if(!button||busy||!allowed())return;if(!confirm('Eltávolítod ezt a tételt az elszámolásból?'))return;draft.items.splice(Number(button.dataset.removeItem),1);draft.status='draft';dirty=true;renderDraft();});
  $('#budgetNotes').addEventListener('input',()=>{if(draft){draft.notes=$('#budgetNotes').value;dirty=true;}});
  $('#budgetState').addEventListener('change',()=>{if(draft){draft.status=$('#budgetState').value;dirty=true;}});
  $('#budgetForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!allowed()||!draft||busy)return;const owner=session,current=generation;
    try{
      draft.total=BillingMath.total(draft.items);
      if(draft.items.length>200)throw new Error('Legfeljebb 200 tétel menthető.');
      if(draft.status==='ready'&&(!draft.items.length||draft.items.some(i=>!i.reviewed)))throw new Error('Előbb minden tételt és egységárat ellenőrizz.');
      setBusy(true);$('#budgetSave').disabled=true;const saved=await MunkalapDB.saveBillingDraft(draft);
      if(owner!==session||current!==generation)return;
      draft=saved;dirty=false;message('Elszámolás mentve.');renderDraft();
    }catch(e){if(current===generation)message('A mentés nem sikerült: '+e.message,true);}finally{if(current===generation){setBusy(false);$('#budgetSave').disabled=false;}}
  });
  $('#budgetPriceList').addEventListener('click',async event=>{
    const button=event.target.closest('[data-save-price]');if(!button||busy||!allowed())return;const row=button.closest('[data-price]'),price=prices.find(p=>p.code===row.dataset.price),owner=session,current=generation;
    try{const unit_price=BillingMath.decimal(row.querySelector('[data-price-value]').value,2,100000000);setBusy(true);button.disabled=true;
      const saved=await MunkalapDB.saveBillingPrice({...price,...priceEdits.get(price.code),unit_price,confirmed:row.querySelector('[data-price-confirmed]').checked});
      if(owner!==session||current!==generation)return;prices=prices.map(p=>p.code===saved.code?saved:p);priceEdits.delete(saved.code);renderPrices();message('Egységár mentve. A korábbi elszámolások változatlanok.');
    }catch(e){if(current===generation)message('Az ár mentése nem sikerült: '+e.message,true);}finally{if(current===generation){setBusy(false);button.disabled=false;}}
  });
  $('#budgetPriceList').addEventListener('input',event=>{const row=event.target.closest('[data-price]');if(!row||busy||!allowed())return;priceEdits.set(row.dataset.price,{updated_at:priceEdits.get(row.dataset.price)?.updated_at||prices.find(p=>p.code===row.dataset.price).updated_at,unit_price:row.querySelector('[data-price-value]').value,confirmed:row.querySelector('[data-price-confirmed]').checked});});
  window.addEventListener('beforeunload',event=>{if(hasUnsaved()&&allowed()){event.preventDefault();event.returnValue='';}});
  window.Billing={show,open,reset,canLeave,hasUnsaved};
})();
