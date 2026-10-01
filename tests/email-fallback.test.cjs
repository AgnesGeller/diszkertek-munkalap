const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const helperSource = source.match(/function clearEmailFallbackStatus\(record\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helperSource, 'Az e-mail-figyelmeztetés törlő segédfüggvénye hiányzik.');
const context = {};
vm.runInNewContext(`${helperSource}; globalThis.clearEmailFallbackStatus = clearEmailFallbackStatus;`, context);

const emailOnly = { data: { _officeStatus: 'email_fallback', description: 'Munka' } };
assert.equal(context.clearEmailFallbackStatus(emailOnly), true);
assert.equal(emailOnly.data._officeStatus, undefined);
assert.equal(emailOnly.data.description, 'Munka');

const combined = { data: { _officeStatus: 'database_delayed_email_fallback' } };
assert.equal(context.clearEmailFallbackStatus(combined), true);
assert.equal(combined.data._officeStatus, 'database_delayed');

const unrelated = { data: { _officeStatus: 'database_delayed' } };
assert.equal(context.clearEmailFallbackStatus(unrelated), false);
assert.equal(unrelated.data._officeStatus, 'database_delayed');

assert.match(source, /https:\/\/formsubmit\.co\/info@diszkertek\.hu/);
assert.match(source, /formElement\.method = "POST"/);
assert.match(source, /formElement\.target = frameName/);
assert.match(source, /_next: new URL\(`email-sent\.html\?token=/);
assert.match(source, /A FormSubmit nem igazolta vissza az e-mail elküldését/);
console.log('PASS: e-mail-figyelmeztetés rendezése és visszaigazolt FormSubmit-űrlapküldés.');
