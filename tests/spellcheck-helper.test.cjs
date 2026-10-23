const assert = require('node:assert/strict');
const spellcheck = require('../spellcheck-helper.js');

assert.equal(spellcheck.suggestions('funyiras')[0], 'fűnyírás');
assert.equal(spellcheck.suggestions('funyirast')[0], 'fűnyírást');
assert.equal(spellcheck.suggestions('sovenynyiras')[0], 'sövénynyírás');
assert.ok(spellcheck.suggestions('kertkarbatartas').includes('kertkarbantartás'));
assert.deepEqual(spellcheck.suggestions('fűnyírás'), []);
assert.deepEqual(spellcheck.suggestions('Kovács'), []);

const range = spellcheck.wordRange('Elvégeztük a funyirast. ', 24);
assert.deepEqual(range, { start: 13, end: 22, word: 'funyirast' });
assert.equal(spellcheck.replaceWord('Elvégeztük a funyirast.', range, 'fűnyírást'), 'Elvégeztük a fűnyírást.');

console.log('PASS: az ékezet nélküli és gyakran elírt munkaszavak azonnali javaslata működik.');
