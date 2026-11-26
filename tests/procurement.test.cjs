const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("az anyagbeszerzés helyes raklap-, fuvar- és rakodási díjat számol", async () => {
  const { calculateProcurement, parseProcurementNumber, supplierPhoneLink } = await import("../munkalap-procurement.mjs");
  assert.equal(parseProcurementNumber("20 000"), 20000);
  assert.equal(parseProcurementNumber("0,2"), 0.2);
  assert.equal(parseProcurementNumber(""), null);
  assert.ok(Number.isNaN(parseProcurementNumber("-5")));
  assert.equal(supplierPhoneLink("+36 (26) 326-023"), "tel:+3626326023");
  assert.equal(supplierPhoneLink("0036 26 326 023"), "tel:+3626326023");
  assert.equal(supplierPhoneLink("12"), null);
  assert.equal(supplierPhoneLink("javascript:alert(1)"), null);

  const material = {
    is_palletized: true, unit_weight: 25, pallet_quantity: 48, pallet_fee: 1500,
    list_price: 2400, discount_pct: 10, sale_price: 3120, accessory_price: 0
  };
  const totals = calculateProcurement(material, { quantity: 50, purchaseKm: 12.5, deliveryKm: 30, manualLoading: true });
  assert.deepEqual(totals, {
    purchasePrice: 2160, palletWeight: 1200, pallets: 2, palletCost: 3000,
    purchaseKmFee: 6250, purchaseTotal: 11250, deliveryFee: 15000,
    shippingProfit: 3750, loading: 25000, profit: 45000
  });
  const unknown = calculateProcurement({ is_palletized: true }, { quantity: 1, purchaseKm: null, deliveryKm: null, manualLoading: true });
  for (const key of ["pallets", "palletCost", "purchaseTotal", "deliveryFee", "loading", "profit"]) assert.equal(unknown[key], null);
  const zero = calculateProcurement({ is_palletized: false }, { quantity: 0, purchaseKm: 0, deliveryKm: 0, manualLoading: false });
  assert.equal(zero.palletCost, 0);
  assert.equal(zero.purchaseTotal, 5000);
  assert.equal(zero.deliveryFee, 0);
});

test("az anyagbeszerzés külön irodai panel, az adatokra irodai RLS vonatkozik", () => {
  const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert.match(read("index.html"), /id="statisticsTab"[^\n]*\n[^\n]*id="worksheetTab"[^\n]*\n[^\n]*id="procurementTab"/);
  assert.match(read("index.html"), /<section id="procurementView"[^>]*hidden>/);
  assert.match(read("app.js"), /if \(session\?\.role !== "manager" \|\| procurementScreen\) return;/);
  const sql = read("supabase/munkalap-procurement.sql");
  assert.match(sql, /alter table munkalap\.procurement_materials enable row level security/);
  assert.match(sql, /using \(\(select munkalap_private\.is_manager\(\)\)\)/);
  assert.match(sql, /with check \(\(select munkalap_private\.is_manager\(\)\)\)/);
  assert.doesNotMatch(read("service-worker.js"), /munkalap-procurement\.(mjs|css)/);
});
