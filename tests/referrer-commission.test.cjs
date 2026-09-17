const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'billing-settlements.js'), 'utf8');
assert.ok(source.includes('})();'), 'A jutalékszámítás forrása megtalálható');
const instrumented = source.replace('})();', 'globalThis.__referrerTest = { anniversary, commissionBase };})();');
const context = {
  BillingMath: require('../billing-math.js'),
  startOfOfficeWeek: value => value,
  document: { getElementById: () => ({ addEventListener() {} }) },
  window: { addEventListener() {} }
};
vm.runInNewContext(instrumented, context);
const { anniversary, commissionBase } = context.__referrerTest;
const item = (date, value) => ({ sourceDate: date, quantity: '1', unitPrice: String(value), divisor: 1 });
const settlement = {
  period_end: '2027-09-18',
  discount_type: 'percent',
  discount_value: 10,
  items: [item('2026-09-17', 100000), item('2027-09-16', 20000), item('2027-09-17', 30000)]
};
const referrer = { startsOn: '2026-09-17', percentage: 5 };

assert.equal(anniversary(referrer.startsOn), '2027-09-17');
assert.equal(commissionBase(settlement, referrer), 108000);
assert.equal(commissionBase(settlement, referrer) * referrer.percentage / 100, 5400);
assert.equal(commissionBase(settlement, { ...referrer, endsOn: '2026-09-18' }), 90000);
assert.equal(commissionBase(settlement, { ...referrer, startsOn: '2028-01-01' }), 0);
console.log('PASS: ajánlói időablak, lezárás és ügyfélkedvezmény utáni jutalékalap.');
