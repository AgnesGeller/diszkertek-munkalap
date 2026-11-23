const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(__dirname, '..', 'munkalap-data.js'), 'utf8');

assert.match(source, /function hasManagerAuthority\(\) \{[\s\S]*?session\?\.role === "manager" \|\| Boolean\(session\?\.delegatedBy\)/);
assert.match(source, /\$\{\(office \|\| hasManagerAuthority\(\)\) && !item\.pending \?/);
assert.match(source, /async function deleteWorksheet\(id, button\) \{\s*if \(!hasManagerAuthority\(\)\) return;/);
assert.match(dataSource, /client\.rpc\("delete_worksheet_as_manager"/);

console.log('PASS: Ági és Tamás névváltás után is törölhet munkalapot, a szerveroldali irodai ellenőrzés megtartásával.');
