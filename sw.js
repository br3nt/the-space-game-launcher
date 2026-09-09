// The Space Game launcher: service worker that stands in for Casual Collective's dead servers.
//
// The page tells Ruffle to rewrite *.casualcollective.com URLs to <scope>cc/<host>/<path>.
// Everything under cc/ is answered here:
//   cc/storage.cloud.casualcollective.com/...  the SWFs (from the browser cache the page filled, or ./storage/ if cloned)
//   cc/widget.casualcollective.com/...         the widget's API: load, session/setup, session/start, player/data, ...
// Nothing else is intercepted.

const CACHE = 'tsg-files-v1';
const SAVES = 'tsg-saves-v1';                          // separate, so clearing game files keeps progress
const SCOPE = self.registration.scope;                 // e.g. https://br3nt.github.io/the-space-game-launcher/
const CC = SCOPE + 'cc/';
const STORAGE = CC + 'storage.cloud.casualcollective.com/';
const API = CC + 'widget.casualcollective.com/';

// gid -> game. Versions and names come from Flashpoint's reconstructed setup.php.
// Only 10 and 16 have been tested; the rest are the other Casual Collective games the same widget served.
const GAMES = {
  10: { stem: 'thespacegame',  ver: 83, gname: 'TheSpaceGame',      splash: '/10/thespacegamebg' },
  16: { stem: 'tsgmissions',   ver: 16, gname: 'TSGMissions',       splash: '' },   // no splash was ever archived
  2:  { stem: 'desktoparmada', ver: 26, gname: 'DesktopArmada',     splash: '/2/desktoparmadabg' },
  3:  { stem: 'buggleconnect', ver: 16, gname: 'BuggleConnect',     splash: '/3/buggleconnectbg' },
  7:  { stem: 'flashelementtd2', ver: 9, gname: 'FlashElementTD2',  splash: '/7/flashelementtd2bg' },
  8:  { stem: 'attackofthebuggles', ver: 14, gname: 'AttackoftheBuggles', splash: '/8/attackofthebugglesbg' },
  9:  { stem: 'bugglestars',   ver: 24, gname: 'BuggleStars',       splash: '/9/bugglestarsbg' },
  13: { stem: 'desktoptdpro',  ver: 35, gname: 'DesktopTDPro',      splash: '/13/desktoptdprobg' },
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.startsWith(CC)) return;                     // not ours: let the browser do its thing
  e.respondWith(handle(e.request).catch(err => text('result=0&reason=' + encodeURIComponent(String(err)), 500)));
});

// The Space Game's own stage is 700x700: a 200px panel under the play area holds the live graphs and the
// Sandbox wave designer. Its loader and widget say 700x525, and in 2009 the page embedded them taller, so
// Flash showed the whole game with the widget's 25px bar under it. Ruffle sizes the stage from the root
// SWF's header, so the loader goes out with its height corrected. The widget pins its bar to Stage.height.
const STAGE_HEIGHT = { 'games/thespacegame.swf': 725 };

async function handle(req) {
  const u = new URL(req.url);
  const bare = u.origin + u.pathname;                  // cache keys never carry a query string
  if (bare.startsWith(STORAGE)) {
    const path = bare.slice(STORAGE.length);
    const res = await resolveFile(path);
    if (res && STAGE_HEIGHT[path]) return swfResponse(setStageHeight(new Uint8Array(await res.arrayBuffer()), STAGE_HEIGHT[path]));
    return res || text('not found: ' + path, 404);
  }
  if (bare.startsWith(API)) return api(req, u, bare.slice(API.length).replace(/\/+/g, '/'));
  return text('not found', 404);
}

// ---- files -----------------------------------------------------------------------------------

// A SWF the page imported (already converted to uncompressed FWS), or, for a cloned repo served by
// a static server, the file under ./storage/<path>, converted on first use and cached.
async function resolveFile(path) {
  const cache = await caches.open(CACHE);
  const key = STORAGE + path;
  const hit = await cache.match(key);
  if (hit) return hit;
  let local;
  try { local = await fetch(SCOPE + 'storage/' + path, { cache: 'no-store' }); } catch { return null; }
  if (!local.ok) return null;
  const bytes = new Uint8Array(await local.arrayBuffer());
  const swf = await toFWS(bytes);
  const res = new Response(swf, { headers: { 'Content-Type': 'application/x-shockwave-flash', 'Content-Length': String(swf.byteLength) } });
  await cache.put(key, res.clone());
  return res;
}

// CWS (zlib-compressed SWF) -> FWS. The widget's preloader waits for getBytesLoaded() == getBytesTotal(),
// which Ruffle only satisfies for an uncompressed child SWF. Anything that is not CWS passes through.
async function toFWS(bytes) {
  if (!(bytes[0] === 0x43 && bytes[1] === 0x57 && bytes[2] === 0x53)) return bytes;   // "CWS"
  const body = new Uint8Array(await new Response(
    new Blob([bytes.subarray(8)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const out = new Uint8Array(8 + body.length);
  out.set([0x46, 0x57, 0x53, bytes[3]]);                                            // "FWS" + version
  new DataView(out.buffer).setUint32(4, out.length, true);
  out.set(body, 8);
  return out;
}

// Rewrite Ymax in the header RECT of an uncompressed SWF. The RECT is 5 bits of field width, then four
// signed fields; a 700px stage needs 15 bits, and every SWF here already uses 15, so the bytes stay put.
function setStageHeight(bytes, px) {
  if (bytes[0] !== 0x46) return bytes;                                              // only FWS
  const nbits = bytes[8] >> 3, v = px * 20, start = 5 + 3 * nbits;                 // Ymax is the 4th field
  if (v >= 1 << (nbits - 1)) return bytes;                                          // would need a wider RECT
  for (let i = 0; i < nbits; i++) {
    const bit = start + i, byte = 8 + (bit >> 3), mask = 0x80 >> (bit & 7);
    if ((v >> (nbits - 1 - i)) & 1) bytes[byte] |= mask; else bytes[byte] &= ~mask;
  }
  return bytes;
}

function swfResponse(swf) {
  return new Response(swf, { headers: { 'Content-Type': 'application/x-shockwave-flash', 'Content-Length': String(swf.byteLength) } });
}

async function exists(path) {
  const cache = await caches.open(CACHE);
  if (await cache.match(STORAGE + path)) return true;
  return !!(await resolveFile(path));
}

// ---- the widget API ----------------------------------------------------------------------------

async function api(req, u, path) {
  const q = u.searchParams;
  const form = req.method === 'POST' ? new URLSearchParams(await req.text()) : new URLSearchParams();
  const gid = q.get('gid') || form.get('gid') || '10';
  const game = GAMES[gid];
  if (!game) return text('result=0&reason=unknown+gid');

  if (path.endsWith('/load') || path === 'load') {   // loader: "where is the widget?"
    return text(`zone=pub&w1=http://storage.cloud.casualcollective.com/zones/pub/${gid}/widget.swf?PHPSESSID=local&w2=http://widget.casualcollective.com`);
  }

  if (path.endsWith('session/setup')) {              // widget config, same shape as Flashpoint's setup.php
    const stinger = (await exists('zones/pub/stingers/ccblocks.swf')) ? '/stingers/ccblocks.swf' : '';
    const splash = (game.splash && await exists('zones/pub' + game.splash + '.swf')) ? game.splash : '';
    const cfg = {
      result: 1, host: 'local', lr: 'cc', ss: 'http://sessions.casualcollective.com', zone: 'pub',
      wv: 1, server: '', port: 0, lobby: 'lobby', menu: '',
      sid: 1, pid: 1, pname: 'Player', pd: await loadPd(gid), friends: '',
      cls: 2, pms: 1, r: 0, seed: Math.floor(Math.random() * 999999) + 1,       // class 2 = member
      dmode: '', gname: game.gname, gtype: 'sp',
      swfs: { base: 'http://storage.cloud.casualcollective.com/zones/pub', stinger, dev: '', ad: '', adid: '',
              splash, game: `/${gid}/${game.stem}`, stingerv: 0, devv: 0, splashv: 1, gamev: game.ver },
      as: 'http://storage.cloud.casualcollective.com/avatars',
      awards: '', stats: '', netcode: 0, mplayers: 1, ls: '', ext: '', urr: 0,
    };
    return new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json' } });
  }

  if (path.endsWith('session/start')) return text('sid=1&result=1');

  if (path.endsWith('player/data')) {                // the game's persistent save data
    // URLSearchParams decoded the POST layer; the game escape()s the k=v,k=v string itself before
    // handing it to the widget, so decode once more and store it plain. Stored escaped, the game
    // reads one giant key on the next load and the save snowballs.
    let pd = form.get('pd') ?? q.get('pd');
    try { pd = pd && decodeURIComponent(pd); } catch {}
    if (pd) await savePd(gid, pd);
    return text('result=1');
  }

  if (path.endsWith('crossdomain.xml')) {
    return new Response('<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*"/></cross-domain-policy>',
      { headers: { 'Content-Type': 'application/xml' } });
  }

  return text('result=1');                           // levelStart / levelTick / levelUpdate / score / award / log
}

async function loadPd(gid) {
  const cache = await caches.open(SAVES);
  const r = await cache.match(CC + 'pd/' + gid);
  return r ? r.text() : '';
}
async function savePd(gid, pd) {
  const cache = await caches.open(SAVES);
  await cache.put(CC + 'pd/' + gid, new Response(pd, { headers: { 'Content-Type': 'text/plain' } }));
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
