const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'munkalap-data.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app-shell.css'), 'utf8');

assert.match(app, /DESCRIPTION_HISTORY_KEY = "diszkertek-munkalap-description-history-v1"/);
assert.match(app, /localStorage\.setItem\(descriptionHistoryStorageKey\(userId\)/);
assert.match(app, /initialized: true/);
assert.match(app, /descriptionHistoryLoaded \? descriptionHistory : recent/);
assert.match(app, /data-description-delete/);
assert.match(app, /writeStoredDescriptionHistory\(session\.userId, descriptionHistory\)/);
assert.doesNotMatch(app, /MunkalapDB\.(rememberDescription|deleteDescriptionSuggestion)/);
assert.doesNotMatch(data, /description_history|remember_description/);
assert.match(html, /Ezen a készüléken a munkalap törlése után is megmarad/);
assert.match(css, /\.description-suggestions>div\{[^}]*max-height:min\(380px,50vh\)[^}]*overflow-y:auto/);

console.log('PASS: a feladatleírások helyben, felhasználónként megmaradnak és törölhetők.');
