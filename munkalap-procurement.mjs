const KM_RATE = 500;
const PURCHASE_BASE = 5000;
const LOADING_RATE = 20000;
const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const kg = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 3 });
const money = value => value == null ? "Kikeresendő" : currency.format(value);

export function parseProcurementNumber(value) {
  const clean = String(value ?? "").trim().replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
  if (!clean) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(clean) || Number(clean) > 100000000) return NaN;
  return Number(clean);
}

export function calculateProcurement(material, { quantity, purchaseKm, deliveryKm, manualLoading }) {
  const { unit_weight: unitWeight, pallet_quantity: palletQuantity, pallet_fee: palletFee } = material;
  const purchasePrice = material.purchase_price ?? (material.list_price != null && material.discount_pct != null
    ? Math.round(material.list_price * (100 - material.discount_pct)) / 100 : null);
  const palletWeight = material.is_palletized && unitWeight != null && palletQuantity > 0
    ? Math.round(unitWeight * palletQuantity * 1000) / 1000 : null;
  const pallets = !material.is_palletized ? 0 : quantity === 0 ? 0 : quantity != null && palletQuantity > 0
    ? Math.ceil(Math.round(quantity * 1000) / Math.round(palletQuantity * 1000)) : null;
  const palletCost = pallets === 0 ? 0 : pallets != null && palletFee != null ? Math.round(pallets * palletFee) : null;
  const purchaseKmFee = purchaseKm == null ? null : Math.round(purchaseKm * KM_RATE);
  const deliveryFee = deliveryKm == null ? null : Math.round(deliveryKm * KM_RATE);
  const purchaseTotal = purchaseKmFee == null ? null : PURCHASE_BASE + purchaseKmFee;
  const shippingProfit = purchaseTotal == null || deliveryFee == null ? null : deliveryFee - purchaseTotal;
  const loading = !manualLoading ? 0 : quantity != null && unitWeight != null
    ? Math.round(quantity * unitWeight * LOADING_RATE / 1000) : null;
  const profit = [material.sale_price, purchasePrice, material.accessory_price, quantity, palletCost].every(value => value != null)
    ? Math.round((material.sale_price - purchasePrice - material.accessory_price) * quantity - palletCost) : null;
  return { purchasePrice, palletWeight, pallets, palletCost, purchaseKmFee, deliveryFee, purchaseTotal, shippingProfit, loading, profit };
}

const groups = [
  ["Anyag adatai", [
    ["name", "Anyag megnevezése", 240], ["unit", "Mértékegység", 80],
    ["category", "Kategória", 100], ["unit_weight", "Egységenkénti anyagsúly (kg)", "positive"]
  ]],
  ["Raklap adatai", [
    ["is_palletized", "Raklapos anyag", "checkbox"],
    ["pallet_quantity", "Mennyiség egy raklapon", "positive"],
    ["pallet_tare", "Üres raklap súlya (kg)", "decimal"],
    ["pallet_fee", "Raklap egységára (Ft)", "money"]
  ]],
  ["Árak és beszerzés", [
    ["list_price", "Anyag listaára (Ft/egység)", "money"],
    ["discount_pct", "Kedvezmény (%)", "percent"],
    ["purchase_price", "Rögzített beszerzési ár (Ft/egység)", "money"],
    ["sale_price", "Eladási ár (Ft/egység)", "money"],
    ["accessory_price", "Kiegészítő anyag díja (Ft/egység)", "money"],
    ["accessory_name", "Kiegészítő anyag megnevezése", 240],
    ["supplier", "Beszerzési partner", 240],
    ["supplier_location", "Beszerzés helye", 500],
    ["notes", "Megjegyzés", 2000]
  ]]
];
const fields = groups.flatMap(([, entries]) => entries);
const palletFields = ["pallet_quantity", "pallet_tare", "pallet_fee"];
const labelFor = (name, label, type) => {
  if (type === "checkbox") return `<label class="procurement-check"><input name="${name}" type="checkbox"> ${label}</label>`;
  const attrs = typeof type === "number" ? `maxlength="${type}"` : 'inputmode="decimal" maxlength="20"';
  return `<label>${label}${name === "notes" ? '<textarea name="notes" maxlength="2000" rows="3"></textarea>'
    : `<input name="${name}" ${attrs} ${name === "name" ? "required" : ""}>`}</label>`;
};

export function mountProcurement(root, db) {
  const styleId = "procurementStyles";
  if (!document.getElementById(styleId)) {
    const stylesheet = document.createElement("link");
    stylesheet.id = styleId;
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("./munkalap-procurement.css?v=101", import.meta.url);
    document.head.append(stylesheet);
  }
  root.innerHTML = `
    <div class="procurement-toolbar">
      <label>Anyag keresése<input data-find type="search" placeholder="Anyagnév, beszerzési partner vagy hely"></label>
      <button data-add type="button" disabled>+ Új anyag</button>
      <button data-reload type="button">Újratöltés</button>
    </div>
    <p data-status class="office-status" role="status"></p>
    <ul data-results class="procurement-list"></ul>
    <dialog class="procurement-dialog" aria-labelledby="procurementHeading">
      <form data-material>
        <header><h2 id="procurementHeading">Anyag adatai</h2><button data-close type="button">Bezárás</button></header>
        ${groups.map(([title, entries]) => `<fieldset><legend>${title}</legend><div class="procurement-grid">${entries.map(field => labelFor(...field)).join("")}</div></fieldset>`).join("")}
        <p class="procurement-help">A rögzített beszerzési ár elsőbbséget élvez. Ha üres, a listaár és a kedvezmény alapján számolunk. Díjmentes tételnél írj 0-t.</p>
        <details class="procurement-calculator">
          <summary>Raklap és szállítás kalkulátor</summary>
          <p data-supplier-place></p>
          <div class="procurement-grid">
            ${labelFor("quote_quantity", "Anyagmennyiség", "decimal")}
            ${labelFor("purchase_km", "Beszerzési út Pomázról (elszámolandó km)", "decimal")}
            ${labelFor("delivery_address", "Kiszállítás pontos címe", 500)}
            ${labelFor("delivery_km", "Kiszállítási út (elszámolandó km)", "decimal")}
            ${labelFor("manual_loading", "Kézi rakodás · 20 000 Ft/tonna", "checkbox")}
          </div>
          <p class="procurement-help">A kilométert az útvonal alapján add meg. Ha az oda-vissza utat számoljátok el, a két irány távolságát add össze.</p>
          <dl data-totals class="procurement-totals"></dl>
        </details>
        <p data-save-status class="office-status" role="status"></p>
        <div class="dialog-actions"><button data-save type="submit">Mentés</button></div>
      </form>
    </dialog>`;
  const $ = selector => root.querySelector(selector);
  const dialog = $("dialog");
  const form = $("[data-material]");
  const status = $("[data-status]");
  const add = $("[data-add]");
  const control = name => form.elements.namedItem(name);
  let records = [];
  let editing = null;
  let active = true;
  let busy = false;
  let changed = false;

  function formValues(strict) {
    const material = {};
    for (const [name, label, type] of fields) {
      const input = control(name);
      if (type === "checkbox") material[name] = input.checked;
      else if (palletFields.includes(name) && !control("is_palletized").checked) material[name] = null;
      else if (typeof type === "number") material[name] = input.value.trim();
      else {
        const value = parseProcurementNumber(input.value);
        const invalid = Number.isNaN(value) || (type === "positive" && value === 0)
          || (type === "percent" && value > 100)
          || ((type === "money" || type === "percent") && value != null && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6);
        if (strict && invalid) throw new Error(`${label}: adj meg érvényes számot.`);
        material[name] = invalid ? null : value;
      }
    }
    if (strict && !material.name) throw new Error("Add meg az anyag nevét.");
    return material;
  }

  function updateTotals() {
    const material = formValues(false);
    for (const name of palletFields) control(name).disabled = !material.is_palletized;
    const readNumber = name => {
      const value = parseProcurementNumber(control(name).value);
      return Number.isNaN(value) ? null : value;
    };
    const totals = calculateProcurement(material, {
      quantity: readNumber("quote_quantity"), purchaseKm: readNumber("purchase_km"),
      deliveryKm: readNumber("delivery_km"), manualLoading: control("manual_loading").checked
    });
    $("[data-supplier-place]").textContent = material.supplier_location
      ? `Beszerzési út: pomázi telephely → ${material.supplier_location}` : "A beszerzési hely még nincs megadva.";
    const weight = value => value == null ? "—" : `${kg.format(value)} kg`;
    const result = [
      ["Raklapos súly (anyag)", weight(totals.palletWeight)],
      ["Teljes raklapsúly", weight(totals.palletWeight == null || material.pallet_tare == null ? null : totals.palletWeight + material.pallet_tare)],
      ["Szükséges raklap", totals.pallets == null ? "—" : `${totals.pallets} db`],
      ["Raklap díja összesen", money(totals.palletCost)],
      ["Beszerzési ár egységenként", money(totals.purchasePrice)],
      ["Beszerzési alapdíj", money(PURCHASE_BASE)],
      ["Beszerzési km-díj", money(totals.purchaseKmFee)],
      ["Beszerzési fuvar összesen", money(totals.purchaseTotal)],
      ["Kiszállítási alapdíj", money(0)],
      ["Kiszállítási km-díj", money(totals.deliveryFee)],
      ["Szállítási díj összesen (ügyfél)", money(totals.deliveryFee)],
      ["Szállítási profit összesen", money(totals.shippingProfit)],
      ["Kézi rakodás díja", money(totals.loading)],
      ["Anyagprofit (tétel összesen)", money(totals.profit)]
    ];
    $("[data-totals]").replaceChildren(...result.map(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      return row;
    }));
  }

  const fold = value => String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  function render() {
    const query = fold($("[data-find]").value).trim();
    const results = records.filter(item => fold([item.name, item.category, item.supplier, item.supplier_location].join(" ")).includes(query));
    $("[data-results]").replaceChildren(...results.map(item => {
      const row = document.createElement("li");
      const description = document.createElement("div");
      const title = document.createElement("strong");
      const supplier = document.createElement("small");
      const location = document.createElement("small");
      const meta = document.createElement("small");
      const button = document.createElement("button");
      title.textContent = item.name;
      supplier.className = "procurement-source";
      supplier.textContent = "Beszerzési partner: " + (item.supplier?.trim() || "Kikeresendő");
      location.textContent = "Beszerzés helye: " + (item.supplier_location?.trim() || "Kikeresendő");
      meta.textContent = [item.unit, item.category, item.is_palletized ? "Raklapos" : "", item.unit_weight == null ? "Súly kikeresendő" : ""].filter(Boolean).join(" · ");
      button.type = "button";
      button.textContent = "Részletek";
      button.setAttribute("aria-label", `Részletek: ${item.name}`);
      button.addEventListener("click", () => open(item));
      description.append(title, supplier, location, meta);
      row.append(description, button);
      return row;
    }));
    status.textContent = results.length ? `${results.length} anyag` : "Nincs találat.";
  }

  async function load() {
    add.disabled = true;
    $("[data-reload]").disabled = true;
    status.textContent = "Anyagok betöltése…";
    try {
      const items = await db.procurementMaterials();
      if (!active) return;
      records = items;
      render();
      add.disabled = false;
    } catch (_) {
      if (active) status.textContent = "Az anyaglista nem tölthető be. Próbáld újra.";
    } finally {
      if (active) $("[data-reload]").disabled = false;
    }
  }

  function open(item) {
    editing = item;
    changed = false;
    form.reset();
    for (const [name, , type] of fields) {
      if (type === "checkbox") control(name).checked = Boolean(item?.[name]);
      else control(name).value = item?.[name] ?? "";
    }
    $("#procurementHeading").textContent = item?.name || "Új anyag";
    $("[data-save-status]").textContent = "";
    $(".procurement-calculator").open = false;
    updateTotals();
    dialog.showModal();
  }

  function canClose() {
    return !busy && (!changed || confirm("Elveted az anyag adatainak módosításait?"));
  }
  $("[data-close]").addEventListener("click", () => { if (canClose()) dialog.close(); });
  dialog.addEventListener("cancel", event => { if (!canClose()) event.preventDefault(); });
  $("[data-find]").addEventListener("input", () => { if (!add.disabled) render(); });
  add.addEventListener("click", () => open(null));
  $("[data-reload]").addEventListener("click", load);
  form.addEventListener("input", event => {
    if (fields.some(([name]) => name === event.target.name)) changed = true;
    updateTotals();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const feedback = $("[data-save-status]");
    let material;
    try { material = formValues(true); }
    catch (error) { feedback.textContent = error.message; return; }
    busy = true;
    $("[data-save]").disabled = true;
    feedback.textContent = "Mentés…";
    try {
      const saved = await db.saveProcurementMaterial(material, editing);
      if (!active) return;
      records = [...records.filter(item => item.id !== saved.id), saved]
        .sort((a, b) => b.usage_count - a.usage_count || a.name.localeCompare(b.name, "hu"));
      changed = false;
      dialog.close();
      render();
      status.textContent += " · Anyag mentve.";
    } catch (_) {
      if (active) feedback.textContent = "Az anyag mentése nem sikerült. Ellenőrizd a kapcsolatot. Ha közben más is szerkesztette, töltsd újra a listát.";
    } finally {
      busy = false;
      if (active) $("[data-save]").disabled = false;
    }
  });
  load();
  return {
    canLeave() {
      if (!dialog.open) return true;
      if (!canClose()) return false;
      dialog.close();
      return true;
    },
    destroy() { active = false; if (dialog.open) dialog.close(); root.replaceChildren(); }
  };
}
