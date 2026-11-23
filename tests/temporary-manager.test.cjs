const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "munkalap-data.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "munkalap-temporary-manager.sql"), "utf8");

assert.match(dataSource, /"Ferenc":\s*"ferenc@gmail\.com"/);
assert.match(dataSource, /MANAGER_NAMES\s*=\s*\[[^\]]*"Ferenc"/);
assert.match(dataSource, /select\("id,display_name,role,access_expires_at"\)/);
assert.match(dataSource, /accessExpiresAt[\s\S]*?getTime\(\)\s*<=\s*Date\.now\(\)/);
assert.match(migration, /created_at\s*\+\s*interval\s*'1 month'/i);
assert.match(migration, /access_expires_at\s+is\s+null\s+or\s+access_expires_at\s*>\s*now\(\)/i);
assert.doesNotMatch(dataSource, /579725/);
assert.doesNotMatch(migration, /579725/);

console.log("PASS: Ferenc manager-hozzáférése lejárathoz kötött, a PIN nincs a forráskódban.");
