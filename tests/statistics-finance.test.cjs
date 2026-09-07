const assert = require('node:assert/strict');
const { expectedRevenue } = require('../statistics-finance.js');

const key = value => String(value || '').toLocaleLowerCase('hu-HU');
const base = {
  prices: [],
  from: '2026-09-01',
  to: '2026-09-30',
  today: '2026-09-07',
  customerKey: key,
  worksheetValue: sheet => sheet.value
};

assert.equal(expectedRevenue({
  ...base,
  worksheets: [{ id: 'w1', date: '2026-09-02', customer: 'Alma', value: 100 }],
  settlements: [], customers: []
}), 100, 'An unbilled completed worksheet is expected revenue');

assert.equal(expectedRevenue({
  ...base,
  worksheets: [{ id: 'w1', date: '2026-09-02', customer: 'Alma', value: 100 }, { id: 'w2', date: '2026-09-03', customer: 'Alma', value: 200 }],
  settlements: [{ settlement_kind: 'worksheets', worksheet_ids: ['w1', 'w2'], period_start: '2026-09-02', period_end: '2026-09-03', status: 'draft', total: 250 }], customers: []
}), 250, 'A draft grouped settlement is counted once');

const flatCustomer = { id: 'c1', fullName: 'Átalányos', active: true, billingMode: 'flat_monthly', monthlyFlatFee: 90000, flatFeeStartMonth: '2026-08-01' };
assert.equal(expectedRevenue({
  ...base,
  worksheets: [{ id: 'w1', date: '2026-09-02', customerId: 'c1', customer: 'Átalányos', value: 120000 }],
  settlements: [], customers: [flatCustomer]
}), 90000, 'Current monthly flat fee replaces unbilled worksheet value');

assert.equal(expectedRevenue({
  ...base,
  worksheets: [], customers: [flatCustomer],
  settlements: [{ settlement_kind: 'flat_monthly', customer_id: 'c1', customer_name: 'Átalányos', billing_month: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30', status: 'draft', total: 95000 }]
}), 95000, 'A saved monthly flat settlement replaces the generated estimate');

assert.equal(expectedRevenue({
  ...base,
  worksheets: [{ id: 'w1', date: '2026-09-02', customerId: 'c1', customer: 'Átalányos', value: 120000 }], customers: [flatCustomer],
  settlements: [{ settlement_kind: 'worksheets', worksheet_ids: ['w1'], period_start: '2026-09-02', period_end: '2026-09-02', status: 'ready', total: 15000 }]
}), 105000, 'An explicit extra settlement can be added to a monthly flat fee');

assert.equal(expectedRevenue({
  ...base,
  from: '2026-08-01', to: '2026-09-30', worksheets: [], settlements: [], customers: [{ ...flatCustomer, flatFeeStartMonth: '2026-09-01' }]
}), 90000, 'Flat fee is not counted before its start month');

assert.equal(expectedRevenue({
  ...base,
  from: '2026-09-04', to: '2026-09-10', worksheets: [], settlements: [], customers: [flatCustomer]
}), 0, 'A monthly flat fee is counted on the first day only, not repeated in every weekly view');

console.log('PASS: expected revenue includes drafts and unbilled work, counts grouped settlements once, and handles monthly flat fees without duplication.');
