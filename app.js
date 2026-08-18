const EMAIL_ENDPOINT = "https://formsubmit.co/ajax/info@diszkertek.hu";
const EMAIL_RECIPIENT = "info@diszkertek.hu";
const STABLE_APP_URL = "https://agnesgeller.github.io/diszkertek-munkalap/";
const APP_VERSION = "16";
const QUEUE_KEY = "diszkertek-munkalap-send-queue-v1";
const MANAGER_VIEW_KEY = "diszkertek-munkalap-manager-view-v1";
const DATABASE_FREE_LIMIT = 500 * 1024 * 1024;
const LEADERS = ["Ádám", "Ági", "Attila", "Bendegúz", "Gábor", "Marci", "Márk", "Tamás"];
const LOCAL_PREVIEW = Boolean(window.MunkalapDB?.previewMode);

if (window.location.protocol === "file:") window.location.replace(STABLE_APP_URL);

const MAINTENANCE = [
  ["Zöldhulladék elszállítás ömlesztett", "m³"], ["Zöldhulladék normál zsákos", "db"],
  ["Zöldhulladék big bag zsákos", "db"], ["Növényvédelem", "15L/tartály"],
  ["Lemosó permetezés", "15L/tartály"], ["Bio Permetezés", "15L/tartály"],
  ["Gyomirtó", "liter"], ["Talajpermet", "15L/tartály"], ["Fűmag szórás", "adagoló"],
  ["Műtrágya", "általános/adagoló"], ["Műtrágya", "mohairtó/adagoló"], ["Műtrágya", "gyomirtó/adagoló"],
  ["Marhatrágya", "20L/zsák"], ["Marhatrágya", "40/50L/zsák"],
  ["Termőföld zsákos", "20L/zsák"], ["Termőföld zsákos", "40/50L/zsák"],
  ["Karó cserjének", "db"], ["Karó fának", "db"], ["Geotextília", "m2"], ["Fatörzsvédő", "db"],
  ["Öntözőrendszer anyagok", ""], ["Egyéb1", ""], ["Egyéb2", ""]
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

const $ = selector => document.querySelector(selector);
const form = $("#worksheetForm");
const statusBox = $("#status");
const fallbackEmailButton = $("#fallbackEmailButton");

let session = null;
let selectedProfile = "";
let worksheets = [];
let editingId = null;
let formDirty = false;
let installPrompt = null;
let serviceWorkerRegistration = null;
let updateReloadPending = false;
let externalEmailInProgress = false;
let fallbackEmailContext = null;
let pendingCurrentQueueId = null;
let queueSyncRunning = false;
let realtimeRefreshTimer = null;
let officeViewActive = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 3 | 8)).toString(16);
  });
}

function isoToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function toDateInputValue(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function formatHungarianDate(value) {
  const iso = toDateInputValue(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}. ${iso[2]}. ${iso[3]}.` : String(value || "");
}

function formatSubjectDate(value) {
  return formatHungarianDate(value).replace(/\s/g, "").replace(/\.$/, "");
}

function renderTeams() {
  $("#teams").innerHTML = [1, 2, 3].map(index => `
    <div class="time-row team-row">
      <label><span>Csapat ${index}:</span><input name="team_${index}_size" inputmode="numeric"><em>fő</em></label>
      <label><span>Érkezés:</span><input name="team_${index}_arrival" type="time"></label>
      <label><span>Távozás:</span><input name="team_${index}_departure" type="time"></label>
    </div>`).join("");
}

function renderItems(targetId, prefix, list) {
  $(`#${targetId}`).innerHTML = list.map(([name, unit], index) => {
    const inputMode = name.startsWith("Egyéb") || name === "Öntözőrendszer anyagok" ? "text" : "decimal";
    return `<label class="material-row"><span>${index + 1}. ${escapeHTML(name)}${unit ? ` (${escapeHTML(unit)})` : ""}:</span><input name="${prefix}_${index}" inputmode="${inputMode}" aria-label="${escapeHTML(name)}"></label>`;
  }).join("");
}

function formDataObject() {
  return Object.fromEntries(new FormData(form));
}

function addIfFilled(payload, label, value) {
  const clean = String(value || "").trim();
  if (clean) payload[label] = clean;
}

function buildEmailPayload(data, modified = false) {
  const subjectType = modified ? "MÓDOSÍTOTT MUNKALAP" : "MUNKALAP";
  const payload = {
    _subject: `${String(data.teamLeader || "").trim().toLocaleUpperCase("hu-HU")} - ${formatSubjectDate(data.date)} - ${subjectType}`,
    _template: "table",
    _captcha: "false",
    _url: STABLE_APP_URL,
    "Csoport vezető / beküldő": data.teamLeader,
    "Dátum": formatHungarianDate(data.date),
    "Ügyfél neve": data.customerName,
    "Cím": data.address
  };
  [1, 2, 3].forEach(index => {
    const size = data[`team_${index}_size`];
    const arrival = data[`team_${index}_arrival`];
    const departure = data[`team_${index}_departure`];
    if (size || arrival || departure) {
      payload[`Csapat ${index}`] = `${size ? `${size} fő` : "létszám nincs megadva"}${arrival ? ` | érkezés: ${arrival}` : ""}${departure ? ` | távozás: ${departure}` : ""}`;
    }
  });
  addIfFilled(payload, "Alvállalkozó", data.subcontractor);
  addIfFilled(payload, "Alvállalkozó – érkezés", data.subcontractorArrival);
  addIfFilled(payload, "Alvállalkozó – távozás", data.subcontractorDeparture);
  addIfFilled(payload, "Gépbérlés 1", data.rental1);
  addIfFilled(payload, "Gépbérlés 2", data.rental2);
  addIfFilled(payload, "Gépbérlés 3", data.rental3);
  addIfFilled(payload, "Feladat leírás / megjegyzés", data.description);
  MAINTENANCE.forEach(([name, unit], index) => addIfFilled(payload, `Kertkarbantartás – ${name}${unit ? ` (${unit})` : ""}`, data[`maintenance_${index}`]));
  CONSTRUCTION.forEach(([name, unit], index) => addIfFilled(payload, `Kertépítés / fuvarozás – ${name}${unit ? ` (${unit})` : ""}`, data[`construction_${index}`]));
  return payload;
}

function fallbackEmailUrl(payload) {
  const subject = String(payload?._subject || "MUNKALAP");
  const body = ["MUNKALAP", "", ...Object.entries(payload || {})
    .filter(([name, value]) => !name.startsWith("_") && String(value || "").trim())
    .map(([name, value]) => `${name}: ${value}`)].join("\n");
  return `mailto:${EMAIL_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendEmail(payload) {
  if (LOCAL_PREVIEW) return;
  const response = await fetch(EMAIL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  const explicitlyFailed = result.success === false || String(result.success).toLowerCase() === "false";
  if (!response.ok || explicitlyFailed) throw new Error(result.message || `Küldési hiba (${response.status})`);
}

function showStatus(message, kind = "error") {
  statusBox.textContent = message;
  statusBox.className = `status show ${kind}`;
  statusBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearStatus() {
  statusBox.textContent = "";
  statusBox.className = "status";
}

function readQueue() {
  if (LOCAL_PREVIEW) return [];
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
  catch (_) { return []; }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  updateQueueNotice();
  if (session) renderRecent();
}

function addQueueItem(item) {
  const queue = readQueue().filter(entry => entry.queueId !== item.queueId);
  queue.push(item);
  writeQueue(queue);
}

function updateQueueItem(queueId, changes) {
  writeQueue(readQueue().map(item => item.queueId === queueId ? { ...item, ...changes } : item));
}

function removeQueueItem(queueId) {
  writeQueue(readQueue().filter(item => item.queueId !== queueId));
}

function ownQueue() {
  return readQueue().filter(item => (item.queuedBy || item.userId) === session?.userId);
}

function updateQueueNotice() {
  const notice = $("#queueNotice");
  if (!session) { notice.hidden = true; return; }
  const queue = ownQueue();
  if (!queue.length) {
    notice.hidden = true;
    notice.textContent = "";
    return;
  }
  notice.hidden = false;
  notice.textContent = `${queue.length} munkalap küldésre vár. Internetkapcsolatnál az alkalmazás automatikusan újrapróbálja.`;
  const emailWaiting = queue.find(item => !item.emailSent && !item.emailHandledManually);
  if (emailWaiting && !fallbackEmailContext) {
    fallbackEmailContext = { payload: emailWaiting.emailPayload, queueId: emailWaiting.queueId, clearAfterReturn: false };
    fallbackEmailButton.hidden = false;
  }
}

function isNetworkError(error) {
  return !navigator.onLine || /fetch|network|kapcsolat|load failed/i.test(String(error?.message || error || ""));
}

function makeQueueItem(action, record, emailPayload, databaseSaved = false) {
  return {
    queueId: uuid(),
    action,
    record,
    queuedBy: session.userId,
    emailPayload,
    databaseSaved,
    emailSent: false,
    emailHandledManually: false,
    queuedAt: new Date().toISOString()
  };
}

async function syncQueue() {
  if (queueSyncRunning || !session || !navigator.onLine) return false;
  queueSyncRunning = true;
  let queue = readQueue();
  let changed = false;
  for (const item of queue.filter(entry => (entry.queuedBy || entry.userId) === session.userId)) {
    try {
      if (!item.databaseSaved) {
        if (item.action === "update") await MunkalapDB.update(item.record.id, item.record);
        else await MunkalapDB.create(item.record, item.record.userId);
        item.databaseSaved = true;
        changed = true;
      }
      if (!item.emailSent && !item.emailHandledManually) {
        await sendEmail(item.emailPayload);
        item.emailSent = true;
        changed = true;
      }
    } catch (error) {
      if (!isNetworkError(error) && !item.databaseSaved) item.permanentError = error.message || "Mentési hiba";
    }
  }
  queue = queue.filter(item => !(item.databaseSaved && (item.emailSent || item.emailHandledManually)));
  writeQueue(queue);
  queueSyncRunning = false;
  if (changed) await loadWorksheets(false);
  return changed;
}

function resetForm(options = {}) {
  const preserveFallback = Boolean(options.preserveFallback);
  form.reset();
  editingId = null;
  pendingCurrentQueueId = null;
  formDirty = false;
  form.elements.teamLeader.value = session?.name || "";
  form.elements.date.value = formatHungarianDate(isoToday());
  form.querySelector(".submit-button").textContent = "Munkalap elküldése";
  $("#cancelEdit").hidden = true;
  clearStatus();
  if (!preserveFallback) {
    fallbackEmailContext = null;
    fallbackEmailButton.hidden = true;
  }
  updateQueueNotice();
}

function worksheetFromForm(existing) {
  const data = formDataObject();
  const date = toDateInputValue(data.date);
  if (!date) throw new Error("Válassz érvényes dátumot.");
  const leader = existing?.leader || session.name;
  data.teamLeader = leader;
  data.date = formatHungarianDate(date);
  return {
    id: existing?.id || uuid(),
    userId: existing?.userId || session.userId,
    leader,
    customer: String(data.customerName || "").trim(),
    address: String(data.address || "").trim(),
    date,
    data
  };
}

function updateWorksheetCache(saved) {
  const index = worksheets.findIndex(item => item.id === saved.id);
  if (index >= 0) worksheets[index] = saved;
  else worksheets.unshift(saved);
  renderAll();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!session || !form.reportValidity()) return;
  if (pendingCurrentQueueId) {
    showStatus("Ez a munkalap már küldésre vár. Nem mentettük el még egyszer.", "pending");
    return;
  }

  const existing = editingId ? worksheets.find(item => item.id === editingId) : null;
  let record;
  try { record = worksheetFromForm(existing); }
  catch (error) { showStatus(error.message); return; }

  const action = existing ? "update" : "create";
  const emailPayload = buildEmailPayload(record.data, Boolean(existing));
  const button = form.querySelector(".submit-button");
  button.disabled = true;
  button.textContent = existing ? "Módosítás mentése…" : "Küldés folyamatban…";

  try {
    if (!navigator.onLine) throw new TypeError("Failed to fetch");
    const saved = existing
      ? await MunkalapDB.update(record.id, record)
      : await MunkalapDB.create(record, session.userId);
    updateWorksheetCache(saved);
    try {
      await sendEmail(emailPayload);
      resetForm();
      $("#successDialog").showModal();
    } catch (emailError) {
      const queued = makeQueueItem(action, { ...record, ...saved }, emailPayload, true);
      addQueueItem(queued);
      pendingCurrentQueueId = queued.queueId;
      fallbackEmailContext = { payload: emailPayload, queueId: queued.queueId, clearAfterReturn: true };
      fallbackEmailButton.hidden = false;
      showStatus("A munkalapot elmentettük, de az automatikus e-mail nem ment el. Nyomd meg a „Küldés e-mail alkalmazással” gombot.", "pending");
    }
  } catch (error) {
    if (isNetworkError(error)) {
      const queued = makeQueueItem(action, record, emailPayload, false);
      addQueueItem(queued);
      pendingCurrentQueueId = queued.queueId;
      fallbackEmailContext = { payload: emailPayload, queueId: queued.queueId, clearAfterReturn: true };
      fallbackEmailButton.hidden = false;
      showStatus("Nincs megfelelő internetkapcsolat. A munkalapot elmentettük a telefonon, és küldésre vár. Az e-mail alkalmazással most is elküldheted.", "pending");
    } else {
      const queued = makeQueueItem(action, record, emailPayload, false);
      queued.lastError = error?.message || "ismeretlen mentési hiba";
      addQueueItem(queued);
      pendingCurrentQueueId = queued.queueId;
      fallbackEmailContext = { payload: emailPayload, queueId: queued.queueId, clearAfterReturn: true };
      fallbackEmailButton.hidden = false;
      showStatus(`Az adatbázisba mentés még nem sikerült: ${error?.message || "ismeretlen hiba"}. A munkalapot a telefonon megőriztük és automatikusan újrapróbáljuk; a tartalék e-mail-küldést most is használhatod.`, "pending");
    }
  } finally {
    button.disabled = false;
    button.textContent = editingId ? "Módosítás mentése" : "Munkalap elküldése";
  }
});

fallbackEmailButton.addEventListener("click", () => {
  if (!fallbackEmailContext?.payload) {
    const data = formDataObject();
    if (!data.teamLeader || !data.customerName || !data.address || !data.date) {
      showStatus("Előbb töltsd ki a kötelező mezőket.");
      return;
    }
    fallbackEmailContext = { payload: buildEmailPayload(data, Boolean(editingId)), queueId: null, clearAfterReturn: false };
  }
  if (fallbackEmailContext.queueId) updateQueueItem(fallbackEmailContext.queueId, { emailHandledManually: true });
  externalEmailInProgress = true;
  window.location.href = fallbackEmailUrl(fallbackEmailContext.payload);
});

function finishExternalEmail() {
  if (!externalEmailInProgress) return;
  externalEmailInProgress = false;
  const shouldClear = fallbackEmailContext?.clearAfterReturn;
  fallbackEmailContext = null;
  if (shouldClear) {
    resetForm();
    $("#successDialog").showModal();
  } else {
    fallbackEmailButton.hidden = true;
  }
  syncQueue();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  finishExternalEmail();
  if (updateReloadPending && !formDirty) window.location.reload();
  serviceWorkerRegistration?.update().catch(() => {});
});

window.addEventListener("pageshow", finishExternalEmail);
window.addEventListener("online", () => {
  syncQueue();
  serviceWorkerRegistration?.update().catch(() => {});
});
window.addEventListener("offline", () => updateQueueNotice());

// A tartalék e-mail után a helyben megőrzött munkalap akkor is kerüljön be
// automatikusan az adatbázisba, ha a telefon nem jelez külön hálózatváltást.
setInterval(() => {
  if (session && navigator.onLine && ownQueue().length) syncQueue();
}, 15000);

function teamLines(data) {
  const lines = [];
  [1, 2, 3].forEach(index => {
    const size = String(data[`team_${index}_size`] || "").trim();
    const arrival = String(data[`team_${index}_arrival`] || "").trim();
    const departure = String(data[`team_${index}_departure`] || "").trim();
    if (!size && !arrival && !departure) return;
    const time = arrival || departure ? `${arrival || "?"}–${departure || "?"}` : "";
    lines.push([size ? `${size} fő` : "Létszám nincs megadva", time].filter(Boolean).join(" · "));
  });
  return lines;
}

function subcontractorLine(data) {
  const name = String(data.subcontractor || "").trim();
  const arrival = String(data.subcontractorArrival || "").trim();
  const departure = String(data.subcontractorDeparture || "").trim();
  if (!name && !arrival && !departure) return "";
  const time = arrival || departure ? `${arrival || "?"}–${departure || "?"}` : "";
  return [name || "Név nincs megadva", time].filter(Boolean).join(" · ");
}

function filledMaterialItems(data) {
  const result = [];
  MAINTENANCE.forEach(([name, unit], index) => {
    const value = String(data[`maintenance_${index}`] || "").trim();
    if (value) result.push(`${name}: ${value}${unit ? ` ${unit}` : ""}`);
  });
  CONSTRUCTION.forEach(([name, unit], index) => {
    const value = String(data[`construction_${index}`] || "").trim();
    if (value) result.push(`${name}: ${value}${unit ? ` ${unit}` : ""}`);
  });
  return result;
}

function filledRentals(data) {
  return [data.rental1, data.rental2, data.rental3].map(value => String(value || "").trim()).filter(Boolean);
}

function listHTML(items, className = "summary-lines") {
  if (!items.length) return "";
  return `<ul class="${className}">${items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
}

function worksheetCardHTML(item, office = false) {
  const data = item.data || {};
  const teams = teamLines(data);
  const subcontractor = subcontractorLine(data);
  const materials = filledMaterialItems(data);
  const rentals = filledRentals(data);
  return `
    <article class="worksheet-card" data-id="${escapeHTML(item.id)}">
      <h3>Csapat: ${escapeHTML(item.leader)}</h3>
      ${item.pending ? `<p class="pending-record"><b>Küldésre vár</b> – a telefon megőrzi, és internetkapcsolatnál újrapróbálja.</p>` : ""}
      ${listHTML(teams, "team-summary")}
      ${subcontractor ? `<p><b>Alvállalkozó:</b> ${escapeHTML(subcontractor)}</p>` : ""}
      ${item.customer ? `<p><b>Ügyfél:</b> ${escapeHTML(item.customer)}</p>` : ""}
      ${item.address ? `<p><b>Cím:</b> ${escapeHTML(item.address)}</p>` : ""}
      ${item.date ? `<p><b>Dátum:</b> ${escapeHTML(formatHungarianDate(item.date))}</p>` : ""}
      ${materials.length ? `<div class="summary-group"><b>Tételek:</b>${listHTML(materials)}</div>` : ""}
      ${rentals.length ? `<div class="summary-group"><b>Gépbérlés:</b>${listHTML(rentals)}</div>` : ""}
      <div class="card-actions">
        ${item.pending ? "" : `<button type="button" data-edit="${escapeHTML(item.id)}">Megnyitás / Szerkesztés</button>`}
        ${office ? `<button type="button" data-print="${escapeHTML(item.id)}">PDF / Nyomtatás</button>` : ""}
      </div>
    </article>`;
}

function sortedByCreated(items) {
  return [...items].sort((first, second) => String(second.createdAt || "").localeCompare(String(first.createdAt || "")) || second.date.localeCompare(first.date));
}

function ownRecentWorksheets() {
  const saved = worksheets.filter(item => item.userId === session?.userId);
  const savedIds = new Set(saved.map(item => item.id));
  const pending = ownQueue()
    .filter(item => !item.databaseSaved && item.record && !savedIds.has(item.record.id))
    .map(item => ({
      ...item.record,
      pending: true,
      createdAt: item.queuedAt || new Date().toISOString(),
      updatedAt: item.queuedAt || new Date().toISOString()
    }));
  return sortedByCreated([...saved, ...pending]).slice(0, 10);
}

function renderRecent() {
  const target = $("#recentWorksheets");
  const recent = ownRecentWorksheets();
  target.innerHTML = recent.length ? recent.map(item => worksheetCardHTML(item)).join("") : `<p class="empty-list">Még nincs beküldött munkalapod.</p>`;
}

function filteredOfficeWorksheets() {
  const leader = $("#filterLeader").value;
  const customer = $("#filterCustomer").value.trim().toLocaleLowerCase("hu-HU");
  const address = $("#filterAddress").value.trim().toLocaleLowerCase("hu-HU");
  const from = $("#filterFrom").value;
  const to = $("#filterTo").value;
  return [...worksheets]
    .filter(item => !leader || item.leader === leader)
    .filter(item => !customer || item.customer.toLocaleLowerCase("hu-HU").includes(customer))
    .filter(item => !address || item.address.toLocaleLowerCase("hu-HU").includes(address))
    .filter(item => !from || item.date >= from)
    .filter(item => !to || item.date <= to)
    .sort((first, second) => second.date.localeCompare(first.date) || String(second.createdAt || "").localeCompare(String(first.createdAt || "")));
}

function renderOffice() {
  if (session?.role !== "manager") return;
  const filtered = filteredOfficeWorksheets();
  $("#officeCount").textContent = `${filtered.length} munkalap`;
  $("#officeWorksheets").innerHTML = filtered.length ? filtered.map(item => worksheetCardHTML(item, true)).join("") : `<p class="empty-list">Nincs a szűrésnek megfelelő munkalap.</p>`;
}

function updateSuggestions() {
  const customers = [...new Set(worksheets.map(item => item.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "hu"));
  const addresses = [...new Set(worksheets.map(item => item.address).filter(Boolean))].sort((a, b) => a.localeCompare(b, "hu"));
  const customerInput = form.elements.customerName;
  const addressInput = form.elements.address;
  const render = (target, values, query) => {
    const needle = String(query || "").trim().toLocaleLowerCase("hu-HU");
    target.innerHTML = needle.length < 2 ? "" : values
      .filter(value => value.toLocaleLowerCase("hu-HU").includes(needle))
      .slice(0, 12)
      .map(value => `<option value="${escapeHTML(value)}"></option>`).join("");
  };
  customerInput.oninput = () => render($("#customerSuggestions"), customers, customerInput.value);
  addressInput.oninput = () => render($("#addressSuggestions"), addresses, addressInput.value);
}

function renderAll() {
  renderRecent();
  renderOffice();
  updateSuggestions();
}

async function loadDatabaseUsage() {
  if (session?.role !== "manager") return;
  try {
    const bytes = await MunkalapDB.databaseSize();
    const percent = Math.min(100, bytes / DATABASE_FREE_LIMIT * 100);
    const megabytes = bytes / 1024 / 1024;
    const color = percent >= 85 ? "danger" : percent >= 70 ? "warning" : "safe";
    $("#databaseUsageText").textContent = `${megabytes.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} MB / 500 MB (${percent.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%)`;
    const bar = $("#databaseUsageBar");
    bar.style.width = `${Math.max(percent, 1)}%`;
    bar.className = color;
  } catch (_) {
    $("#databaseUsageText").textContent = "Nem sikerült lekérni.";
  }
}

async function loadWorksheets(showErrors = true) {
  if (!session) return;
  try {
    worksheets = await MunkalapDB.list();
    renderAll();
    if (session.role === "manager") loadDatabaseUsage();
  } catch (error) {
    if (showErrors) {
      const notice = $("#queueNotice");
      notice.hidden = false;
      notice.textContent = `A munkalapok listája még nem érhető el: ${error.message}`;
    }
  }
}

function fillFormFromWorksheet(item) {
  resetForm();
  editingId = item.id;
  for (const [name, value] of Object.entries(item.data || {})) {
    if (form.elements[name]) form.elements[name].value = value ?? "";
  }
  form.elements.teamLeader.value = item.leader;
  form.elements.date.value = formatHungarianDate(item.date);
  form.elements.customerName.value = item.customer;
  form.elements.address.value = item.address;
  form.querySelector(".submit-button").textContent = "Módosítás mentése";
  $("#cancelEdit").hidden = false;
  setManagerView("worksheet");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openWorksheetForEdit(id) {
  const item = worksheets.find(worksheet => worksheet.id === id);
  if (item) fillFormFromWorksheet(item);
}

$("#recentWorksheets").addEventListener("click", event => {
  const button = event.target.closest("[data-edit]");
  if (button) openWorksheetForEdit(button.dataset.edit);
});

$("#officeWorksheets").addEventListener("click", event => {
  const edit = event.target.closest("[data-edit]");
  const print = event.target.closest("[data-print]");
  if (edit) openWorksheetForEdit(edit.dataset.edit);
  if (print) printWorksheet(print.dataset.print);
});

function setManagerView(view) {
  if (session?.role !== "manager") return;
  officeViewActive = view === "office";
  localStorage.setItem(MANAGER_VIEW_KEY, view);
  $("#officeView").hidden = !officeViewActive;
  $("#worksheetView").hidden = officeViewActive;
  $("#officeTab").classList.toggle("active", officeViewActive);
  $("#worksheetTab").classList.toggle("active", !officeViewActive);
  if (officeViewActive) {
    renderOffice();
    loadDatabaseUsage();
  }
}

$("#officeTab").addEventListener("click", () => setManagerView("office"));
$("#worksheetTab").addEventListener("click", () => setManagerView("worksheet"));

function populateFilters() {
  $("#filterLeader").innerHTML = `<option value="">Mind</option>${LEADERS.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")}`;
}

function worksheetDetailHTML(item) {
  const data = item.data || {};
  const teams = teamLines(data);
  const subcontractor = subcontractorLine(data);
  const materials = filledMaterialItems(data);
  const rentals = filledRentals(data);
  const description = String(data.description || "").trim();
  return `
    <header><img src="official-logo.png" alt="Díszkertek"><h1>MUNKALAP</h1></header>
    <h2>Csapat: ${escapeHTML(item.leader)}</h2>
    ${listHTML(teams)}
    ${subcontractor ? `<p><b>Alvállalkozó:</b> ${escapeHTML(subcontractor)}</p>` : ""}
    ${item.customer ? `<p><b>Ügyfél:</b> ${escapeHTML(item.customer)}</p>` : ""}
    ${item.address ? `<p><b>Cím:</b> ${escapeHTML(item.address)}</p>` : ""}
    ${item.date ? `<p><b>Dátum:</b> ${escapeHTML(formatHungarianDate(item.date))}</p>` : ""}
    ${description ? `<section><h3>Feladat leírás / megjegyzés</h3><p>${escapeHTML(description)}</p></section>` : ""}
    ${materials.length ? `<section><h3>Tételek</h3>${listHTML(materials)}</section>` : ""}
    ${rentals.length ? `<section><h3>Gépbérlés</h3>${listHTML(rentals)}</section>` : ""}
    <footer>Netteszt Kft · www.diszkertek.hu · info@diszkertek.hu</footer>`;
}

function printWorksheet(id) {
  const item = worksheets.find(worksheet => worksheet.id === id);
  if (!item) return;
  const printTarget = $("#printWorksheet");
  printTarget.innerHTML = worksheetDetailHTML(item);
  printTarget.hidden = false;
  document.body.classList.add("print-single");
  const oldTitle = document.title;
  document.title = `${item.leader}-${item.date}-MUNKALAP`;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("print-single");
    printTarget.hidden = true;
    document.title = oldTitle;
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);
  window.print();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportOfficeCSV() {
  const rows = [["Csoportvezető", "Ügyfél", "Cím", "Dátum", "Csapat", "Alvállalkozó", "Feladat", "Tételek", "Gépbérlés"]];
  filteredOfficeWorksheets().forEach(item => rows.push([
    item.leader,
    item.customer,
    item.address,
    formatHungarianDate(item.date),
    teamLines(item.data).join(" | "),
    subcontractorLine(item.data),
    item.data.description || "",
    filledMaterialItems(item.data).join(" | "),
    filledRentals(item.data).join(" | ")
  ]));
  const content = "\ufeff" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `munkalapok-${isoToday()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printOfficeList() {
  document.body.classList.add("print-office");
  const oldTitle = document.title;
  document.title = `Munkalapok-${isoToday()}`;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("print-office");
    document.title = oldTitle;
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);
  window.print();
}

$("#exportExcel").addEventListener("click", exportOfficeCSV);
$("#exportPdf").addEventListener("click", printOfficeList);

[$("#filterLeader"), $("#filterFrom"), $("#filterTo")].forEach(element => element.addEventListener("change", renderOffice));
[$("#filterCustomer"), $("#filterAddress")].forEach(element => element.addEventListener("input", renderOffice));
$("#clearFilters").addEventListener("click", () => {
  $("#filterLeader").value = "";
  $("#filterCustomer").value = "";
  $("#filterAddress").value = "";
  $("#filterFrom").value = "";
  $("#filterTo").value = "";
  renderOffice();
});

function renderProfileOptions() {
  const options = LEADERS
    .slice()
    .sort((first, second) => first.localeCompare(second, "hu"))
    .map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`)
    .join("");
  $("#profileSelect").innerHTML = `<option value="">Válassz nevet…</option>${options}`;
}

$("#profileSelect").addEventListener("change", event => {
  selectedProfile = event.target.value;
  const hasSelection = Boolean(selectedProfile);
  $("#pinFieldWrap").hidden = !hasSelection;
  $("#enterButton").disabled = !hasSelection;
  if (hasSelection) $("#pinField").focus();
});

async function login() {
  const pin = $("#pinField").value;
  const status = $("#loginStatus");
  const button = $("#enterButton");
  if (!selectedProfile || pin.length < 6) {
    status.textContent = "Válaszd ki a neved, és add meg a legalább 6 számjegyű PIN-kódot.";
    return;
  }
  button.disabled = true;
  button.textContent = "Belépés…";
  status.textContent = "";
  try {
    const profile = await MunkalapDB.login(selectedProfile, pin);
    await openApp(profile);
  } catch (error) {
    status.textContent = error.message || "A belépés nem sikerült.";
  } finally {
    button.disabled = false;
    button.textContent = "Belépés";
  }
}

$("#enterButton").addEventListener("click", login);
$("#pinField").addEventListener("keydown", event => { if (event.key === "Enter") login(); });

async function openApp(profile) {
  session = profile;
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#activeUser").textContent = `Belépve: ${profile.name}`;
  $("#previewBanner").hidden = !LOCAL_PREVIEW;
  $("#managerTabs").hidden = profile.role !== "manager";
  resetForm();
  if (profile.role === "manager") setManagerView(localStorage.getItem(MANAGER_VIEW_KEY) || "worksheet");
  else {
    $("#officeView").hidden = true;
    $("#worksheetView").hidden = false;
  }
  const now = new Date();
  $("#archiveReminder").hidden = !(now.getMonth() === 11 && now.getDate() >= 10);
  await loadWorksheets();
  updateQueueNotice();
  syncQueue();
  MunkalapDB.subscribe(() => {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(() => loadWorksheets(false), 700);
  });
}

async function logout() {
  if (formDirty && !confirm("A kijelentkezés törli a most beírt adatokat. Biztosan kijelentkezel?")) return;
  await MunkalapDB.logout();
  session = null;
  worksheets = [];
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
  selectedProfile = "";
  $("#profileSelect").value = "";
  $("#pinField").value = "";
  $("#pinFieldWrap").hidden = true;
  $("#enterButton").disabled = true;
}

$("#logoutButton").addEventListener("click", logout);
$("#reloadHistory").addEventListener("click", async () => {
  const button = $("#reloadHistory");
  button.disabled = true;
  button.textContent = "Frissítés…";
  try {
    if (!navigator.onLine) {
      showStatus("Nincs internetkapcsolat. A várakozó munkalapokat internetkapcsolatnál lehet elküldeni.", "pending");
      return;
    }
    await syncQueue();
    await loadWorksheets();
    updateQueueNotice();
    const waiting = ownQueue().length;
    if (waiting) {
      showStatus(`${waiting} munkalap továbbra is küldésre vár. Próbáld meg újra stabil internetkapcsolattal.`, "pending");
    } else {
      showStatus("A munkalapok frissítve.", "success");
    }
  } catch (error) {
    showStatus(`A frissítés nem sikerült: ${error?.message || "ismeretlen hiba"}.`);
  } finally {
    button.disabled = false;
    button.textContent = "Frissítés";
  }
});
$("#clearForm").addEventListener("click", () => {
  if (confirm("Biztosan törlöd a teljes munkalapot?")) resetForm();
});
$("#cancelEdit").addEventListener("click", () => resetForm());
$("#newWorksheet").addEventListener("click", () => {
  $("#successDialog").close();
  resetForm();
  if (updateReloadPending) { window.location.reload(); return; }
  window.scrollTo({ top: 0, behavior: "smooth" });
});
form.addEventListener("input", () => { formDirty = true; });

const dateField = form.elements.date;
const dateDialog = $("#dateDialog");
const dateYear = $("#dateYear");
const dateMonth = $("#dateMonth");
const dateDay = $("#dateDay");
const monthNames = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

function fillSelect(select, values, labels = values) {
  select.innerHTML = values.map((value, index) => `<option value="${value}">${labels[index]}</option>`).join("");
}

function refreshDays() {
  const selected = Number(dateDay.value) || 1;
  const count = new Date(Number(dateYear.value), Number(dateMonth.value), 0).getDate();
  const days = Array.from({ length: count }, (_, index) => index + 1);
  fillSelect(dateDay, days, days.map(day => `${day}.`));
  dateDay.value = String(Math.min(selected, count));
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 12 }, (_, index) => currentYear - 2 + index);
fillSelect(dateYear, years);
fillSelect(dateMonth, Array.from({ length: 12 }, (_, index) => index + 1), monthNames);
refreshDays();

$("#datePickerButton").addEventListener("click", () => {
  const iso = toDateInputValue(dateField.value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const today = new Date();
  const base = iso
    ? { year: iso[1], month: String(Number(iso[2])), day: String(Number(iso[3])) }
    : { year: String(currentYear), month: String(today.getMonth() + 1), day: String(today.getDate()) };
  if (!years.includes(Number(base.year))) dateYear.add(new Option(base.year, base.year));
  dateYear.value = base.year;
  dateMonth.value = base.month;
  refreshDays();
  dateDay.value = base.day;
  dateDialog.showModal();
});
dateYear.addEventListener("change", refreshDays);
dateMonth.addEventListener("change", refreshDays);
$("#dateCancel").addEventListener("click", () => dateDialog.close());
$("#dateApply").addEventListener("click", () => {
  dateField.value = `${dateYear.value}. ${String(dateMonth.value).padStart(2, "0")}. ${String(dateDay.value).padStart(2, "0")}.`;
  dateDialog.close();
  formDirty = true;
});
dateField.addEventListener("blur", () => { if (toDateInputValue(dateField.value)) dateField.value = formatHungarianDate(dateField.value); });

const installDialog = $("#installDialog");
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
function showInstallMessage(title, message) {
  $("#installDialogTitle").textContent = title;
  $("#installDialogText").textContent = message;
  installDialog.showModal();
}
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; });
window.addEventListener("appinstalled", () => { installPrompt = null; showInstallMessage("Sikeres telepítés", "A Munkalap alkalmazás telepítve van a telefonodra."); });
$("#installDialogClose").addEventListener("click", () => installDialog.close());
$("#installButton").addEventListener("click", async () => {
  if (isInstalled()) { showInstallMessage("Már telepítve van", "A Munkalap alkalmazás már telepítve van ezen a telefonon."); return; }
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showInstallMessage("Munkalap telepítése", isIos
    ? "Nyomd meg a böngésző Megosztás gombját, majd válaszd a Főképernyőhöz adás lehetőséget."
    : "Nyisd meg a böngésző menüjét, majd válaszd az Alkalmazás telepítése vagy a Főképernyőhöz adás lehetőséget.");
});

$("#refreshButton").addEventListener("click", async () => {
  if (!navigator.onLine) { showInstallMessage("Nincs internetkapcsolat", "A frissítéshez internetkapcsolat szükséges."); return; }
  if (formDirty && !confirm("A frissítés törli a most beírt adatokat. Biztosan frissíted az alkalmazást?")) return;
  const button = $("#refreshButton");
  button.disabled = true;
  button.textContent = "Frissítés…";
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("diszkertek-onallo-munkalap-")).map(key => caches.delete(key)));
    }
    const registration = serviceWorkerRegistration || await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch (_) {}
  const url = new URL(window.location.href);
  url.searchParams.set("app-version", APP_VERSION);
  window.location.replace(url.toString());
});

if ("serviceWorker" in navigator) {
  let updateReloadStarted = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateReloadStarted) return;
    if (formDirty) { updateReloadPending = true; return; }
    updateReloadStarted = true;
    const url = new URL(location.href);
    url.searchParams.set("app-version", APP_VERSION);
    window.location.replace(url.toString());
  });
  navigator.serviceWorker.register(`service-worker.js?v=${APP_VERSION}`, { updateViaCache: "none" })
    .then(registration => { serviceWorkerRegistration = registration; return registration.update(); })
    .catch(() => {});
}

async function initialize() {
  renderTeams();
  renderItems("maintenanceItems", "maintenance", MAINTENANCE);
  renderItems("constructionItems", "construction", CONSTRUCTION);
  renderProfileOptions();
  populateFilters();
  resetForm();
  if (LOCAL_PREVIEW) {
    $("#loginStatus").textContent = "HELYI BEMUTATÓ – PIN: 123456. Innen sem adat, sem e-mail nem kerül elküldésre.";
  }
  if (!MunkalapDB?.configured) {
    $("#loginStatus").textContent = "Az adatbázis-kapcsolat nem érhető el. Internetkapcsolat szükséges az első belépéshez.";
    return;
  }
  try {
    const restored = await MunkalapDB.restore();
    if (restored) await openApp(restored);
  } catch (error) {
    $("#loginStatus").textContent = `Az automatikus belépés nem sikerült: ${error.message}`;
  }
}

initialize();
