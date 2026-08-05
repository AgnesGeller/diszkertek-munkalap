const EMAIL_ENDPOINT = "https://formsubmit.co/ajax/info@diszkertek.hu";
const STABLE_FORM_URL = "https://agnesgeller.github.io/diszkertek-munkalap/";
const LEGACY_STORAGE_KEY = "diszkertek-munkalap-exact-v2";

if (window.location.protocol === "file:") {
  window.location.replace(STABLE_FORM_URL);
}

const MAINTENANCE = [
  ["Zöldhulladék elszállítás ömlesztett", "m³"], ["Zöldhulladék normál zsákos", "db"],
  ["Zöldhulladék big bag zsákos", "db"], ["Növényvédelem", "15L/tartály"],
  ["Lemosó permetezés", "15L/tartály"], ["Bio Permetezés", "15L/tartály"],
  ["Gyomirtó", "liter"], ["Talajpermet", "15L/tartály"], ["Fűmag szórás", "adagoló"],
  ["Műtrágya", "általános/adagoló"], ["Műtrágya", "mohairtó/adagoló"], ["Műtrágya", "gyomirtó/adagoló"],
  ["Marhatrágya", "20L/zsák"], ["Marhatrágya", "40/50L/zsák"],
  ["Termőföld zsákos", "20L/zsák"], ["Termőföld zsákos", "40/50L/zsák"],
  ["Karó cserjének", "db"], ["Karó fának", "db"], ["Geotextília", "m2"], ["Fatörzsvédő", "db"],
  ["Öntözőrendszer anyagok", ""], ["Fatörzsvédő", "db"], ["Öntözőrendszer anyagok", ""]
];

const CONSTRUCTION = [
  ["Fuvarok száma", ""], ["Fuvaronként megtett út", "km"], ["Fuvarozás alatt összes megtett út", "km"],
  ["Föld elszállítás", "m³"], ["Szemét elszállítás", "m3"], ["Termőföld", "m3"],
  ["Murva/andezit teherhordó rtg.", "m3"], ["Murva/andezit ágyazó rtg.", "m3"], ["Kulé kavics", "m3"],
  ["Homok", "m3"], ["Beton C20 ömlesztett", "m3"], ["Beton CKT ömlesztett", "m3"], ["Sóder", "m3"],
  ["Cement", "25kg/db"], ["Beton kész zsákos", "db"], ["Beton (Cemix száraz, gyorsan kötő)", "db"],
  ["C20 beton, ömlesztett", "m³"], ["CKT beton, ömlesztett", "m³"], ["Raklap", "db"],
  ["Egyéb1", ""], ["Egyéb2", ""], ["Egyéb3", ""], ["Egyéb4", ""]
];

const form = document.querySelector("#worksheetForm");
const statusBox = document.querySelector("#status");
let installPrompt;

function formatDateInput(date) {
  const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}
function toDateInputValue(value) {
  const text=String(value||"").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const digits=text.replace(/\D/g,"").slice(0,8);
  if(digits.length!==8)return text;
  return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
}
function formatHungarianDateValue(value) {
  const iso=toDateInputValue(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso?`${iso[1]}. ${iso[2]}. ${iso[3]}.`:String(value||"");
}
function formatSubjectDate(value) {
  return formatHungarianDateValue(value).replace(/\s/g,"").replace(/\.$/,"");
}

function renderTeams() {
  document.querySelector("#teams").innerHTML = [1,2,3].map(i => `<div class="time-row team-row"><label><span>Csapat ${i}:</span><input name="team_${i}_size" inputmode="numeric"><em>fő</em></label><label><span>Érkezés:</span><input name="team_${i}_arrival" type="time"></label><label><span>Távozás:</span><input name="team_${i}_departure" type="time"></label></div>`).join("");
}

function renderItems(targetId, prefix, list) {
  document.querySelector(`#${targetId}`).innerHTML = list.map(([name, unit], i) => `<label class="material-row"><span>${i+1}. ${name}${unit ? ` (${unit})` : ""}:</span><input name="${prefix}_${i}" inputmode="decimal" aria-label="${name}"></label>`).join("");
}

function dataObject() {
  const result = {}; for (const [key,value] of new FormData(form).entries()) result[key] = value; return result;
}
function showStatus(message, kind="error") { statusBox.textContent=message; statusBox.className=`status show ${kind}`; statusBox.scrollIntoView({behavior:"smooth",block:"center"}); }
function addIfFilled(payload,label,value,suffix="") {
  const clean=String(value||"").trim();
  if(clean)payload[label]=`${clean}${suffix}`;
}
function buildFormSubmitPayload(data) {
  const payload={
    _subject:`${String(data.teamLeader||"").trim().toLocaleUpperCase("hu-HU")} - ${formatSubjectDate(data.date)} - MUNKALAP`,
    _template:"table",
    _captcha:"false",
    _url:STABLE_FORM_URL,
    "Csoport vezető / beküldő":data.teamLeader,
    "Dátum":formatHungarianDateValue(data.date),
    "Ügyfél neve":data.customerName,
    "Cím":data.address
  };
  [1,2,3].forEach(i=>{
    const size=data[`team_${i}_size`],arrival=data[`team_${i}_arrival`],departure=data[`team_${i}_departure`];
    if(size||arrival||departure)payload[`Csapat ${i}`]=`${size?`${size} fő`:"létszám nincs megadva"}${arrival?` | érkezés: ${arrival}`:""}${departure?` | távozás: ${departure}`:""}`;
  });
  addIfFilled(payload,"Alvállalkozó",data.subcontractor);
  addIfFilled(payload,"Alvállalkozó – érkezés",data.subcontractorArrival);
  addIfFilled(payload,"Alvállalkozó – távozás",data.subcontractorDeparture);
  addIfFilled(payload,"Gépbérlés 1",data.rental1);
  addIfFilled(payload,"Gépbérlés 2",data.rental2);
  addIfFilled(payload,"Gépbérlés 3",data.rental3);
  addIfFilled(payload,"Feladat leírás / megjegyzés",data.description);
  MAINTENANCE.forEach(([name,unit],i)=>addIfFilled(payload,`Kertkarbantartás ${i+1}. – ${name}${unit?` (${unit})`:""}`,data[`maintenance_${i}`]));
  CONSTRUCTION.forEach(([name,unit],i)=>addIfFilled(payload,`Kertépítés / fuvarozás ${i+1}. – ${name}${unit?` (${unit})`:""}`,data[`construction_${i}`]));
  return payload;
}
function resetForm() {
  form.reset();
  form.elements.date.value=formatHungarianDateValue(formatDateInput(new Date()));
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}
  statusBox.textContent="";
  statusBox.className="status";
}
function clearRestoredBrowserValues() {
  resetForm();
  requestAnimationFrame(()=>resetForm());
}
const dateField=form.elements.date;
const dateDialog=document.querySelector("#dateDialog");
const dateYear=document.querySelector("#dateYear"),dateMonth=document.querySelector("#dateMonth"),dateDay=document.querySelector("#dateDay");
const monthNames=["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
function fillSelect(select,values,labels=values){select.innerHTML=values.map((value,index)=>`<option value="${value}">${labels[index]}</option>`).join("");}
function refreshDays(){
  const selected=Number(dateDay.value)||1;
  const count=new Date(Number(dateYear.value),Number(dateMonth.value),0).getDate();
  const days=Array.from({length:count},(_,index)=>index+1);
  fillSelect(dateDay,days,days.map(day=>`${day}.`));
  dateDay.value=String(Math.min(selected,count));
}
const currentYear=new Date().getFullYear();
const years=Array.from({length:12},(_,index)=>currentYear-2+index);
fillSelect(dateYear,years);fillSelect(dateMonth,Array.from({length:12},(_,index)=>index+1),monthNames);refreshDays();
document.querySelector("#datePickerButton").addEventListener("click",()=>{
  const iso=toDateInputValue(dateField.value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base=iso?{year:iso[1],month:String(Number(iso[2])),day:String(Number(iso[3]))}:{year:String(currentYear),month:String(new Date().getMonth()+1),day:String(new Date().getDate())};
  if(!years.includes(Number(base.year))){const option=document.createElement("option");option.value=base.year;option.textContent=base.year;dateYear.append(option);}
  dateYear.value=base.year;dateMonth.value=base.month;refreshDays();dateDay.value=base.day;
  dateDialog.showModal();
});
dateYear.addEventListener("change",refreshDays);dateMonth.addEventListener("change",refreshDays);
document.querySelector("#dateCancel").addEventListener("click",()=>dateDialog.close());
document.querySelector("#dateApply").addEventListener("click",()=>{
  dateField.value=`${dateYear.value}. ${String(dateMonth.value).padStart(2,"0")}. ${String(dateDay.value).padStart(2,"0")}.`;
  dateDialog.close();
});
dateField.addEventListener("blur",()=>{
  dateField.value=formatHungarianDateValue(dateField.value);
});
form.addEventListener("submit",async event=>{
  event.preventDefault(); if(!form.reportValidity())return; if(!navigator.onLine){showStatus("Nincs internetkapcsolat. Az adatokat nem küldtük el; maradj ezen az oldalon, majd próbáld újra.");return;}
  const data=dataObject(),button=form.querySelector(".submit-button"); button.disabled=true;button.textContent="Küldés folyamatban…";
  try { const response=await fetch(EMAIL_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(buildFormSubmitPayload(data))}); const result=await response.json().catch(()=>({})); const explicitlyFailed=result.success===false||String(result.success).toLowerCase()==="false"; if(!response.ok||explicitlyFailed)throw new Error(result.message||`Küldési hiba (${response.status})`); resetForm();document.querySelector("#successDialog").showModal(); }
  catch(error){showStatus(`A küldés nem sikerült: ${error?.message||"ismeretlen hiba"}. Az aktuális oldalon maradnak az adatok, hogy újra megpróbálhasd; újranyitáskor törlődnek.`);}
  finally{button.disabled=false;button.textContent="Munkalap elküldése";}
});
document.querySelector("#clearForm").onclick=()=>{if(confirm("Biztosan törlöd a teljes munkalapot?"))resetForm();};
document.querySelector("#newWorksheet").onclick=()=>{document.querySelector("#successDialog").close();resetForm();window.scrollTo({top:0,behavior:"smooth"});};
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;document.querySelector("#installButton").hidden=false;});
document.querySelector("#installButton").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;document.querySelector("#installButton").hidden=true;};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js?v=4"));
window.addEventListener("pageshow",clearRestoredBrowserValues);
renderTeams();renderItems("maintenanceItems","maintenance",MAINTENANCE);renderItems("constructionItems","construction",CONSTRUCTION);resetForm();
