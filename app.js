const EMAIL_ENDPOINT = "https://formsubmit.co/ajax/info@diszkertek.hu";
const EMAIL_RECIPIENT = "info@diszkertek.hu";
const STABLE_APP_URL = "https://agnesgeller.github.io/diszkertek-munkalap/";
const APP_VERSION = "33";
const QUEUE_KEY = "diszkertek-munkalap-send-queue-v1";
const MANAGER_VIEW_KEY = "diszkertek-munkalap-manager-view-v1";
const DATABASE_FREE_LIMIT = 500 * 1024 * 1024;
const LEADERS = ["Ádám", "Ági", "Attila", "Bendegúz", "Gábor", "Márk", "Tamás"];
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
let officeLoaded = false;
let officeLoading = false;
let officeWeekStart = startOfOfficeWeek(new Date());
let officeWeekActive = true;
let managerView = "worksheet";
let customerDirectory = [];
let customerLetter = "";
const CUSTOMER_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
let customersLoaded = false;
let customersLoading = false;
let selectedCustomerId = null;
let selectedLocationId = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfOfficeWeek(value) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 2) % 7));
  return date;
}

function endOfOfficeWeek(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function shortHungarianDate(date) {
  return date.toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function applyOfficeWeek() {
  const end = endOfOfficeWeek(officeWeekStart);
  officeWeekActive = true;
  $("#filterFrom").value = dateToISO(officeWeekStart);
  $("#filterTo").value = dateToISO(end);
  $("#officeWeekLabel").textContent = `${shortHungarianDate(officeWeekStart)} – ${shortHungarianDate(end)}`;
  renderOffice();
}

function moveOfficeWeek(days) {
  officeWeekStart = new Date(officeWeekStart);
  officeWeekStart.setDate(officeWeekStart.getDate() + days);
  applyOfficeWeek();
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
  const isoCandidate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : (() => {
        const digits = text.replace(/\D/g, "").slice(0, 8);
        return digits.length === 8
          ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
          : "";
      })();
  const match = isoCandidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? isoCandidate
    : "";
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
  const rows = Object.entries(payload || {})
    .filter(([name, value]) => !name.startsWith("_") && String(value || "").trim())
    .map(([name, value]) => `${name}:\r\n${String(value).trim()}`);
  const body = ["MUNKALAP", "────────────────────", ...rows].join("\r\n\r\n");
  return `mailto:${EMAIL_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendEmail(payload) {
  if (LOCAL_PREVIEW) return;
  const formBody = new URLSearchParams();
  Object.entries(payload || {}).forEach(([name, value]) => formBody.append(name, String(value ?? "")));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(EMAIL_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: formBody,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Az automatikus e-mail-küldés túl sokáig várakozott.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY));
    if (!Array.isArray(queue)) return [];

    // A korábbi verziókból vagy félbeszakadt tárhelyírásból maradt hibás
    // elemek ne tudják megakasztani a teljes várólista feldolgozását.
    const validQueue = queue.filter(item =>
      item &&
      typeof item === "object" &&
      typeof item.queueId === "string" &&
      item.queueId &&
      item.record &&
      typeof item.record === "object"
    );
    if (validQueue.length !== queue.length) {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(validQueue)); }
      catch (_) { /* A használható elemek ettől még feldolgozhatók. */ }
    }
    return validQueue;
  }
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
  const emailWaiting = queue.find(item => !item.emailSent && !item.emailHandledManually);
  if (emailWaiting && !fallbackEmailContext) {
    fallbackEmailContext = { payload: emailWaiting.emailPayload, queueId: emailWaiting.queueId, clearAfterReturn: false };
    fallbackEmailButton.hidden = false;
  }
  const officeDevice = session.role === "manager" || Boolean(session.delegatedBy);
  if (!officeDevice) {
    notice.hidden = true;
    notice.textContent = "";
    return;
  }
  notice.hidden = false;
  const databaseWaiting = queue.filter(item => !item.databaseSaved).length;
  const emailWaitingCount = queue.filter(item => !item.emailSent && !item.emailHandledManually).length;
  const stages = [];
  if (databaseWaiting) stages.push(`${databaseWaiting} adatbázis-mentése vár`);
  if (emailWaitingCount) stages.push(`${emailWaitingCount} e-mail-küldése vár`);
  const lastError = [...queue].reverse().find(item => item.lastError || item.emailError);
  notice.textContent = `${queue.length} munkalap feldolgozása még nem teljes (${stages.join(", ")}). Az alkalmazás automatikusan újrapróbálja.${lastError ? ` Utolsó hiba: ${lastError.lastError || lastError.emailError}` : ""}`;
}

function isNetworkError(error) {
  return !navigator.onLine || /fetch|network|kapcsolat|load failed/i.test(String(error?.message || error || ""));
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
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
  try {
    let queue = readQueue();
    let changed = false;
    const canSyncAll = session.role === "manager" || Boolean(session.delegatedBy);
    for (const item of queue.filter(entry => canSyncAll || (entry.queuedBy || entry.userId) === session.userId)) {
      if (!item.databaseSaved) {
        try {
          const databaseTask = item.action === "update"
            ? MunkalapDB.update(item.record.id, item.record)
            : MunkalapDB.create(item.record, item.record.userId);
          await withTimeout(databaseTask, 12000, "Az adatbázis-kapcsolat túl sokáig várakozott.");
          item.databaseSaved = true;
          changed = true;
        } catch (error) {
          item.lastError = error?.message || "Mentési hiba";
          if (!isNetworkError(error)) item.permanentError = item.lastError;
        }
      }
      if (item.databaseSaved && item.statusUpdatePending) {
        try {
          await withTimeout(MunkalapDB.update(item.record.id, item.record), 12000, "Az irodai állapot mentése túl sokáig várakozott.");
          item.statusUpdatePending = false;
          changed = true;
        } catch (error) {
          item.lastError = error?.message || "Az irodai állapot mentése nem sikerült";
        }
      }
      const fallbackDecisionPending =
        fallbackEmailContext?.queueId === item.queueId &&
        (externalEmailInProgress || $("#fallbackConfirmDialog").open);
      if (!item.emailSent && !item.emailHandledManually && !fallbackDecisionPending) {
        try {
          await sendEmail(item.emailPayload);
          item.emailSent = true;
          changed = true;
        } catch (error) {
          item.emailError = error?.message || "E-mail-küldési hiba";
        }
      }
    }
    queue = queue.filter(item => !(item.databaseSaved && !item.statusUpdatePending && (item.emailSent || item.emailHandledManually)));
    writeQueue(queue);
    if (changed) await loadWorksheets(false);
    return changed;
  } finally {
    queueSyncRunning = false;
  }
}

function resetForm(options = {}) {
  const preserveFallback = Boolean(options.preserveFallback);
  form.reset();
  editingId = null;
  pendingCurrentQueueId = null;
  formDirty = false;
  selectedCustomerId = null;
  selectedLocationId = null;
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

function searchKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("hu-HU");
}

function customerNameKey(value) {
  return searchKey(value).replace(/ zoli$/, " zoltan");
}

function worksheetFromForm(existing) {
  const data = formDataObject();
  const customer = customerDirectory.find(item => customerNameKey(item.fullName) === customerNameKey(data.customerName));
  data.customerName = customer?.fullName || String(data.customerName || "").trim().replace(/\s+/g, " ").replace(/ zoli$/i, " Zoltán");
  const location = customer?.locations?.find(item => searchKey(item.address) === searchKey(data.address));
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
    customerId: customer?.id || selectedCustomerId,
    locationId: location?.id || selectedLocationId,
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
    let saved = null;
    let databaseError = null;
    let emailError = null;

    if ((!record.customerId || !record.locationId) && navigator.onLine) {
      try {
        const linked = await withTimeout(
          MunkalapDB.registerCustomerSuggestion(record.customer, record.address),
          5000,
          "Az ügyféllista most nem érhető el."
        );
        record.customerId = linked.customerId;
        record.locationId = linked.locationId;
      } catch (_) {
        // Az ügyféllista hibája nem akadályozhatja a munkalap beküldését.
      }
    }

    if (navigator.onLine) {
      const databaseTask = existing
        ? MunkalapDB.update(record.id, record)
        : MunkalapDB.create(record, session.userId);
      const [databaseResult, emailResult] = await Promise.allSettled([
        withTimeout(Promise.resolve(databaseTask), 12000, "Az adatbázis-kapcsolat túl sokáig várakozott."),
        sendEmail(emailPayload)
      ]);
      if (databaseResult.status === "fulfilled") {
        saved = databaseResult.value;
        updateWorksheetCache(saved);
      } else {
        databaseError = databaseResult.reason;
      }
      if (emailResult.status === "rejected") emailError = emailResult.reason;
    } else {
      databaseError = new TypeError("Nincs internetkapcsolat");
      emailError = new TypeError("Nincs internetkapcsolat");
    }

    if (!databaseError && !emailError) {
      resetForm();
      $("#successDialog").showModal();
      return;
    }

    if (databaseError && emailError) record.data._officeStatus = "database_delayed_email_fallback";
    else if (databaseError) record.data._officeStatus = "database_delayed";
    else if (emailError) record.data._officeStatus = "email_fallback";
    const queuedRecord = saved ? { ...record, ...saved, data: { ...record.data } } : record;
    const queued = makeQueueItem(action, queuedRecord, emailPayload, Boolean(saved));
    queued.statusUpdatePending = Boolean(saved && emailError);
    queued.emailSent = !emailError;
    if (databaseError) queued.lastError = databaseError?.message || "ismeretlen mentési hiba";
    addQueueItem(queued);

    if (!emailError) {
      resetForm();
      updateQueueNotice();
      $("#successDialog").showModal();
      return;
    }

    pendingCurrentQueueId = queued.queueId;
    fallbackEmailContext = { payload: emailPayload, queueId: queued.queueId, clearAfterReturn: true };
    fallbackEmailButton.hidden = false;
    showStatus("Az automatikus küldés nem sikerült. Nyomd meg a „Küldés e-mail alkalmazással” gombot.", "pending");
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
  externalEmailInProgress = true;
  window.location.href = fallbackEmailUrl(fallbackEmailContext.payload);
});

function finishExternalEmail() {
  if (!externalEmailInProgress) return;
  externalEmailInProgress = false;
  $("#fallbackConfirmDialog").showModal();
}

$("#fallbackSent").addEventListener("click", () => {
  const context = fallbackEmailContext;
  if (context?.queueId) updateQueueItem(context.queueId, { emailHandledManually: true });
  $("#fallbackConfirmDialog").close();
  fallbackEmailContext = null;
  resetForm();
  $("#successDialog").showModal();
  syncQueue();
});

$("#fallbackNotSent").addEventListener("click", () => {
  $("#fallbackConfirmDialog").close();
  fallbackEmailButton.hidden = false;
  showStatus("Az e-mail nem lett elküldve. Nyomd meg újra a „Küldés e-mail alkalmazással” gombot.", "pending");
  syncQueue();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  finishExternalEmail();
  if (updateReloadPending && !formDirty && !window.Billing?.hasUnsaved()) window.location.reload();
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
  const officeStatus = {
    database_delayed: "Az adatbázis-mentés csak késleltetett újrapróbálással sikerült.",
    email_fallback: "Az automatikus e-mail-küldés elsőre nem sikerült.",
    database_delayed_email_fallback: "Az adatbázis-mentés késett, és az automatikus e-mail-küldés sem sikerült elsőre."
  }[data._officeStatus];
  const canManagePending = session?.role === "manager" || Boolean(session?.delegatedBy);
  return `
    <article class="worksheet-card" data-id="${escapeHTML(item.id)}">
      <h3>Csapat: ${escapeHTML(item.leader)}</h3>
      ${item.pending && canManagePending ? `<p class="pending-record"><b>Feldolgozásra vár</b> – a részletes állapot a lista felett látható.</p>` : ""}
      ${office && officeStatus ? `<p class="pending-record"><b>Irodai figyelmeztetés:</b> ${escapeHTML(officeStatus)}</p>` : ""}
      ${listHTML(teams, "team-summary")}
      ${subcontractor ? `<p><b>Alvállalkozó:</b> ${escapeHTML(subcontractor)}</p>` : ""}
      ${item.customer ? `<p><b>Ügyfél:</b> ${escapeHTML(item.customer)}</p>` : ""}
      ${item.address ? `<p><b>Cím:</b> ${escapeHTML(item.address)}</p>` : ""}
      ${item.date ? `<p><b>Dátum:</b> ${escapeHTML(formatHungarianDate(item.date))}</p>` : ""}
      ${materials.length ? `<div class="summary-group"><b>Tételek:</b>${listHTML(materials)}</div>` : ""}
      ${rentals.length ? `<div class="summary-group"><b>Gépbérlés:</b>${listHTML(rentals)}</div>` : ""}
      <div class="card-actions">
        ${item.pending ? (canManagePending ? `<button class="delete-button" type="button" data-cancel-queue="${escapeHTML(item.pendingQueueId)}">Várakozó példány törlése</button>` : "") : `<button type="button" data-edit="${escapeHTML(item.id)}">Megnyitás / Szerkesztés</button>`}
        ${office ? `<button type="button" data-print="${escapeHTML(item.id)}">PDF / Nyomtatás</button>` : ""}
        ${office && !item.pending ? `<button class="budget-tab" type="button" data-budget="${escapeHTML(item.id)}">Elszámolás</button>` : ""}
        ${office && !item.pending ? `<button class="delete-button" type="button" data-delete="${escapeHTML(item.id)}">Törlés</button>` : ""}
      </div>
    </article>`;
}

function sortedByCreated(items) {
  return [...items].sort((first, second) =>
    String(second?.createdAt || "").localeCompare(String(first?.createdAt || "")) ||
    String(second?.date || "").localeCompare(String(first?.date || ""))
  );
}

function ownRecentWorksheets() {
  const saved = worksheets.filter(item => item.userId === session?.userId);
  const savedIds = new Set(saved.map(item => item.id));
  const pending = ownQueue()
    .filter(item => !item.databaseSaved && item.record && !savedIds.has(item.record.id))
    .map(item => ({
      ...item.record,
      pending: true,
      pendingQueueId: item.queueId,
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

function officeAddressKey(value) {
  return searchKey(value).replace(/[.,]/g, "");
}

function officeLocationKey(item) {
  if (item.locationId) return `location:${item.locationId}`;
  const customer = customerDirectory.find(entry => item.customerId
    ? entry.id === item.customerId
    : customerNameKey(entry.fullName) === customerNameKey(item.customer));
  const location = (customer?.locations || []).find(entry => officeAddressKey(entry.address) === officeAddressKey(item.address));
  if (location) return `location:${location.id}`;
  return `legacy:${JSON.stringify([item.customerId || customerNameKey(item.customer), officeAddressKey(item.address)])}`;
}

function officeLocationOptions(query = "") {
  const needle = customerNameKey(query);
  const options = new Map();
  const matches = name => !needle || customerNameKey(name).includes(needle);
  for (const customer of customerDirectory) {
    if (!matches(customer.fullName)) continue;
    for (const location of customer.locations || []) {
      if (location.active === false) continue;
      options.set(`location:${location.id}`, `${customer.fullName} — ${location.address}`);
    }
  }
  for (const item of worksheets) {
    const customer = customerDirectory.find(entry => entry.id === item.customerId);
    const name = customer?.fullName || item.customer;
    if (!matches(name) && !matches(item.customer)) continue;
    const key = officeLocationKey(item);
    if (!options.has(key)) options.set(key, `${name} — ${item.address || "Helyszín nincs megadva"}`);
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "hu"));
}

function renderOfficeLocations() {
  const select = $("#filterLocation");
  const selected = select.value;
  const options = officeLocationOptions($("#filterCustomer").value);
  const oneCustomer = new Set(options.map(option => option.label.split(" — ")[0])).size === 1;
  select.innerHTML = `<option value="">Minden helyszín</option>${options.map(option => `<option value="${escapeHTML(option.value)}" data-full-label="${escapeHTML(option.label)}">${escapeHTML(oneCustomer ? option.label.split(" — ").slice(1).join(" — ") : option.label)}</option>`).join("")}`;
  select.value = options.some(option => option.value === selected) ? selected : "";
}

function filteredOfficeWorksheets() {
  const leader = $("#filterLeader").value;
  const customer = searchKey($("#filterCustomer").value);
  const address = searchKey($("#filterAddress").value);
  const from = $("#filterFrom").value;
  const to = $("#filterTo").value;
  const location = $("#filterLocation").value;
  return [...worksheets]
    .filter(item => !leader || item.leader === leader)
    .filter(item => !customer || customerNameKey(item.customer).includes(customerNameKey(customer)) || customerNameKey(customerDirectory.find(entry => entry.id === item.customerId)?.fullName).includes(customerNameKey(customer)))
    .filter(item => !location || officeLocationKey(item) === location)
    .filter(item => !address || searchKey(item.address).includes(address))
    .filter(item => !from || item.date >= from)
    .filter(item => !to || item.date <= to)
    .sort((first, second) => second.date.localeCompare(first.date) || String(second.createdAt || "").localeCompare(String(first.createdAt || "")));
}

function renderOffice() {
  if (session?.role !== "manager") return;
  renderOfficeLocations();
  const filtered = filteredOfficeWorksheets();
  const location = $("#filterLocation");
  $("#officeScope").textContent = location.value ? location.selectedOptions[0].dataset.fullLabel : "";
  $("#officeScope").hidden = !location.value;
  $("#officeCount").textContent = `${filtered.length} munkalap`;
  $("#officeWorksheets").innerHTML = filtered.length ? filtered.map(item => worksheetCardHTML(item, true)).join("") : `<p class="empty-list">Nincs a szűrésnek megfelelő munkalap.</p>`;
}

function showOfficeStatus(message = "", type = "") {
  const target = $("#officeStatus");
  target.textContent = message;
  target.className = `office-status${type ? ` ${type}` : ""}`;
}

function hideCustomerSuggestions(target) {
  target.hidden = true;
  target.innerHTML = "";
  const input = target.parentElement?.querySelector("input");
  if (input) input.setAttribute("aria-expanded", "false");
}

function showCustomerSuggestions(target, matches) {
  if (!matches.length) {
    hideCustomerSuggestions(target);
    return;
  }
  target.innerHTML = matches.map(match => `
    <button type="button" data-customer-id="${escapeHTML(match.customerId)}" data-location-id="${escapeHTML(match.locationId || "")}" data-customer-name="${escapeHTML(match.name)}" data-address="${escapeHTML(match.address || "")}">
      <b>${escapeHTML(match.name)}</b>${match.address ? `<span>${escapeHTML(match.address)}</span>` : ""}
    </button>`).join("");
  target.hidden = false;
  const input = target.parentElement?.querySelector("input");
  if (input) input.setAttribute("aria-expanded", "true");
}

function customerMatches(query, addressOnly = false) {
  const needle = customerNameKey(query);
  if (needle.length < 2) return [];
  const selected = selectedCustomerId
    ? customerDirectory.filter(customer => customer.id === selectedCustomerId)
    : customerDirectory;
  const matches = [];
  for (const customer of selected) {
    if (!customer.active) continue;
    const activeLocations = (customer.locations || []).filter(location => location.active !== false);
    const locations = activeLocations.length ? activeLocations : [{ id: "", address: "" }];
    for (const location of locations) {
      const name = customerNameKey(customer.fullName);
      const nameMatch = name.startsWith(needle) || name.split(" ").some(part => part.startsWith(needle));
      const addressMatch = searchKey(location.address).includes(needle);
      if ((addressOnly && addressMatch) || (!addressOnly && nameMatch)) {
        matches.push({ customerId: customer.id, locationId: location.id, name: customer.fullName, address: location.address });
      }
    }
  }
  return matches.slice(0, 12);
}

function updateSuggestions() {
  const customerInput = form.elements.customerName;
  const addressInput = form.elements.address;
  customerInput.oninput = () => {
    selectedCustomerId = null;
    selectedLocationId = null;
    showCustomerSuggestions($("#customerSuggestions"), customerMatches(customerInput.value));
  };
  customerInput.onfocus = () => showCustomerSuggestions($("#customerSuggestions"), customerMatches(customerInput.value));
  addressInput.oninput = () => {
    selectedLocationId = null;
    showCustomerSuggestions($("#addressSuggestions"), customerMatches(addressInput.value, true));
  };
  addressInput.onfocus = () => showCustomerSuggestions($("#addressSuggestions"), customerMatches(addressInput.value, true));
}

function chooseCustomerSuggestion(button) {
  selectedCustomerId = button.dataset.customerId || null;
  selectedLocationId = button.dataset.locationId || null;
  form.elements.customerName.value = button.dataset.customerName || "";
  form.elements.address.value = button.dataset.address || "";
  hideCustomerSuggestions($("#customerSuggestions"));
  hideCustomerSuggestions($("#addressSuggestions"));
  formDirty = true;
}

$("#customerSuggestions").addEventListener("click", event => {
  const button = event.target.closest("button[data-customer-id]");
  if (button) chooseCustomerSuggestion(button);
});
$("#addressSuggestions").addEventListener("click", event => {
  const button = event.target.closest("button[data-customer-id]");
  if (button) chooseCustomerSuggestion(button);
});
document.addEventListener("click", event => {
  if (!event.target.closest(".customer-field")) {
    hideCustomerSuggestions($("#customerSuggestions"));
    hideCustomerSuggestions($("#addressSuggestions"));
  }
});

async function loadCustomers(manager = session?.role === "manager", showErrors = false) {
  if (!session || customersLoading) return;
  const loadingSession = session;
  customersLoading = true;
  if (manager) $("#customersStatus").textContent = "Ügyféllista betöltése…";
  try {
    const loadedCustomers = await MunkalapDB.listCustomers(Boolean(manager));
    if (session !== loadingSession) return;
    customerDirectory = loadedCustomers;
    customersLoaded = true;
    renderCustomers();
    updateSuggestions();
    if (manager) renderOffice();
    if (manager) $("#customersStatus").textContent = "";
  } catch (error) {
    if (session !== loadingSession) return;
    customersLoaded = false;
    if (manager && showErrors) $("#customersStatus").textContent = `Az ügyféllista nem tölthető be: ${error?.message || "ismeretlen hiba"}.`;
  } finally {
    if (session === loadingSession) customersLoading = false;
  }
}

function customerInitial(name) {
  const initial = String(name || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().charAt(0);
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

function customerListPage(customers, query, letter) {
  const available = new Set(customers.map(customer => customerInitial(customer.fullName)));
  const selected = available.has(letter) ? letter : "";
  const needle = searchKey(query);
  const filtered = customers.filter(customer => {
    if (!needle) return !selected || customerInitial(customer.fullName) === selected;
    const searchable = searchKey([customer.fullName, customer.email, customer.phone, customer.contactName, ...(customer.locations || []).filter(location => location.active !== false).map(location => location.address)].join(" "));
    return searchable.includes(needle);
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, "hu-HU"));
  return { available, selected, filtered, searching: Boolean(needle) };
}

function renderCustomers() {
  if (session?.role !== "manager") return;
  const { available, selected, filtered, searching } = customerListPage(customerDirectory, $("#customerSearch").value, customerLetter);
  customerLetter = selected;
  $("#customerAlphabet").innerHTML = `<button type="button" data-customer-letter="" aria-label="Minden ügyfél" aria-pressed="${!searching && !selected}">Mind</button>` + CUSTOMER_LETTERS.filter(letter => letter !== "#" || available.has(letter)).map(letter => `<button type="button" data-customer-letter="${letter}" aria-label="${letter} betűs ügyfelek" aria-pressed="${!searching && letter === selected}" ${available.has(letter) ? "" : "disabled"}>${letter}</button>`).join("");
  $("#customersCount").textContent = `${filtered.length} / ${customerDirectory.length} ügyfél`;
  $("#customersList").innerHTML = filtered.length ? filtered.map(customer => `
    <article class="customer-card">
      <header><div><h3>${escapeHTML(customer.fullName)}</h3><div class="customer-meta">
        ${customer.active ? "" : `<span class="customer-badge inactive">Inaktív</span>`}
      </div></div><button type="button" data-customer-edit="${escapeHTML(customer.id)}">Szerkesztés</button></header>
      ${(customer.locations || []).some(location => location.active !== false) ? `<p><b>Helyszínek:</b> ${(customer.locations || []).filter(location => location.active !== false).map(location => escapeHTML(location.address)).join(" · ")}</p>` : `<p><b>Helyszín:</b> még nincs megadva</p>`}
      ${customer.email || customer.phone ? `<p><b>Kapcsolat:</b> ${escapeHTML([customer.email, customer.phone].filter(Boolean).join(" · "))}</p>` : ""}
      <div class="card-actions"><button class="delete-button" type="button" data-customer-delete="${escapeHTML(customer.id)}">Törlés</button></div>
    </article>`).join("") : `<p class="empty-list">Nincs a keresésnek megfelelő ügyfél.</p>`;
}

function openCustomerDialog(customer = null) {
  const customerForm = $("#customerForm");
  customerForm.reset();
  customerForm.elements.id.value = customer?.id || "";
  customerForm.elements.fullName.value = customer?.fullName || "";
  customerForm.elements.customerType.value = customer?.customerType || "";
  customerForm.elements.contactName.value = customer?.contactName || "";
  customerForm.elements.email.value = customer?.email || "";
  customerForm.elements.phone.value = customer?.phone || "";
  customerForm.elements.taxNumber.value = customer?.taxNumber || "";
  customerForm.elements.billingMode.value = customer?.billingMode || "per_job";
  customerForm.elements.monthlyFlatFee.value = customer?.monthlyFlatFee ?? "";
  customerForm.elements.locations.value = (customer?.locations || []).filter(location => location.active !== false).map(location => location.address).join("\n");
  customerForm.elements.notes.value = customer?.notes || "";
  customerForm.elements.approved.checked = customer?.reviewStatus === "approved";
  customerForm.elements.active.checked = customer?.active !== false;
  $("#customerDialogTitle").textContent = customer ? "Ügyfél szerkesztése" : "Új ügyfél";
  $("#customerDialogStatus").textContent = "";
  $("#customerDialog").showModal();
}

$("#customerSearch").addEventListener("input", renderCustomers);
$("#customerAlphabet").addEventListener("click", event => {
  const button = event.target.closest("button[data-customer-letter]");
  if (!button || button.disabled) return;
  customerLetter = button.dataset.customerLetter;
  $("#customerSearch").value = "";
  renderCustomers();
  $("#customerAlphabet").querySelector(`[data-customer-letter="${customerLetter}"]`)?.focus({ preventScroll: true });
});
$("#newCustomer").addEventListener("click", () => openCustomerDialog());
$("#customerCancel").addEventListener("click", () => $("#customerDialog").close());
$("#customersList").addEventListener("click", async event => {
  const edit = event.target.closest("[data-customer-edit]");
  const remove = event.target.closest("[data-customer-delete]");
  if (edit) openCustomerDialog(customerDirectory.find(customer => customer.id === edit.dataset.customerEdit));
  if (remove) {
    const customer = customerDirectory.find(item => item.id === remove.dataset.customerDelete);
    if (!customer || !confirm(`Biztosan törlöd ezt az ügyfelet?\n\n${customer.fullName}\n\nHa munkalap kapcsolódik hozzá, a rendszer biztonságból nem engedi törölni; ilyenkor tedd inaktívvá.`)) return;
    try {
      await MunkalapDB.removeCustomer(customer.id);
      customerDirectory = customerDirectory.filter(item => item.id !== customer.id);
      renderCustomers();
      $("#customersStatus").textContent = "Az ügyfelet töröltük.";
    } catch (_) {
      $("#customersStatus").textContent = "Ehhez az ügyfélhez már tartozik munkalap vagy helyszín. Törlés helyett kapcsold ki az Aktív ügyfél jelölést.";
    }
  }
});

$("#customerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const customerForm = event.currentTarget;
  if (!customerForm.reportValidity()) return;
  const existing = customerDirectory.find(customer => customer.id === customerForm.elements.id.value);
  const addresses = String(customerForm.elements.locations.value || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const locations = addresses.map(address => {
    const saved = existing?.locations?.find(location => searchKey(location.address) === searchKey(address));
    return { id: saved?.id, address, label: saved?.label || "", active: true, reviewStatus: customerForm.elements.approved.checked ? "approved" : "pending" };
  });
  const payload = {
    id: existing?.id,
    fullName: customerForm.elements.fullName.value.trim(),
    customerType: customerForm.elements.customerType.value.trim(),
    contactName: customerForm.elements.contactName.value.trim(),
    email: customerForm.elements.email.value.trim(),
    phone: customerForm.elements.phone.value.trim(),
    taxNumber: customerForm.elements.taxNumber.value.trim(),
    billingMode: customerForm.elements.billingMode.value,
    monthlyFlatFee: customerForm.elements.monthlyFlatFee.value,
    notes: customerForm.elements.notes.value.trim(),
    reviewStatus: customerForm.elements.approved.checked ? "approved" : "pending",
    active: customerForm.elements.active.checked,
    locations,
    removedLocationIds: (existing?.locations || []).filter(location => !locations.some(saved => saved.id === location.id)).map(location => location.id)
  };
  const saveButton = $("#customerSave");
  saveButton.disabled = true;
  $("#customerDialogStatus").textContent = "Mentés…";
  try {
    await MunkalapDB.saveCustomer(payload);
    customerLetter = customerInitial(payload.fullName);
    $("#customerSearch").value = "";
    $("#customerDialog").close();
    customersLoaded = false;
    await loadCustomers(true, true);
    $("#customersStatus").textContent = "Az ügyfél adatait elmentettük.";
  } catch (error) {
    $("#customerDialogStatus").textContent = `A mentés nem sikerült: ${error?.message || "ismeretlen hiba"}.`;
  } finally {
    saveButton.disabled = false;
  }
});

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
    const recent = await MunkalapDB.listRecent(session.userId);
    if (officeLoaded) {
      const byId = new Map(worksheets.map(item => [item.id, item]));
      recent.forEach(item => byId.set(item.id, item));
      worksheets = [...byId.values()];
    } else {
      worksheets = recent;
    }
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

async function loadOfficeWorksheets(showErrors = true) {
  if (session?.role !== "manager" || officeLoading) return;
  officeLoading = true;
  $("#officeCount").textContent = "Munkalapok betöltése…";
  showOfficeStatus("A teljes lista betöltése több részletben történik.");
  try {
    worksheets = await MunkalapDB.listAll();
    officeLoaded = true;
    renderAll();
    showOfficeStatus("A teljes irodai lista betöltve.", "success");
  } catch (error) {
    if (showErrors) showOfficeStatus(`A teljes lista betöltése nem sikerült: ${error?.message || "ismeretlen hiba"}.`, "error");
  } finally {
    officeLoading = false;
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
  selectedCustomerId = item.customerId || null;
  selectedLocationId = item.locationId || null;
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
  const cancelQueue = event.target.closest("[data-cancel-queue]");
  if (button) openWorksheetForEdit(button.dataset.edit);
  if (cancelQueue) cancelQueuedWorksheet(cancelQueue.dataset.cancelQueue);
});

function cancelQueuedWorksheet(queueId) {
  const item = readQueue().find(entry => entry.queueId === queueId);
  if (!item) return;
  const label = `${item.record?.leader || "Munkalap"} – ${item.record?.customer || "Nincs ügyfél"}`;
  if (!confirm(`Biztosan törlöd ezt a várakozó példányt?\n\n${label}\n\nA rendszer ezután nem próbálja újra elküldeni vagy elmenteni.`)) return;
  removeQueueItem(queueId);
  if (pendingCurrentQueueId === queueId) pendingCurrentQueueId = null;
  if (fallbackEmailContext?.queueId === queueId) {
    fallbackEmailContext = null;
    fallbackEmailButton.hidden = true;
  }
  showStatus("A várakozó példányt töröltük. Más munkalaphoz nem nyúltunk.", "success");
}

$("#officeWorksheets").addEventListener("click", async event => {
  const edit = event.target.closest("[data-edit]");
  const print = event.target.closest("[data-print]");
  const remove = event.target.closest("[data-delete]");
  const budget = event.target.closest("[data-budget]");
  if (budget) { await setManagerView("budget"); if (managerView === "budget") await window.Billing?.open(budget.dataset.budget); }
  if (edit) openWorksheetForEdit(edit.dataset.edit);
  if (print) printWorksheet(print.dataset.print);
  if (remove) deleteWorksheet(remove.dataset.delete, remove);
});

async function deleteWorksheet(id, button) {
  if (session?.role !== "manager") return;
  const item = worksheets.find(worksheet => worksheet.id === id);
  if (!item) return;
  const label = `${item.leader} – ${item.customer || "Nincs ügyfél"} – ${formatHungarianDate(item.date)}`;
  if (!confirm(`Biztosan törlöd ezt a munkalapot?\n\n${label}`)) return;
  if (!confirm(`VÉGLEGES TÖRLÉS\n\n${label}\n\nA törlés nem vonható vissza. Folytatod?`)) return;
  button.disabled = true;
  button.textContent = "Törlés…";
  showOfficeStatus("A munkalap törlése folyamatban…");
  try {
    await MunkalapDB.remove(id);
    worksheets = worksheets.filter(worksheet => worksheet.id !== id);
    renderAll();
    showOfficeStatus("A munkalapot véglegesen töröltük.", "success");
    loadDatabaseUsage();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Törlés";
    showOfficeStatus(error?.code === "23503" ? "Ehhez a munkalaphoz elszámolás vagy más kapcsolódó adat tartozik, ezért nem törölhető." : `A törlés nem sikerült: ${error?.message || "ismeretlen hiba"}.`, "error");
  }
}

function setManagerView(view) {
  if (session?.role !== "manager") return;
  if (managerView === "budget" && view !== "budget" && !window.Billing?.canLeave()) return;
  managerView = ["office", "customers", "worksheet", "budget", "statistics"].includes(view) ? view : "worksheet";
  officeViewActive = managerView === "office";
  localStorage.setItem(MANAGER_VIEW_KEY, managerView);
  $("#officeView").hidden = !officeViewActive;
  $("#customersView").hidden = managerView !== "customers";
  $("#worksheetView").hidden = managerView !== "worksheet";
  $("#budgetView").hidden = managerView !== "budget";
  $("#statisticsView").hidden = managerView !== "statistics";
  $("#budgetTab").classList.toggle("active", managerView === "budget");
  $("#officeTab").classList.toggle("active", officeViewActive);
  $("#customersTab").classList.toggle("active", managerView === "customers");
  $("#statisticsTab").classList.toggle("active", managerView === "statistics");
  $("#worksheetTab").classList.toggle("active", managerView === "worksheet");
  if (officeViewActive) {
    if (officeWeekActive) applyOfficeWeek();
    renderOffice();
    loadDatabaseUsage();
    if (!officeLoaded) loadOfficeWorksheets();
  }
  if (managerView === "customers") {
    renderCustomers();
    if (!customersLoaded) loadCustomers(true, true);
  }
  if (managerView === "budget") return window.Billing?.show();
  if (managerView === "statistics") return window.Statistics?.show();
}

$("#officeTab").addEventListener("click", () => setManagerView("office"));
$("#customersTab").addEventListener("click", () => setManagerView("customers"));
$("#budgetTab").addEventListener("click", () => setManagerView("budget"));
$("#statisticsTab").addEventListener("click", () => setManagerView("statistics"));
$("#worksheetTab").addEventListener("click", () => setManagerView("worksheet"));
$("#previousOfficeWeek").addEventListener("click", () => moveOfficeWeek(-7));
$("#nextOfficeWeek").addEventListener("click", () => moveOfficeWeek(7));
$("#showAllOfficeWeeks").addEventListener("click", () => {
  officeWeekActive = false;
  $("#filterFrom").value = "";
  $("#filterTo").value = "";
  $("#officeWeekLabel").textContent = "Összes munkalap";
  renderOffice();
});

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

function officeExportRows(items) {
  const rows = [["Csoportvezető", "Ügyfél", "Cím", "Dátum", "Csapat", "Alvállalkozó", "Feladat", "Tételek", "Gépbérlés"]];
  items.forEach(item => rows.push([
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
  return rows;
}

function downloadExcelCompatibleCSV(rows, filename) {
  const content = "\ufeff" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportOfficeCSV() {
  const items = filteredOfficeWorksheets();
  if (!items.length) {
    showOfficeStatus("Nincs letölthető munkalap a jelenlegi szűrésben.", "error");
    return;
  }
  downloadExcelCompatibleCSV(officeExportRows(items), `munkalapok-${isoToday()}.csv`);
  showOfficeStatus(`${items.length} munkalap Excel-kompatibilis fájlja letöltve.`, "success");
}

async function archivePreviousYear() {
  if (!officeLoaded) await loadOfficeWorksheets();
  if (!officeLoaded) return;
  const year = new Date().getFullYear() - 1;
  const items = worksheets.filter(item => item.date?.startsWith(`${year}-`));
  if (!items.length) {
    showOfficeStatus(`Nincs archiválható ${year}. évi munkalap.`, "error");
    return;
  }
  downloadExcelCompatibleCSV(officeExportRows(items), `munkalap-archivum-${year}.csv`);
  showOfficeStatus(`${items.length} darab ${year}. évi munkalap archiválva. Az adatbázisból semmi nem törlődött.`, "success");
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
$("#archivePreviousYear").addEventListener("click", archivePreviousYear);
$("#exportPdf").addEventListener("click", printOfficeList);

$("#filterLeader").addEventListener("change", renderOffice);
$("#filterLocation").addEventListener("change", renderOffice);
[$("#filterFrom"), $("#filterTo")].forEach(element => element.addEventListener("change", () => {
  officeWeekActive = false;
  $("#officeWeekLabel").textContent = "Egyéni időszak";
  renderOffice();
}));
[$("#filterCustomer"), $("#filterAddress")].forEach(element => element.addEventListener("input", renderOffice));
$("#clearFilters").addEventListener("click", () => {
  $("#filterLeader").value = "";
  $("#filterCustomer").value = "";
  $("#filterAddress").value = "";
  $("#filterLocation").value = "";
  $("#filterFrom").value = "";
  $("#filterTo").value = "";
  officeWeekActive = false;
  $("#officeWeekLabel").textContent = "Összes munkalap";
  renderOffice();
});

function renderProfileOptions(lockedName = "") {
  if (lockedName) {
    $("#profileSelect").innerHTML = `<option value="${escapeHTML(lockedName)}">${escapeHTML(lockedName)}</option>`;
    return;
  }
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
  const remembered = hasSelection && MunkalapDB.hasRememberedLogin(selectedProfile);
  $("#pinFieldWrap").hidden = !hasSelection || remembered;
  $("#pinField").value = "";
  $("#enterButton").disabled = !hasSelection;
  $("#loginStatus").textContent = "";
  if (hasSelection && !remembered) $("#pinField").focus();
});

async function login() {
  const pin = $("#pinField").value;
  const status = $("#loginStatus");
  const button = $("#enterButton");
  const remembered = selectedProfile && MunkalapDB.hasRememberedLogin(selectedProfile);
  if (!selectedProfile || (!remembered && pin.length < 6)) {
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
    if (!MunkalapDB.hasRememberedLogin(selectedProfile)) {
      $("#pinFieldWrap").hidden = false;
      $("#pinField").focus();
    }
  } finally {
    button.disabled = false;
    button.textContent = "Belépés";
  }
}

$("#enterButton").addEventListener("click", login);
$("#pinField").addEventListener("keydown", event => { if (event.key === "Enter") login(); });

async function openApp(profile) {
  window.Billing?.reset();
  window.Statistics?.reset();
  session = profile;
  customerLetter = "";
  $("#customerAlphabet").innerHTML = "";
  $("#customerSearch").value = "";
  $("#customerDialog").close();
  $("#customerForm").reset();
  $("#customersList").innerHTML = "";
  $("#customersCount").textContent = "";
  $("#customersStatus").textContent = "";
  officeLoaded = false;
  officeLoading = false;
  customersLoaded = false;
  customersLoading = false;
  customerDirectory = [];
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#activeUser").textContent = "";
  $("#activeUser").hidden = true;
  const canSwitchProfile = profile.role === "manager" || Boolean(profile.delegatedBy);
  $("#logoutButton").hidden = false;
  $("#logoutButton").textContent = canSwitchProfile ? "Kilépés / Névváltás" : "Kilépés";
  $("#previewBanner").hidden = !LOCAL_PREVIEW;
  $("#managerTabs").hidden = profile.role !== "manager";
  resetForm();
  const initialManagerView = profile.role === "manager"
    ? localStorage.getItem(MANAGER_VIEW_KEY) || "worksheet"
    : "worksheet";
  if (profile.role !== "manager") {
    $("#officeView").hidden = true;
    $("#customersView").hidden = true;
    $("#statisticsView").hidden = true;
    $("#worksheetView").hidden = false;
  }
  const now = new Date();
  $("#archiveReminder").hidden = !(now.getMonth() === 11 && now.getDate() >= 10);
  await loadWorksheets();
  await loadCustomers(profile.role === "manager", false);
  if (profile.role === "manager") setManagerView(initialManagerView);
  updateQueueNotice();
  syncQueue();
  MunkalapDB.subscribe(() => {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(() => {
      officeLoaded = false;
      if (officeViewActive && session?.role === "manager") loadOfficeWorksheets(false);
      else loadWorksheets(false);
    }, 700);
  });
}

async function logout() {
  if (window.Billing && !window.Billing.canLeave()) return;
  if (formDirty && !confirm("A kijelentkezés törli a most beírt adatokat. Biztosan kijelentkezel?")) return;
  const previousSession = session;
  const canSwitchProfile = previousSession?.role === "manager" || Boolean(previousSession?.delegatedBy);
  await MunkalapDB.logout();
  window.Billing?.reset();
  window.Statistics?.reset();
  session = null;
  worksheets = [];
  officeLoaded = false;
  officeLoading = false;
  customersLoaded = false;
  customersLoading = false;
  customerDirectory = [];
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
  selectedProfile = canSwitchProfile ? "" : previousSession?.name || "";
  renderProfileOptions(canSwitchProfile ? "" : selectedProfile);
  $("#profileSelect").value = selectedProfile;
  $("#pinField").value = "";
  const rememberedOwnLogin = selectedProfile && MunkalapDB.hasRememberedLogin(selectedProfile);
  $("#pinFieldWrap").hidden = !selectedProfile || rememberedOwnLogin;
  $("#enterButton").disabled = !selectedProfile;
  $("#loginStatus").textContent = "";
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
    if (waiting && (session.role === "manager" || session.delegatedBy)) {
      const pending = ownQueue();
      const databaseWaiting = pending.filter(item => !item.databaseSaved).length;
      const emailWaiting = pending.filter(item => !item.emailSent && !item.emailHandledManually).length;
      showStatus(`${waiting} munkalap feldolgozása még nem teljes: ${databaseWaiting} adatbázis-mentés és ${emailWaiting} e-mail-küldés vár. A részletes hiba a Munkalapjaim felett látható.`, "pending");
    } else if (waiting) {
      showStatus("A munkalapok frissítése folyamatban van. Az alkalmazás automatikusan folytatja.", "pending");
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
const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroidDevice = () => /android/i.test(navigator.userAgent);
const isMobileDevice = () => isIosDevice() || isAndroidDevice() || window.matchMedia("(max-width: 760px)").matches;
function showInstallMessage(title, message) {
  $("#installDialogTitle").textContent = title;
  $("#installDialogText").textContent = message;
  installDialog.showModal();
}
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; });
window.addEventListener("appinstalled", () => { installPrompt = null; showInstallMessage("Sikeres telepítés", `A Munkalap alkalmazás telepítve van ${isMobileDevice() ? "a telefonodra" : "a számítógépedre"}.`); });
$("#installDialogClose").addEventListener("click", () => installDialog.close());
$("#installButton").addEventListener("click", async () => {
  if (isInstalled()) { showInstallMessage("Már telepítve van", `A Munkalap alkalmazás már telepítve van ${isMobileDevice() ? "ezen a telefonon" : "ezen a számítógépen"}.`); return; }
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  let message;
  if (isIosDevice()) {
    message = "Telepítés iPhone-ra:\n\n1. Nyisd meg ezt az oldalt Safariban.\n2. Nyomd meg a négyzetből felfelé mutató nyíl ikont.\n3. Válaszd a Hozzáadás a Főképernyőhöz lehetőséget.\n4. Nyomd meg a Hozzáadás gombot.";
  } else if (isAndroidDevice()) {
    message = "Nyomd meg a böngésző jobb felső menüjét (⋮), majd válaszd az Alkalmazás telepítése vagy a Hozzáadás a kezdőképernyőhöz lehetőséget.";
  } else {
    message = "A számítógépen kattints a címsor Telepítés ikonjára, vagy a böngésző menüjében válaszd az Alkalmazás telepítése lehetőséget.";
  }
  showInstallMessage("Munkalap telepítése", message);
});

$("#installButton").textContent = isMobileDevice() ? "Telepítés telefonra" : "Telepítés számítógépre";

$("#refreshButton").addEventListener("click", async () => {
  if (window.Billing && !window.Billing.canLeave()) return;
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
    if (formDirty || window.Billing?.hasUnsaved()) { updateReloadPending = true; return; }
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

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, {once:true});
else initialize();
