const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'billing-settlements.js'), 'utf8');
const instrumented = source.replace('})();', 'globalThis.__test = { setDraft: value => { draft = value; }, getDraft: () => draft, setWorksheets: value => { worksheets = value; }, setPrices: value => { prices = value; }, refreshChangedWorksheets, renderReferrers, worksheetReferrerEntries };})();');
const elements = new Map();
const context = {
  BillingMath: require('../billing-math.js'),
  startOfOfficeWeek: value => value,
  document: { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { dataset: {}, addEventListener() {}, innerHTML: '', hidden: false });
    return elements.get(id);
  } },
  window: { addEventListener() {} },
  worksheets: [],
  customerDirectory: [],
  escapeHTML: value => String(value),
  customerNameKey: value => String(value).trim().toLowerCase(),
  formatHungarianDate: value => value
};
vm.runInNewContext(instrumented, context);
const { setDraft, getDraft, setWorksheets, setPrices, refreshChangedWorksheets, renderReferrers, worksheetReferrerEntries } = context.__test;
const box = elements.get('budgetReferrers');
const customerId = 'customer-1';
const worksheet = { id: 'worksheet-1', customerId, customer: 'Teszt', date: '2026-09-17', updatedAt: '2026-09-17T16:00:00Z', data: { referrerNames: 'Teszt, Teszt 2' } };

context.customerDirectory.push({ id: customerId, fullName: 'Teszt', referrers: [] });
assert.deepEqual(Array.from(worksheetReferrerEntries(worksheet), item => [item.name, item.referrer?.percentage ?? 0]), [['Teszt', 0], ['Teszt 2', 0]]);
setDraft({ customer_id: customerId, customer_name: 'Teszt', worksheet_ids: [worksheet.id], source_snapshots: [{ worksheetId: worksheet.id, worksheetUpdatedAt: worksheet.updatedAt, data: worksheet.data }], period_start: worksheet.date, period_end: worksheet.date, items: [] });
renderReferrers();
assert.equal(box.hidden, false);
assert.equal(box.open, false);
assert.match(box.innerHTML, /<summary>Ajánló személyek – csak belső használatra<\/summary>/);
assert.match(box.innerHTML, /value="Teszt 2"/);
assert.equal((box.innerHTML.match(/data-referrer-percent/g) || []).length, 2);
assert.match(box.innerHTML, /form="budgetReferrerFields"/);
assert.match(box.innerHTML, /value="0"/);
box.open = true;
renderReferrers();
assert.equal(box.open, true);

context.customerDirectory[0].referrers = [{ id: 'referrer-1', fullName: 'Javított név', percentage: 0, startsOn: worksheet.date, updatedAt: '2026-09-18T08:00:00Z', active: true, payouts: [] }];
assert.deepEqual(Array.from(worksheetReferrerEntries(worksheet), item => [item.name, item.referrer?.percentage]), [['Javított név', 0]]);
renderReferrers();
assert.match(box.innerHTML, /value="Javított név"/);
assert.doesNotMatch(box.innerHTML, /value="Teszt 2"/);
assert.match(box.innerHTML, /0% · nincs jutalék/);
setDraft({ customer_id: customerId, customer_name: 'Teszt', worksheet_ids: ['worksheet-2'], source_snapshots: [{ worksheetId: 'worksheet-2', worksheetUpdatedAt: worksheet.updatedAt, data: worksheet.data }], period_start: worksheet.date, period_end: worksheet.date, items: [] });
renderReferrers();
assert.equal(box.open, false);

const changedWorksheet = { ...worksheet, updatedAt: worksheet.updatedAt, data: { team_1_size: '2', team_1_arrival: '08:00', team_1_departure: '10:00' } };
setWorksheets([changedWorksheet]);
setPrices([{ code: 'labor', label: 'Munkadíj', unit_price: 12000, confirmed: true }]);
setDraft({ customer_id: customerId, customer_name: 'Teszt', worksheet_ids: [worksheet.id], source_snapshots: [{ worksheetId: worksheet.id, worksheetUpdatedAt: worksheet.updatedAt, customer: worksheet.customer, date: worksheet.date, data: { team_1_size: '1', team_1_arrival: '08:00', team_1_departure: '09:00' } }], period_start: worksheet.date, period_end: worksheet.date, status: 'ready', items: [{ label: 'Régi munkadíj', quantity: '60', unit: 'főperc', unitPrice: '12000', divisor: 60, reviewed: true }] });
assert.equal(refreshChangedWorksheets(), 1, 'A tartalmilag módosított munkalapot azonos időbélyegnél is frissíteni kell.');
assert.equal(getDraft().items[0].quantity, '240');
assert.equal(getDraft().status, 'draft');
console.log('PASS: ajánlók külön szerkesztése, 0% és ügyfélnyilvántartásból frissülő név.');
