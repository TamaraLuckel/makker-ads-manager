// Controle vóór het live zetten: npm run check
// Kijkt of huisstijl, beeldbank en producten compleet zijn. Wijzigt niets.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const fouten = [], let_ = [];
const lees = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fouten.push(`${f} is geen geldige JSON (${e.message}).`); return {}; } };
const h = lees('merk/huisstijl.json'), b = lees('merk/beeldbank.json'), p = lees('merk/producten.json');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync('app/sjablonen.js', 'utf8'), ctx);
const SJ = ctx.window.SJABLONEN.SJ;

if (!h.naam || h.naam === 'Mijn bedrijf') let_.push('Huisstijl: de bedrijfsnaam staat nog op de standaard.');
for (const [k, v] of Object.entries(h.kleuren || {})) if (!/^#[0-9a-f]{6}$/i.test(v)) fouten.push(`Huisstijl: kleur ${k} is geen #rrggbb.`);
for (const s of h.sjablonen || []) if (!SJ[s]) fouten.push(`Huisstijl: onbekend sjabloon "${s}" (kies uit ${Object.keys(SJ).join(', ')}).`);
for (const soort of ['kop', 'tekst']) {
  const f = (h.fonts || {})[soort];
  if (!f || (!f.google && !f.bestanden)) fouten.push(`Huisstijl: lettertype ${soort} ontbreekt.`);
  if (f && f.bestanden) for (const pad of Object.values(f.bestanden)) if (!fs.existsSync(pad)) fouten.push(`Huisstijl: lettertypebestand ${pad} bestaat niet.`);
}
if (h.logo && h.logo.pad && !fs.existsSync(h.logo.pad)) fouten.push(`Huisstijl: logo ${h.logo.pad} bestaat niet.`);
if (!h.logo) let_.push('Huisstijl: geen logo (mag, de ads hebben dan geen logo).');
if (!h.toon || !h.toon.klinkt) let_.push('Huisstijl: nog niet beschreven hoe je klinkt (toon.klinkt). Claude schrijft dan algemener.');

const fotos = b.fotos || [];
if (!fotos.length) fouten.push('Beeldbank: nog geen foto\'s. Draai node scripts/beeldbank.mjs "<map>".');
for (const f of fotos) {
  if (!fs.existsSync(f.pad)) fouten.push(`Beeldbank: ${f.pad} bestaat niet.`);
  if (!f.beschrijving) let_.push(`Beeldbank: ${f.pad} heeft nog geen beschrijving (Claude kiest dan blind).`);
  for (const fmt of ['4x5', '9x16']) if (!/^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test((f.pos || {})[fmt] || '')) fouten.push(`Beeldbank: ${f.pad} heeft geen geldige uitsnede voor ${fmt} ("50% 40%").`);
}
const mb = fotos.reduce((s, f) => s + (fs.existsSync(f.pad) ? fs.statSync(f.pad).size : 0), 0) / 1048576;
if (mb > 80) let_.push(`Beeldbank: ${mb.toFixed(0)} MB aan foto's. Dat mag, maar het uploaden duurt dan even.`);

const prods = p.producten || [];
if (!prods.length) let_.push('Producten: geen producten. Ads worden dan "losse ads" zonder prijzen of data.');
for (const x of prods) {
  if (x.id === 'voorbeeld') let_.push('Producten: het voorbeeldproduct staat er nog.');
  if (!/^[a-z0-9-]+$/.test(x.id || '')) fouten.push(`Producten: id "${x.id}" mag alleen kleine letters, cijfers en streepjes bevatten.`);
  if (!x.feiten) let_.push(`Producten: ${x.naam} heeft geen feiten; Claude kan dan geen prijzen of data noemen.`);
  if (!(Number(x.doelPerResultaat) > 0)) let_.push(`Producten: ${x.naam} heeft geen doelPerResultaat; de app kan dan niet zeggen wanneer een ad te duur is.`);
  if (x.url && !/^https:\/\//.test(x.url)) fouten.push(`Producten: de link van ${x.naam} moet met https:// beginnen.`);
}
for (const t of fouten) console.log('✗ ' + t);
for (const t of let_) console.log('· ' + t);
console.log(fouten.length ? `\n${fouten.length} ding(en) moeten eerst opgelost.` : '\nKlaar om live te zetten.');
process.exit(fouten.length ? 1 : 0);
