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
assert.match(source, /formElement\.submit\(\)/);
assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?frame\.remove\(\);[\s\S]*?60000\)/);
assert.doesNotMatch(source, /await fetch\(EMAIL_ENDPOINT/);
assert.match(source, /item\.emailRetryStopped = true/);
assert.match(source, /!item\.emailRetryStopped && !fallbackDecisionPending/);
assert.match(source, /Az e-mailt az alkalmazás nem küldi el újra automatikusan/);
assert.match(source, /confirmQueuedEmailButton/);
assert.doesNotMatch(source, /Az e-mail beérkezését az iroda ellenőrzi\. Ne küldd el újra a munkalapot/);
assert.match(source, /if \(!officeDevice\) \{[\s\S]*?resetForm\(\);[\s\S]*?showSuccessDialog\(\);[\s\S]*?syncQueue\(\);/);
assert.match(source, /confirmEmailButton\.hidden = !emailCheck/);
assert.match(source, /A kézi újraküldést rögzítettük\. A figyelmeztetés megmarad/);
assert.match(source, /Az automatikus FormSubmit-küldés nem sikerült/);
const submitStart = source.indexOf('form.addEventListener("submit", async event => {');
const submitEnd = source.indexOf('fallbackEmailButton.addEventListener', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, 'A munkalap beküldési folyamata hiányzik.');
const submitHandler = source.slice(submitStart, submitEnd);
assert.doesNotMatch(submitHandler, /Promise\.allSettled/);
assert.doesNotMatch(submitHandler, /await withTimeout\([\s\S]*?MunkalapDB/);
assert.match(submitHandler, /addQueueItem\(queued\);[\s\S]*?resetForm\(\);[\s\S]*?showSuccessDialog\(\);[\s\S]*?syncQueue\(\);/);
assert.match(source, /if \(\(!item\.record\.customerId \|\| !item\.record\.locationId\)[\s\S]*?MunkalapDB\.registerCustomerSuggestion/);
console.log('PASS: az azonnali FormSubmit-küldés, a háttérmentés és a kézi küldés figyelmeztetése rendben van.');
