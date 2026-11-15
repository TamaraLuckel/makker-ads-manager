// Zet je foto's in de beeldbank.
// Gebruik: node scripts/beeldbank.mjs "/pad/naar/je/fotomap"
// Kopieert jpg/png/heic (max 40) naar beeldbank/, verkleind tot 2500 px (op een Mac met sips), en zet ze in
// merk/beeldbank.json. Daarna kijkt Claude Code elke foto na en vult beschrijving, wie, past en uitsnede in.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { schrijfVoorKiezer } from './_kiezer.mjs';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const bron = process.argv[2];
if (!bron || !fs.existsSync(bron) || !fs.statSync(bron).isDirectory()) { console.error('Geef de map met foto\'s op: node scripts/beeldbank.mjs "/pad/naar/map"'); process.exit(1); }
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
const mac = process.platform === 'darwin';
const lijst = JSON.parse(fs.readFileSync('merk/beeldbank.json', 'utf8'));
const bekend = new Set(lijst.fotos.map((f) => f.bron));
const bestanden = fs.readdirSync(bron).filter((n) => /\.(jpe?g|png|heic)$/i.test(n) && !n.startsWith('.')).sort();
fs.mkdirSync('beeldbank', { recursive: true });
let nieuw = 0, overgeslagen = 0;
for (const naam of bestanden) {
  if (lijst.fotos.length >= 40) { console.log('Maximum van 40 foto\'s bereikt; de rest is overgeslagen.'); break; }
  if (bekend.has(naam)) { overgeslagen++; continue; }
  const doel = `beeldbank/${slug(naam.replace(/\.[^.]+$/, ''))}.jpg`;
  const van = path.join(bron, naam);
  if (mac) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', '2500', van, '--out', doel], { stdio: 'ignore' });
  else if (/\.jpe?g$/i.test(naam)) fs.copyFileSync(van, doel);
  else { console.log(`Overgeslagen (alleen jpg zonder Mac): ${naam}`); continue; }
  let staand = false;
  if (mac) { const uit = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', doel]).toString(); const w = +/pixelWidth: (\d+)/.exec(uit)[1], h = +/pixelHeight: (\d+)/.exec(uit)[1]; staand = h > w; }
  lijst.fotos.push({ pad: doel, bron: naam, beschrijving: '', wie: '', past: '', staand, pos: { '4x5': '50% 40%', '9x16': '50% 40%' } });
  nieuw++;
}
fs.writeFileSync('merk/beeldbank.json', JSON.stringify(lijst, null, 2) + '\n');
schrijfVoorKiezer();
const mb = lijst.fotos.reduce((s, f) => s + (fs.existsSync(f.pad) ? fs.statSync(f.pad).size : 0), 0) / 1048576;
console.log(`${nieuw} nieuwe foto's in de beeldbank (${overgeslagen} stonden er al). Totaal ${lijst.fotos.length}, ${mb.toFixed(1)} MB.`);
console.log('Volgende stap: elke foto bekijken en beschrijving, wie, past en pos invullen in merk/beeldbank.json.');
