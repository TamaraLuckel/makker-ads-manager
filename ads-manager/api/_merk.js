// Leest wat bij het merk hoort (merk/*.json) en de sjablonen (app/sjablonen.js) aan de serverkant.
// Deze bestanden zet Claude Code bij de installatie neer; aanpassen = bestand wijzigen en opnieuw deployen.
import fs from 'node:fs';
import vm from 'node:vm';

const lees = (rel, std) => {
  try { return JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8')); } catch { return std; }
};
export const huisstijl = () => lees('../merk/huisstijl.json', {});
export const producten = () => (lees('../merk/producten.json', { producten: [] }).producten || []);
export const vasteBeeldbank = () => (lees('../merk/beeldbank.json', { fotos: [] }).fotos || []);

// De sjablonen staan één keer, in app/sjablonen.js (browsercode). Hier draaien we dat bestand in een
// afgesloten zandbak om de velden per sjabloon te kennen; zo kan het nooit uit elkaar lopen.
let sj = null;
export function sjablonen() {
  if (!sj) {
    const code = fs.readFileSync(new URL('../app/sjablonen.js', import.meta.url), 'utf8');
    const ctx = { window: {} };
    vm.runInNewContext(code, ctx);
    sj = ctx.window.SJABLONEN.SJ;
  }
  return sj;
}
