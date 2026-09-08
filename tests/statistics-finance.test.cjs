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

assert.equal(expectedRevenue({
  ...base,
  worksheets: [{ id: 'w1', date: '2026-09-02', customer: 'Alma', value: 120000 }], customers: [],
  settlements: [{ settlement_kind: 'flat_monthly', customer_name: 'Régi átalány', period_start: '2026-09-01', period_end: '2026-09-30', total: 95000 }]
}), 120000, 'Legacy flat settlements are ignored and worksheets remain the revenue source');

console.log('PASS: expected revenue includes drafts and unbilled work, counts grouped settlements once, and ignores legacy flat-fee rows.');
