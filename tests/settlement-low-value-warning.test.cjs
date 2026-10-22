const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'billing-settlements.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'app-shell.css'), 'utf8');
const printSection = source.slice(source.indexOf('function documentHtml'), source.indexOf('async function refreshBeforeExport'));
const emailSection = source.slice(source.indexOf('async function emailDraft'), source.indexOf("el('budgetPrint')"));

assert.match(source, /class="budget-low-value-warning"/);
assert.match(source, /Ár vagy tétel ellenőrizendő/);
assert.match(source, /hasLegacyUnpricedCustomItem/);
assert.match(css, /\.budget-sheet-choice \.budget-low-value-warning\{[^}]*color:#c40000;[^}]*font:900/);
assert.doesNotMatch(printSection, /budget-low-value-warning/);
assert.doesNotMatch(emailSection, /budget-low-value-warning/);

console.log('PASS: az 1000 Ft alatti vagy ár nélküli Egyéb tétel piros irodai jelzést kap, exportjelzés nélkül.');
