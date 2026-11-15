// Slot op de deur: de hele Ads Manager (pagina's, foto's, API) zit achter één wachtwoord.
// Het wachtwoord staat in Vercel als APP_WACHTWOORD. Na inloggen onthoudt de browser je een jaar.
export const config = { matcher: '/(.*)' };

const COOKIE = 'ads_toegang';
const JAAR = 60 * 60 * 24 * 365;

async function sleutelVan(wachtwoord) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ads-manager:' + wachtwoord));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function cookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : '';
}
function inlog(tekst) {
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Ads Manager</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16181d;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#1e1e1e}
.k{background:#fbf8f1;border-radius:20px;padding:36px 32px;width:100%;max-width:360px;margin:16px;box-sizing:border-box}
h1{font:600 26px/1.2 system-ui;margin:0 0 22px}label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input{width:100%;box-sizing:border-box;font:inherit;padding:12px 14px;border:1.5px solid #ddd5c4;border-radius:10px;background:#fff}
button{width:100%;margin-top:14px;font:600 15px system-ui;padding:13px;border:0;border-radius:99px;background:#1e1e1e;color:#fff;cursor:pointer}
.f{color:#b3261e;font-size:14px;margin:-8px 0 14px}
</style></head><body><div class="k"><h1>Ads Manager</h1>${tekst ? `<p class="f">${tekst}</p>` : ''}
<form method="POST" action="/inloggen"><label for="w">Wachtwoord</label><input id="w" name="wachtwoord" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Inloggen</button></form></div></body></html>`, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default async function middleware(req) {
  const geheim = process.env.APP_WACHTWOORD;
  if (!geheim) return inlog('Er is nog geen wachtwoord ingesteld (APP_WACHTWOORD in Vercel). Tot die tijd blijft de deur dicht.');
  const sleutel = await sleutelVan(geheim);
  if (cookie(req) === sleutel) return;
  const pad = new URL(req.url).pathname;
  if (req.method === 'POST' && pad === '/inloggen') {
    const body = new URLSearchParams(await req.text());
    if (body.get("wachtwoord") === geheim) {
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=${sleutel}; Max-Age=${JAAR}; Path=/; Secure; HttpOnly; SameSite=Lax` } });
    }
    return inlog('Dat wachtwoord klopt niet.');
  }
  return inlog('');
}
