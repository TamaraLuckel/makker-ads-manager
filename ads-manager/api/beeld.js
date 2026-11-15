// Beelden uit de private opslag (vastgelegde ads en foto's die je via de app toevoegt).
// GET ?pad=beelden/<…>.jpg of ?pad=beeldbank/<…>.jpg. Zit achter het wachtwoord, zoals alles.
import { leesBytes } from './_opslag.js';

export default async function handler(req, res) {
  const pad = String((req.query && req.query.pad) || '').replace(/^\/+/, '').replace(/^opslag\//, '');
  if (!/^(beelden|beeldbank)\/[\w.-]+\.(jpe?g|png)$/i.test(pad)) return res.status(400).json({ fout: 'Geen toegestaan beeld.' });
  const bytes = await leesBytes(pad).catch(() => null);
  if (!bytes) return res.status(404).json({ fout: 'Beeld niet gevonden.' });
  res.setHeader('Content-Type', /\.png$/i.test(pad) ? 'image/png' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  const naam = req.query.download ? String(req.query.download).replace(/[^\w.-]/g, '') : '';
  if (naam) res.setHeader('Content-Disposition', `attachment; filename="${naam}"`);
  return res.status(200).send(bytes);
}
