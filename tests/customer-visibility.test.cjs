const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.match(html, /name="hiddenCustomer" type="checkbox"> Rejtett ügyfél/);
assert.match(html, /name="active" type="checkbox" checked> Aktív ügyfél/);
assert.match(source, /hiddenCustomer\.checked = customer \? customer\.reviewStatus !== "approved" : false/);
assert.match(source, /reviewStatus: customerForm\.elements\.hiddenCustomer\.checked \? "pending" : "approved"/);
assert.match(source, /customer-badge hidden-customer">Rejtett/);

console.log('PASS: az új ügyfél alapból látható és aktív, a rejtett állapot külön jelölhető.');
