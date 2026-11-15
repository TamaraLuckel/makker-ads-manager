// Neemt de keuzes uit de huisstijl-kiezer over.
// Gebruik: node scripts/huisstijl.mjs ~/Downloads/huisstijl.json
// Schrijft merk/huisstijl.json, zet het logo als bestand in merk/ en werkt de kiezer bij.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schrijfVoorKiezer } from './_kiezer.mjs';

const bron = process.argv[2] && path.resolve(process.argv[2]);
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
if (!bron || !fs.existsSync(bron)) { console.error('Geef het bestand uit de kiezer op: node scripts/huisstijl.mjs ~/Downloads/huisstijl.json'); process.exit(1); }
const h = JSON.parse(fs.readFileSync(bron, 'utf8'));
const hex = /^#[0-9a-f]{6}$/i;
for (const [k, v] of Object.entries(h.kleuren || {})) if (!hex.test(v)) { console.error(`Kleur ${k} is geen #rrggbb: ${v}`); process.exit(1); }
for (const soort of ['logo', 'logoApp']) {
  const d = h[soort + 'Data'];
  if (!d) continue;
  const m = /^data:image\/(png|svg\+xml|jpeg);base64,(.+)$/.exec(d);
  if (!m) { console.error(`${soort} is geen png, svg of jpg.`); process.exit(1); }
  const ext = m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : 'png';
  const pad = `merk/${soort === 'logo' ? 'logo' : 'logo-app'}.${ext}`;
  fs.writeFileSync(pad, Buffer.from(m[2], 'base64'));
  if (soort === 'logo') h.logo = { ...(h.logo || {}), pad }; else h.logo = { ...(h.logo || {}), app: pad };
  delete h[soort + 'Data'];
}
fs.writeFileSync('merk/huisstijl.json', JSON.stringify(h, null, 2) + '\n');
schrijfVoorKiezer();
console.log(`Huisstijl van "${h.naam}" staat in merk/huisstijl.json.${h.logo && h.logo.pad ? ` Logo: ${h.logo.pad}.` : ' Geen logo.'}`);
