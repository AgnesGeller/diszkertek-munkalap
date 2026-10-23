const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'munkalap-data.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app-shell.css'), 'utf8');
const printCss = css.slice(css.indexOf('@media print'));

assert.match(data, /async listDescriptionHistory\(userId\)[\s\S]*?\.limit\(100\)/);
assert.match(app, /descriptionHistoryLoaded \? descriptionHistory : recent/);
assert.match(app, /Promise\.all\(\[\s*loadWorkerCatalog\(false\),\s*loadWorksheets\(\),\s*loadCustomers/);
assert.match(html, /<details class="history-section">[\s\S]*?<span>Munkalapjaim<\/span>/);
assert.match(css, /\.recent-worksheets\{[^}]*max-height:[^}]*overflow-y:auto/);

assert.doesNotMatch(printCss, /\.print-settlement section[^}]*break-inside:avoid/);
assert.match(printCss, /\.print-settlement tr\{break-inside:avoid\}/);
assert.match(printCss, /\.print-settlement thead\{display:table-header-group\}/);

console.log('PASS: a feladatleírás-előzmények, a párhuzamos nyitás, a lenyíló lista és a többoldalas PDF szabályai rendben vannak.');
