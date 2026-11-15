// Schrijft merk/voor-kiezer.js: de huidige huisstijl en beeldbank voor de huisstijl-kiezer.
// (De kiezer opent als los bestand in de browser en kan zelf geen bestanden lezen.)
import fs from 'node:fs';
export function schrijfVoorKiezer() {
  const lees = (f, s) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return s; } };
  const data = { huisstijl: lees('merk/huisstijl.json', null), beeldbank: lees('merk/beeldbank.json', { fotos: [] }).fotos };
  fs.writeFileSync('merk/voor-kiezer.js', '// Gemaakt door de scripts; niet zelf aanpassen.\nwindow.VOOR_KIEZER = ' + JSON.stringify(data, null, 2) + ';\n');
}
