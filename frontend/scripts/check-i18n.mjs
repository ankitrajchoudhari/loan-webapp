// Lists translation keys used in the code that are missing from lib/messages.js (and unused ones).
// Dynamic keys like t(`m${n}`) are expanded from the patterns below. Run: npm run check:i18n
import fs from 'node:fs';
import path from 'node:path';
import { messages } from '../lib/messages.js';

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(f.name)) files.push(p);
  }
};
['app', 'components', 'lib'].forEach(walk);

const used = new Set();
const dynamic = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*`([^`]+)`/g)) dynamic.add(m[1].replace(/\$\{[^}]+\}/g, '*'));
  for (const m of src.matchAll(/\['(nav|label|history|dash)\.[a-zA-Z.]+'/g)) used.add(m[0].slice(2, -1));
}
const keys = Object.keys(messages);
const missing = [...used].filter((k) => !(k in messages));
const dynMissing = [...dynamic].filter((p) => !keys.some((k) => new RegExp(`^${p.replace(/[.]/g, '\.').replace(/\*/g, '[^.]+')}$`).test(k)));
let bad = 0;
for (const [k, v] of Object.entries(messages)) if (!Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]) { console.log('incomplete:', k); bad++; }
if (missing.length) console.log('MISSING keys:\n  ' + missing.sort().join('\n  '));
if (dynMissing.length) console.log('Dynamic patterns with no keys:\n  ' + dynMissing.join('\n  '));
console.log(`${used.size} static keys used, ${dynamic.size} dynamic patterns, ${keys.length} defined`);
process.exit(missing.length || dynMissing.length || bad ? 1 : 0);
