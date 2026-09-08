(function(){
'use strict';
let rows=[],busy=false,dirty=false;
const el=id=>document.getElementById(id),allowed=()=>session?.role==='manager';
const money=value=>new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0}).format(Number(value)||0);
const monthValue=value=>String(value||'').slice(0,7);
const monthDate=value=>value?`${value}-01`:null;
const currentMonth=()=>new Date().toISOString().slice(0,7);
function status(text,error=false){for(const id of ['budgetRecurringStatus','recurringExpenseStatus']){const box=el(id);box.textContent=text;box.classList.toggle('budget-warning',error);}}
function setBusy(value){busy=value;el('budgetRecurring').inert=value;el('recurringExpenseDialog').inert=value;}
function visibleRows(){return rows.filter(row=>row.active||el('budgetRecurringShowInactive').checked);}
function render(){
  el('budgetRecurringList').innerHTML=visibleRows().map(row=>`<article class="recurring-expense ${row.active?'':'inactive'}" data-recurring="${escapeHTML(row.code)}"><div><h4>${escapeHTML(row.designation)}</h4><p><b>${escapeHTML(money(row.amount))}</b> havonta · ${escapeHTML(row.category)}</p><small>${escapeHTML(monthValue(row.start_month))}${row.end_month?' – '+escapeHTML(monthValue(row.end_month)):' · folyamatos'}${row.note?' · '+escapeHTML(row.note):''}</small></div><span>${row.active?'Aktív':'Szüneteltetve'}</span><div><button type="button" data-edit-recurring>Szerkesztés</button><button type="button" class="budget-delete-price" data-delete-recurring>Szabály törlése</button></div></article>`).join('')||'<p>Nincs megjeleníthető havi fix kiadás.</p>';
}
async function load(){if(!allowed()||busy)return;setBusy(true);status('Betöltés…');try{rows=await MunkalapDB.recurringCashExpenses();render();status('');}catch(error){status('A havi fix kiadások nem tölthetők be: '+error.message,true);}finally{setBusy(false);}}
function open(row=null){
  const form=el('recurringExpenseForm');form.reset();
  form.elements.code.value=row?.code||'';form.elements.updatedAt.value=row?.updated_at||'';
  form.elements.designation.value=row?.designation||'';form.elements.amount.value=row?.amount||'';
  form.elements.category.value=row?.category||'Működési költség';form.elements.startMonth.value=monthValue(row?.start_month)||currentMonth();
  form.elements.endMonth.value=monthValue(row?.end_month);form.elements.note.value=row?.note||'';form.elements.active.checked=row?.active!==false;
  el('recurringExpenseTitle').textContent=row?'Havi fix kiadás szerkesztése':'Új havi fix kiadás';dirty=false;status('');el('recurringExpenseDialog').showModal();
}
function close(){if(dirty&&!confirm('A nem mentett módosítások elvesznek. Bezárod?'))return;dirty=false;el('recurringExpenseDialog').close();}
async function save(event){
  event.preventDefault();if(!allowed()||busy)return;const form=event.currentTarget,start=form.elements.startMonth.value,end=form.elements.endMonth.value;
  if(end&&end<start){status('Az utolsó hónap nem lehet korábbi a kezdő hónapnál.',true);return;}
  setBusy(true);status('Mentés folyamatban…');
  try{
    await MunkalapDB.saveRecurringCashExpense({code:form.elements.code.value,updated_at:form.elements.updatedAt.value,designation:form.elements.designation.value.trim(),amount:Number(form.elements.amount.value),category:form.elements.category.value,start_month:monthDate(start),end_month:monthDate(end),note:form.elements.note.value.trim(),active:form.elements.active.checked});
    const created=await MunkalapDB.ensureRecurringCashExpenses();dirty=false;el('recurringExpenseDialog').close();rows=await MunkalapDB.recurringCashExpenses();render();status(created?`Mentve. ${created} hiányzó havi Kassza-tétel létrejött.`:'Mentve.');
  }catch(error){status('A mentés nem sikerült: '+error.message,true);}finally{setBusy(false);}
}
async function remove(row){
  if(!confirm(`Törlöd ezt a havi szabályt?\n\n${row.designation}\n\nA már létrejött korábbi Kassza-tételek megmaradnak.`))return;
  if(!confirm(`VÉGLEGES SZABÁLYTÖRLÉS\n\n${row.designation}\n\nA következő hónapokban ez a kiadás nem jön létre automatikusan. Folytatod?`))return;
  setBusy(true);status('Törlés folyamatban…');try{await MunkalapDB.deleteRecurringCashExpense(row.code);rows=await MunkalapDB.recurringCashExpenses();render();status('A havi szabály törölve. A korábbi Kassza-tételek megmaradtak.');}catch(error){status('A törlés nem sikerült: '+error.message,true);}finally{setBusy(false);}
}
el('budgetRecurringAdd').addEventListener('click',()=>open());
el('budgetRecurringShowInactive').addEventListener('change',render);
el('budgetRecurringList').addEventListener('click',event=>{const card=event.target.closest('[data-recurring]'),row=rows.find(item=>item.code===card?.dataset.recurring);if(!row)return;if(event.target.closest('[data-edit-recurring]'))open(row);if(event.target.closest('[data-delete-recurring]'))remove(row);});
el('recurringExpenseForm').addEventListener('input',()=>{dirty=true;});
el('recurringExpenseForm').addEventListener('submit',save);
el('recurringExpenseCancel').addEventListener('click',close);
el('recurringExpenseDialog').addEventListener('cancel',event=>{event.preventDefault();close();});
window.RecurringExpenses={show:load,reset:()=>{rows=[];busy=false;dirty=false;el('budgetRecurringList').innerHTML='';status('');},hasUnsaved:()=>dirty};
})();
