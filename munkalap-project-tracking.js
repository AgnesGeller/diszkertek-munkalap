// Optional add-on: it never intercepts submission or changes existing validation.
(() => {
  const form=document.querySelector('#worksheetForm');if(!form)return;
  const endpoint='https://cszsxjsiwaaibrocibyd.supabase.co/functions/v1/quote-work-sync';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:2}).format(v);
  const normalize=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('hu');
  const section=document.createElement('section');section.hidden=true;section.className='quote-project-tracking';
  section.setAttribute('aria-label','Projekt haladása');form.querySelector('.worktime')?.before(section);
  const hidden=document.createElement('input');hidden.type='hidden';hidden.name='quote_project_id';form.append(hidden);
  let lastKey='',generation=0,projects=[],lastRefresh=0,busy=false;
  function context(){
    if(window.MunkalapProjectContext)return window.MunkalapProjectContext();
    // These are the existing application's classic-script bindings; none is mutated.
    const current=typeof session==='undefined'?null:session;
    const customers=typeof customerDirectory==='undefined'?[]:customerDirectory;
    const selected=typeof selectedCustomerId==='undefined'?null:selectedCustomerId;
    const customer=customers.find(c=>c.id===selected)||customers.find(c=>normalize(c.fullName)===normalize(form.elements.customerName.value));
    return {signedIn:Boolean(current),customer_id:customer?.id,address:form.elements.address.value,
      work_date:typeof toDateInputValue==='function'?toDateInputValue(form.elements.date.value):null,
      preset_id:typeof editingId==='undefined'||!editingId?null:(typeof worksheets==='undefined'?[]:worksheets).find(r=>r.id===editingId)?.data?.quote_project_id};
  }
  function render(){
    section.hidden=!projects.length;
    if(!projects.length){hidden.value='';section.replaceChildren();return;}
    if(!projects.some(p=>p.id===hidden.value))hidden.value=projects.length===1?projects[0].id:'';
    const p=projects.find(p=>p.id===hidden.value);
    section.innerHTML=`<h2>Projekt haladása</h2><label>Projekt<select data-project-select><option value="">Projekt kiválasztása</option>${projects.map(x=>`<option value="${esc(x.id)}" ${x.id===hidden.value?'selected':''}>${esc(x.project_code)} – ${esc(x.name)}</option>`).join('')}</select></label>${p?`
      <p>Mentett munkalapok alapján</p>
      <label>Munka készültsége${p.completion===null?'<span>Készültségi adat hiányzik.</span>':`<progress max="100" value="${p.completion}"></progress><span>${number(p.completion)}%</span>`}</label>
      <label>Munkaórakeret felhasználása${p.time_percent===null?'<span>Az órakeret vagy a munkaidőadat ellenőrzése szükséges.</span>':`<progress max="100" value="${Math.min(100,p.time_percent)}"></progress><span>${number(p.time_percent)}% · ${number(p.hours)} / ${number(p.budget_hours)} főóra</span>`}</label>
      ${p.remaining_hours===null?'':`<p>${p.remaining_hours<0?'Túllépés: '+number(-p.remaining_hours):'Hátralévő: '+number(p.remaining_hours)} főóra</p>`}`:''}
      <button type="button" data-project-refresh>Projektadatok frissítése</button>`;
    section.querySelector('[data-project-select]').onchange=e=>{hidden.value=e.target.value;render();};
    section.querySelector('[data-project-refresh]').onclick=()=>refresh(true);
  }
  async function refresh(force=false){
    const c=context(),key=JSON.stringify(c);
    if(key!==lastKey){lastKey=key;lastRefresh=0;generation++;projects=[];hidden.value='';render();}
    if(!c.signedIn||!c.customer_id||!c.address||!c.work_date)return;
    if(busy||(!force&&Date.now()-lastRefresh<120000))return;
    const requestGeneration=generation;busy=true;lastRefresh=Date.now();
    try{
      const token=await window.MunkalapDB?.projectAccessToken?.();if(!token)return;
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'worker_state',customer_id:c.customer_id,address:c.address,work_date:c.work_date}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('A projektadatok most nem frissíthetők.');
      const data=await response.json();if(requestGeneration!==generation)return;
      projects=data.projects||[];if(c.preset_id&&projects.some(p=>p.id===c.preset_id))hidden.value=c.preset_id;render();
    }catch{
      if(requestGeneration!==generation)return;
      // An optional project lookup must never block the existing worksheet.
      if(!section.hidden){let p=section.querySelector('[data-project-error]');if(!p){p=document.createElement('p');p.dataset.projectError='';section.append(p);}p.textContent='A projektadatok most nem frissíthetők. A munkalap továbbra is elküldhető.';}
    }finally{busy=false;}
  }
  let timer;form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>refresh(),500);});
  form.addEventListener('reset',()=>{lastKey='';lastRefresh=0;setTimeout(()=>refresh(),0);});
  document.addEventListener('click',e=>{if(e.target.closest('#customerSuggestions,#addressSuggestions')){lastRefresh=0;setTimeout(()=>refresh(),0);}});
  const interval=setInterval(()=>{const c=context();if(JSON.stringify(c)!==lastKey)lastRefresh=0;refresh();},5000);
  window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  refresh();
})();
