(function(){
  'use strict';
  let drafts=[],generation=0;
  const money=value=>new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0}).format(Number(value)||0);
  const iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const allowed=()=>session?.role==='manager';
  function setRange(period){
    const now=new Date(),from=new Date(now),to=new Date(now);
    if(period==='week'){
      from.setDate(from.getDate()-((from.getDay()+2)%7));to.setTime(from.getTime());to.setDate(to.getDate()+6);
    }else if(period==='month'){
      from.setDate(1);to.setMonth(to.getMonth()+1,0);
    }else if(period==='year'){
      from.setMonth(0,1);to.setMonth(11,31);
    }
    $('#statisticsFrom').value=iso(from);$('#statisticsTo').value=iso(to);
    for(const button of document.querySelectorAll('[data-stat-period]'))button.classList.toggle('active',button.dataset.statPeriod===period);
    render();
  }
  function populateFilters(){
    const customerValue=$('#statisticsCustomer').value,locationValue=$('#statisticsLocation').value;
    const customers=[...new Set(drafts.map(row=>String(row.source_snapshot?.customer||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'hu'));
    const locations=[...new Set(drafts.map(row=>String(row.source_snapshot?.address||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'hu'));
    $('#statisticsCustomer').innerHTML='<option value="">Minden ügyfél</option>'+customers.map(value=>`<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
    $('#statisticsLocation').innerHTML='<option value="">Minden helyszín</option>'+locations.map(value=>`<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
    $('#statisticsCustomer').value=customers.includes(customerValue)?customerValue:'';$('#statisticsLocation').value=locations.includes(locationValue)?locationValue:'';
  }
  function render(){
    if(!allowed())return;
    const from=$('#statisticsFrom').value,to=$('#statisticsTo').value,customer=$('#statisticsCustomer').value,location=$('#statisticsLocation').value,state=$('#statisticsState').value;
    const shown=drafts.filter(row=>{const source=row.source_snapshot||{},date=String(source.date||'');return(!from||date>=from)&&(!to||date<=to)&&(!customer||source.customer===customer)&&(!location||source.address===location)&&(!state||row.status===state);});
    const sum=rows=>rows.reduce((total,row)=>total+Number(row.total||0),0);
    $('#statisticsCount').textContent=shown.length;$('#statisticsTotal').textContent=money(sum(shown));
    $('#statisticsSent').textContent=money(sum(shown.filter(row=>row.status==='sent'||row.status==='paid')));$('#statisticsPaid').textContent=money(sum(shown.filter(row=>row.status==='paid')));
    const groups=new Map();
    for(const row of shown){const source=row.source_snapshot||{},name=String(source.customer||'Névtelen ügyfél'),address=String(source.address||'Cím nélkül'),key=name+'\u0000'+address,current=groups.get(key)||{name,address,count:0,total:0,sent:0,paid:0};current.count++;current.total+=Number(row.total||0);if(row.status==='sent'||row.status==='paid')current.sent+=Number(row.total||0);if(row.status==='paid')current.paid+=Number(row.total||0);groups.set(key,current);}
    $('#statisticsRows').innerHTML=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'hu')||a.address.localeCompare(b.address,'hu')).map(row=>`<tr><td>${escapeHTML(row.name)}</td><td>${escapeHTML(row.address)}</td><td>${row.count}</td><td>${escapeHTML(money(row.total))}</td><td>${escapeHTML(money(row.sent))}</td><td>${escapeHTML(money(row.paid))}</td></tr>`).join('')||'<tr><td colspan="6">Nincs mentett elszámolás ebben a szűrésben.</td></tr>';
  }
  async function show(){
    if(!allowed())return;const current=++generation;$('#statisticsStatus').textContent='Betöltés…';
    try{drafts=await MunkalapDB.billingDrafts();if(current!==generation||!allowed())return;populateFilters();if(!$('#statisticsFrom').value)setRange('month');else render();$('#statisticsStatus').textContent='';}
    catch(error){if(current===generation)$('#statisticsStatus').textContent='A statisztika betöltése nem sikerült: '+error.message;}
  }
  function reset(){generation++;drafts=[];$('#statisticsFrom').value='';$('#statisticsTo').value='';$('#statisticsCustomer').innerHTML='<option value="">Minden ügyfél</option>';$('#statisticsLocation').innerHTML='<option value="">Minden helyszín</option>';$('#statisticsState').value='';$('#statisticsRows').innerHTML='';$('#statisticsStatus').textContent='';for(const id of ['statisticsCount','statisticsTotal','statisticsSent','statisticsPaid'])$('#'+id).textContent=id==='statisticsCount'?'0':'0 Ft';}
  document.querySelector('.statistics-periods').addEventListener('click',event=>{const button=event.target.closest('[data-stat-period]');if(button)setRange(button.dataset.statPeriod);});
  for(const id of ['statisticsFrom','statisticsTo','statisticsCustomer','statisticsLocation','statisticsState'])$('#'+id).addEventListener('change',()=>{for(const button of document.querySelectorAll('[data-stat-period]'))button.classList.remove('active');render();});
  window.Statistics={show,reset};
})();
