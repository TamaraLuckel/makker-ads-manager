// De sjablonen van de Ads Manager: hier wordt een ad getekend.
// Wordt gedeeld door de app (index.html) en de huisstijl-kiezer (huisstijl-kiezer.html), zodat
// wat je in de kiezer ziet precies is wat de app maakt.
//
// Een ontwerp = { sjabloon, foto, pos: {'4x5': '50% 40%', '9x16': ...}, zoom: {...}, kopY: {...}, velden: {...} }
// De huisstijl (merk/huisstijl.json) bepaalt kleuren, lettertypes en logo.
// Geen beeld-AI en geen stockfoto's: de foto komt altijd uit je eigen beeldbank.
window.SJABLONEN = (function () {
  'use strict';
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FMT = { '4x5': [1080, 1350], '9x16': [1080, 1920] };
  const regels = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const paar = (r) => { const i = r.lastIndexOf('|'); return i < 0 ? [r, ''] : [r.slice(0, i).trim(), r.slice(i + 1).trim()]; };

  const STANDAARD_HUISSTIJL = {
    naam: 'Mijn bedrijf',
    kleuren: { accent: '#2B4C7E', accent2: '#E9A23B', licht: '#FFFFFF', papier: '#FBF8F1', inkt: '#1E1E1E', nacht: '#120E0A' },
    fonts: { kop: { google: 'DM Serif Display' }, tekst: { google: 'Work Sans' } },
    logo: null,
    sjablonen: ['bon', 'labels', 'review', 'notitie', 'woord'],
  };
  function huisstijl(h) {
    const s = JSON.parse(JSON.stringify(STANDAARD_HUISSTIJL));
    if (!h) return s;
    Object.assign(s, h);
    s.kleuren = Object.assign({}, STANDAARD_HUISSTIJL.kleuren, h.kleuren || {});
    s.fonts = Object.assign({}, STANDAARD_HUISSTIJL.fonts, h.fonts || {});
    return s;
  }
  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    const n = m ? parseInt(m[1], 16) : 0x120E0A;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // Het verloop over de foto, per sjabloon: lijst van [dekking, positie%].
  const verloop = (H, stops) => `linear-gradient(180deg,${stops.map(([a, p]) => `${rgba(H.kleuren.nacht, a)} ${p}%`).join(',')})`;

  // ————— De sjablonen —————
  // velden: [sleutel, label, soort ('regel' | 'tekst' | 'lijst'), standaard]
  // Lijsten zijn één regel per item; "links | rechts" waar een paar nodig is.
  const SJ = {
    bon: {
      naam: 'Bonnetje', hoek: 'geld', uitleg: 'Schokcijfer bovenin, bonnetje met de rekensom onderin. Sterkste prijsanker.',
      velden: [['kop', 'Grote kop', 'regel', '12 uur.'], ['sub', 'Regel onder de kop', 'regel', 'Zoveel tijd win je per week terug.'],
        ['bonkop', 'Kop van het bonnetje', 'regel', 'JOUW WEEK · VOOR EN NA'], ['regels', 'Regels (wat | getal)', 'lijst', 'mails beantwoorden | 5 uur\nplanning maken | 3 uur'],
        ['groot', 'Grote regel (wat | bedrag)', 'regel', 'Waarde van die uren | € 1.200'], ['totaal', 'Jouw prijs (wat | bedrag)', 'regel', 'Meedoen | € 297'],
        ['voet', 'Kleine lettertjes', 'tekst', 'Eigen berekening. Geen belofte voor jouw bedrijf. Excl. btw.']],
      teken(v, hoog, o, H) {
        const rij = regels(v.regels).map((r) => { const [a, b] = paar(r); return `<div class="r"><span>${esc(a)}</span><i></i><span class="w">${esc(b)}</span></div>`; }).join('');
        const [ga, gb] = paar(v.groot || ''), [ta, tb] = paar(v.totaal || '');
        return {
          html: `<div class="kop licht"><div class="big">${esc(v.kop)}</div><div class="sub">${esc(v.sub)}</div></div>
<div class="bon"><div class="bk">${esc(v.bonkop)}</div>${rij}${ga ? `<div class="r groot"><span>${esc(ga)}</span><i></i><span class="w">${esc(gb)}</span></div>` : ''}
${ta ? `<div class="r tot"><span>${esc(ta)}</span><i></i><span>${esc(tb)}</span></div>` : ''}<div class="voet">${esc(v.voet)}</div></div>`,
          css: `.kop{position:absolute;left:80px;right:80px;top:${kopY(o, hoog, 330, 112)}px;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.big{font:700 104px/1 var(--fk);letter-spacing:-2px}.sub{font:400 42px/1.2 var(--fk);margin-top:8px}
.bon{position:absolute;left:100px;right:100px;bottom:${hoog ? 380 : 80}px;background:var(--papier);color:var(--inkt);padding:40px 48px 34px;transform:rotate(-1.6deg);box-shadow:0 30px 60px rgba(0,0,0,.45);font:500 30px/1.2 var(--ft);-webkit-mask:radial-gradient(circle 9px at 50% 100%,transparent 98%,#000) 0 0/26px 100% repeat-x;mask:radial-gradient(circle 9px at 50% 100%,transparent 98%,#000) 0 0/26px 100% repeat-x}
.bk{font:600 22px var(--ft);letter-spacing:4px;color:var(--accent);margin-bottom:22px;text-transform:uppercase}
.r{display:flex;align-items:baseline;gap:14px;margin:14px 0}.r i{flex:1;border-bottom:3px dotted rgba(0,0,0,.22)}.r .w{font-weight:700}
.groot{font:400 32px var(--ft);margin-top:22px}.groot .w{font:700 54px var(--fk);letter-spacing:-1px}
.tot{border-top:3px solid var(--inkt);padding-top:20px;margin-top:20px;font:700 38px var(--ft);color:var(--accent)}
.voet{font:400 19px/1.3 var(--ft);opacity:.65;margin-top:18px}`,
          verloop: verloop(H, [[0.70, 0], [0.30, 20], [0, 34], [0.15, 60], [0.6, 100]]),
        };
      },
    },
    labels: {
      naam: 'Labeltjes', hoek: 'identiteit', uitleg: 'Stevige stelling bovenin, labeltjes onderin (je team, je aanpak of wat je krijgt).',
      velden: [['sub', 'Kleine regel', 'regel', 'Wat je meeneemt.'], ['big', 'Grote kop', 'tekst', 'Vier weken.\nEén plan.'],
        ['mensen', 'Het lichte label (vet | rest)', 'regel', 'Jij | beslist'],
        ['rollen', 'Labeltjes (vet | rest)', 'lijst', 'Week 1 | richting\nWeek 2 | bouwen\nWeek 3 | testen\nWeek 4 | live'],
        ['cta', 'Slotzin', 'regel', 'Start op 3 november.']],
      teken(v, hoog, o, H) {
        const [ma, mb] = paar(v.mensen || '');
        const chips = regels(v.rollen).map((r) => { const [a, b] = paar(r); return `<div class="c"><b>${esc(a)}</b> ${esc(b)}</div>`; }).join('');
        return {
          html: `<div class="kop licht"><div class="sub">${esc(v.sub)}</div><div class="big">${esc(v.big).replace(/\n/g, '<br>')}</div></div>
<div class="team">${ma ? `<div class="mens">${esc(ma)} <span>${esc(mb)}</span></div>` : ''}<div class="chips">${chips}</div><div class="cta licht">${esc(v.cta)}</div></div>`,
          css: `.kop{position:absolute;left:80px;right:80px;top:${kopY(o, hoog, 330, 130)}px;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.sub{font:400 48px/1.2 var(--fk)}.big{font:700 132px/.98 var(--fk);letter-spacing:-2px;margin-top:10px}
.team{position:absolute;left:70px;right:70px;bottom:${hoog ? 360 : 80}px}
.mens{display:inline-block;background:var(--papier);color:var(--accent);font:700 30px var(--ft);padding:14px 26px;border-radius:40px;margin-bottom:16px}.mens span{font-weight:400;color:var(--inkt)}
.chips{display:flex;flex-wrap:wrap;gap:12px}
.c{background:${rgba(H.kleuren.nacht, 0.42)};border:1.5px solid rgba(255,255,255,.45);color:var(--licht);font:400 27px var(--ft);padding:11px 20px;border-radius:40px}.c b{font-weight:700}
.cta{font:400 40px/1.2 var(--fk);margin-top:28px}`,
          verloop: verloop(H, [[0.72, 0], [0.25, 30], [0, 45], [0.35, 62], [0.88, 100]]),
        };
      },
    },
    review: {
      naam: 'Review', hoek: 'bewijs', uitleg: 'Een echte klantquote groot over de foto. Alleen woordelijk en met toestemming.',
      velden: [['quote', 'De quote (groot)', 'tekst', 'Dit had ik veel eerder moeten doen.'], ['body', 'Meer uit de review (woordelijk)', 'tekst', ''],
        ['naam', 'Naam', 'regel', ''], ['wie', 'Wie is het', 'regel', '']],
      teken(v, hoog, o, H) {
        return {
          html: `<div class="q licht"><div class="tk">“</div><div class="big">${esc(v.quote)}</div>${v.body ? `<div class="body">${esc(v.body)}</div>` : ''}
<div class="wie"><b>${esc(v.naam)}</b>${v.wie ? ' · ' + esc(v.wie) : ''}</div></div>`,
          css: `.q{position:absolute;left:84px;right:84px;bottom:${hoog ? 400 : 110}px;text-shadow:0 2px 20px rgba(0,0,0,.3)}
.tk{font:700 220px/0.6 var(--fk);color:var(--accent2);height:90px}.big{font:700 108px/1 var(--fk);letter-spacing:-1.5px}
.body{font:400 36px/1.34 var(--fk);margin-top:30px;opacity:.95}.wie{font:400 26px/1.35 var(--ft);margin-top:30px;opacity:.9}.wie b{font-weight:700}`,
          verloop: verloop(H, [[0.35, 0], [0, 16], [0.15, 34], [0.82, 62], [0.94, 100]]),
        };
      },
    },
    notitie: {
      naam: 'Notities-app', hoek: 'tijd', uitleg: 'Groot tijdstip of getal, met een telefoon-notitie eroverheen. Voelt eigen, werkt bij koud publiek.',
      velden: [['big', 'Groot', 'regel', '07:30'], ['sub', 'Regel eronder', 'regel', 'Mijn dag staat al klaar.'],
        ['titel', 'Titel van de notitie', 'regel', 'Klaar vóór mijn koffie'], ['datum', 'Datumregel', 'regel', 'dinsdag 07:30'],
        ['items', 'Afgevinkte items', 'lijst', 'Agenda van vandaag\nTwee mails beantwoord\nDe post van morgen'],
        ['slot', 'Slotregel (accentkleur)', 'tekst', 'Ik lees. Ik zeg ja of nee.']],
      teken(v, hoog, o, H) {
        const lijst = regels(v.items).map((t) => `<div class="t"><span class="v">✓</span><span>${esc(t)}</span></div>`).join('');
        return {
          html: `<div class="kop licht"><div class="big">${esc(v.big)}</div><div class="sub">${esc(v.sub)}</div></div>
<div class="notitie"><div class="nb"><span>‹ Notities</span><span>Gereed</span></div><div class="nt">${esc(v.titel)}</div><div class="nd">${esc(v.datum)}</div>${lijst}
${v.slot ? `<div class="nslot">${esc(v.slot).replace(/\n/g, '<br>')}</div>` : ''}</div>`,
          css: `.kop{position:absolute;left:80px;right:80px;top:${kopY(o, hoog, 330, 120)}px;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.big{font:700 210px/0.95 var(--fk);letter-spacing:-4px}.sub{font:400 52px/1.2 var(--fk);margin-top:6px}
.notitie{position:absolute;right:70px;width:560px;bottom:${hoog ? 380 : 90}px;background:#FFFDF6;border-radius:34px;padding:26px 36px 34px;box-shadow:0 30px 70px rgba(0,0,0,.45);color:#1F1E1B;font:400 27px/1.3 var(--ft)}
.nb{display:flex;justify-content:space-between;color:#D9A21B;font-weight:500;font-size:24px;margin-bottom:16px}
.nt{font:700 34px/1.15 var(--ft)}.nd{color:#8a8578;font-size:20px;margin:6px 0 14px}
.t{display:flex;gap:14px;align-items:flex-start;margin:11px 0}
.v{flex:0 0 32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;font:700 19px/32px var(--ft);text-align:center}
.nslot{border-top:2px solid #eee6d4;margin-top:18px;padding-top:16px;font:500 25px/1.35 var(--ft);color:var(--accent)}`,
          verloop: verloop(H, [[0.62, 0], [0.2, 28], [0, 45], [0.25, 75], [0.5, 100]]),
        };
      },
    },
    woord: {
      naam: 'Het grote woord', hoek: 'vrij', uitleg: 'Kleine regel, één enorm woord, korte tekst. Rustig en sterk.',
      velden: [['sub', 'Kleine regel', 'regel', 'Wat ik deze maand leerde:'], ['big', 'Het grote woord', 'regel', 'Minder.'], ['body', 'Korte tekst (mag leeg)', 'tekst', '']],
      teken(v, hoog, o, H) {
        const n = String(v.big || '').length;
        const z = n <= 8 ? 200 : n <= 14 ? 150 : n <= 22 ? 118 : 96;
        return {
          html: `<div class="tekst licht"><div class="sub">${esc(v.sub)}</div><div class="big">${esc(v.big)}</div>${v.body ? `<div class="body">${esc(v.body)}</div>` : ''}</div>`,
          css: `.tekst{position:absolute;left:86px;right:76px;bottom:${hoog ? 400 : 150}px;text-shadow:0 2px 18px rgba(0,0,0,.25)}
.sub{font:400 50px/1.2 var(--fk);margin-bottom:22px}.big{font:700 ${z}px/.98 var(--fk);letter-spacing:-2px}.body{font:400 38px/1.32 var(--fk);margin-top:30px;opacity:.95}`,
          verloop: verloop(H, [[0.25, 0], [0, 14], [0, 34], [0.78, 100]]),
        };
      },
    },
  };
  function kopY(o, hoog, std9, std4) {
    const k = o && o.kopY && o.kopY[hoog ? '9x16' : '4x5'];
    return k !== '' && k !== null && k !== undefined && Number.isFinite(Number(k)) ? Number(k) : (hoog ? std9 : std4);
  }
  function standaardVelden(sj) { const v = {}; (SJ[sj] || SJ.woord).velden.forEach((f) => { v[f[0]] = f[3]; }); return v; }

  // ————— Lettertypes —————
  // fonts.kop / fonts.tekst = { google: 'Naam' } of { naam: 'Naam', bestanden: { 400: 'merk/fonts/x.ttf', 700: 'merk/fonts/x-bold.ttf' } }
  const familie = (f, terug) => `'${String((f && (f.google || f.naam)) || 'Georgia').replace(/'/g, '')}',${terug}`;
  const googleUrl = (naam, metGewicht) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(naam).replace(/%20/g, '+')}${metGewicht ? ':wght@400;700' : ''}&display=swap`;
  const cssCache = {};
  async function googleCss(naam) {
    if (!cssCache[naam]) {
      cssCache[naam] = fetch(googleUrl(naam, true)).then((r) => (r.ok ? r : fetch(googleUrl(naam, false)))).then((r) => {
        if (!r.ok) throw new Error(`Lettertype "${naam}" niet gevonden bij Google Fonts.`);
        return r.text();
      });
    }
    return cssCache[naam];
  }
  const dataCache = {};
  function alsDataUrl(url) {
    if (!dataCache[url]) {
      dataCache[url] = fetch(url, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(`Kon ${url} niet laden (${r.status}).`); return r.blob(); })
        .then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }));
    }
    return dataCache[url];
  }
  // modus 'url': gewone links (voorvertoning). modus 'data': alles ingebed (vastleggen als jpg).
  async function fontCss(H, modus, basis) {
    let uit = '';
    for (const f of [H.fonts.kop, H.fonts.tekst]) {
      if (!f) continue;
      if (f.google) {
        if (modus === 'url') { uit += `@import url("${googleUrl(f.google, true)}");`; continue; }
        // Alleen de Latijnse delen; elk bestand ingebed als data-URL.
        const css = await googleCss(f.google);
        const blokken = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /\/\*\s*latin(-ext)?\s*\*\//.test(b) || !/\/\*/.test(b));
        for (let b of (blokken.length ? blokken : [css])) {
          const urls = [...b.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, ''));
          for (const u of urls) b = b.split(u).join(await alsDataUrl(u));
          uit += b;
        }
      } else if (f.bestanden) {
        for (const [gewicht, pad] of Object.entries(f.bestanden)) {
          const src = modus === 'data' ? await alsDataUrl(basis(pad)) : basis(pad);
          uit += `@font-face{font-family:'${String(f.naam).replace(/'/g, '')}';font-weight:${gewicht};src:url("${src}")}`;
        }
      }
    }
    return uit;
  }

  // ————— Het document voor één formaat —————
  // bron = { foto, logo } als URL of data-URL; fonts = de @font-face/@import-regels.
  function document_(o, fmt, H, bron, fonts) {
    const [w, h] = FMT[fmt];
    const hoog = h > 1500;
    const sj = SJ[o.sjabloon] || SJ.woord;
    const v = Object.assign(standaardVelden(o.sjabloon), o.velden || {});
    const d = sj.teken(v, hoog, o, H);
    const pos = (o.pos && o.pos[fmt]) || '50% 40%';
    const zoom = Math.max(1, Math.min(2, Number(o.zoom && o.zoom[fmt]) || 1));
    const k = H.kleuren;
    const logoH = (H.logo && Number(H.logo.hoogte)) || 30;
    const css = `${fonts}
.fr{--accent:${k.accent};--accent2:${k.accent2};--licht:${k.licht};--papier:${k.papier};--inkt:${k.inkt};--fk:${familie(H.fonts.kop, 'Georgia,serif')};--ft:${familie(H.fonts.tekst, 'Helvetica,Arial,sans-serif')}}
*{box-sizing:content-box}
.fr{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${k.nacht};margin:0}
.foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${pos};transform:scale(${zoom});transform-origin:${pos}}
.verloop{position:absolute;inset:0;background:${d.verloop}}
.logo{position:absolute;left:50%;transform:translateX(-50%);height:${logoH}px;top:${hoog ? 270 : 66}px}
.licht{color:var(--licht)}${d.css}`;
    const body = `<div class="fr">${bron.foto ? `<img class="foto" src="${bron.foto}">` : ''}<div class="verloop"></div>${bron.logo ? `<img class="logo" src="${bron.logo}">` : ''}${d.html}</div>`;
    return { css, body, w, h };
  }

  // ————— Voorvertoning in een iframe —————
  // url(pad) maakt van een pad een bruikbare link (app: '/pad' of '/api/beeld?…'; kiezer: relatief of data-URL).
  async function voorvertoning(o, fmt, H, url) {
    const d = document_(o, fmt, H, { foto: o.foto ? url(o.foto) : '', logo: H.logo && H.logo.pad ? url(H.logo.pad) : '' }, await fontCss(H, 'url', url));
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:${H.kleuren.nacht}}${d.css}</style></head><body>${d.body}</body></html>`;
  }
  async function zetVoorbeeld(iframe, o, fmt, H, url) {
    const [w, h] = FMT[fmt];
    const breed = iframe.parentElement.clientWidth || 320;
    const s = breed / w;
    iframe.style.width = w + 'px'; iframe.style.height = h + 'px'; iframe.style.transform = `scale(${s})`;
    iframe.parentElement.style.height = Math.round(h * s) + 'px';
    iframe.srcdoc = await voorvertoning(o, fmt, H, url);
  }

  // ————— Vastleggen: hetzelfde document als SVG → canvas → jpg (alles ingebed) —————
  async function render(o, fmt, H, url) {
    const [foto, logo, fonts] = await Promise.all([o.foto ? alsDataUrl(url(o.foto)) : '', H.logo && H.logo.pad ? alsDataUrl(url(H.logo.pad)) : '', fontCss(H, 'data', url)]);
    const d = document_(o, fmt, H, { foto, logo }, fonts);
    // Lettertypes ook in deze pagina laden, dan zijn ze er bij het tekenen.
    const stijl = document.createElement('style'); stijl.textContent = fonts; document.head.appendChild(stijl);
    try { await document.fonts.ready; } catch (e) { /* geen probleem */ }
    // HTML → geldige XHTML (een SVG is XML: <img> zonder slash breekt het beeld).
    const doc = document.implementation.createHTMLDocument('');
    doc.body.setAttribute('style', 'margin:0');
    doc.body.innerHTML = `<style>${d.css}</style>${d.body}`;
    const xhtml = new XMLSerializer().serializeToString(doc.body);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}"><foreignObject x="0" y="0" width="${d.w}" height="${d.h}">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    await new Promise((r) => setTimeout(r, 250));
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    await new Promise((r) => setTimeout(r, 150));
    ctx.clearRect(0, 0, d.w, d.h); ctx.drawImage(img, 0, 0); // tweede keer: lettertypes zeker binnen
    stijl.remove();
    return c.toDataURL('image/jpeg', 0.92);
  }
  async function vastleggen(o, H, url) { return { '4x5': await render(o, '4x5', H, url), '9x16': await render(o, '9x16', H, url) }; }

  return { SJ, FMT, esc, regels, paar, huisstijl, standaardVelden, kopY, voorvertoning, zetVoorbeeld, vastleggen, render, STANDAARD_HUISSTIJL };
})();
