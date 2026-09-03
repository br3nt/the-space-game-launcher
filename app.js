// The Space Game launcher page: tabs, starfield, file import, and starting Ruffle.
(() => {
  const SCOPE = new URL('./', location.href).href;
  const CACHE = 'tsg-files-v1';
  const STORAGE = SCOPE + 'cc/storage.cloud.casualcollective.com/';

  // What each game needs. Paths are relative to storage.cloud.casualcollective.com, exactly as in
  // Flashpoint's data packs (content/storage.cloud.casualcollective.com/...).
  const GAMES = {
    thespacegame: {
      title: 'The Space Game', loader: 'games/thespacegame.swf',
      required: ['games/thespacegame.swf', 'zones/pub/10/widget.swf', 'zones/pub/10/thespacegame.v83.swf'],
      optional: ['zones/pub/10/thespacegamebg.swf', 'zones/pub/stingers/ccblocks.swf'],
    },
    tsgmissions: {
      title: 'The Space Game: Missions', loader: 'games/tsgmissions.swf',
      required: ['games/tsgmissions.swf', 'zones/pub/16/widget.swf', 'zones/pub/16/tsgmissions.v16.swf'],
      optional: ['zones/pub/stingers/ccblocks.swf'],
    },
  };
  // Loose SWFs dropped by name (for people who fetched them one at a time instead of the zips).
  const LOOSE = {
    'thespacegame.swf': ['games/thespacegame.swf'],
    'thespacegamehacked.swf': [],
    'tsgmissions.swf': ['games/tsgmissions.swf'],
    'widget.swf': ['zones/pub/10/widget.swf', 'zones/pub/16/widget.swf'],
    'thespacegame.v83.swf': ['zones/pub/10/thespacegame.v83.swf'],
    'tsgmissions.v16.swf': ['zones/pub/16/tsgmissions.v16.swf'],
    'thespacegamebg.swf': ['zones/pub/10/thespacegamebg.swf'],
    'ccblocks.swf': ['zones/pub/stingers/ccblocks.swf'],
  };

  const KNOWN = new Set([...Object.values(GAMES).flatMap(g => [...g.required, ...g.optional]), ...Object.values(LOOSE).flat()]);
  // Known-good sha256 of the Flashpoint data packs, checked on import.
  const PACKS = {
    '80790aab1c8da74fa7d2202fc9a788e23e7480a7c41933ff5140c9f8534dd5ab': 'The Space Game data pack',
    '937d1e37774f82a1968f122e21d715e78988eac8579902cffb2c185da12b36b2': 'The Space Game: Missions data pack',
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // ---- tabs ------------------------------------------------------------------------------------
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    document.body.dataset.tab = name;
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => { showTab(t.dataset.tab); history.replaceState(null, '', '#' + t.dataset.tab); }));
  const hash = location.hash.slice(1);
  showTab(document.querySelector(`.panel[data-panel="${CSS.escape(hash)}"]`) ? hash : 'play');

  // ---- starfield -------------------------------------------------------------------------------
  const cv = $('#stars'), cx = cv.getContext('2d');
  let stars = [];
  function resize() {
    cv.width = innerWidth; cv.height = innerHeight;
    stars = Array.from({ length: Math.floor(cv.width * cv.height / 6000) }, () => ({
      x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.3 + 0.2, p: Math.random() * 6.28, s: Math.random() * 0.02 + 0.003 }));
  }
  function draw(t) {
    cx.clearRect(0, 0, cv.width, cv.height);
    for (const s of stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(s.p + t * s.s * 0.06));
      cx.fillStyle = `rgba(255,255,255,${a})`; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.28); cx.fill();
    }
    requestAnimationFrame(draw);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(draw);

  // ---- status line (styled like the loader's "Loading: 100%" bar) ------------------------------
  const status = $('#status'), statusText = $('#status-text');
  function setStatus(msg, pct, kind) {
    statusText.textContent = msg;
    status.style.setProperty('--pct', (pct ?? 100) + '%');
    status.dataset.kind = kind || '';
  }

  // ---- service worker --------------------------------------------------------------------------
  let swReady = false;
  let swPromise;   // play() waits on this instead of racing a flag
  async function registerSW() {
    if (location.protocol === 'file:') { setStatus('Open this page through a web server, not as a file. See "Get the files".', 100, 'error'); return; }
    if (!('serviceWorker' in navigator)) { setStatus('This browser has no service worker support.', 100, 'error'); return; }
    await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      // First visit: the worker is installed but this page loaded before it took control. One reload fixes it.
      if (!sessionStorage.getItem('tsg-reloaded')) { sessionStorage.setItem('tsg-reloaded', '1'); location.reload(); return; }
      setStatus('The service worker did not take control of the page. Reload once.', 100, 'error'); return;
    }
    sessionStorage.removeItem('tsg-reloaded');
    swReady = true;
  }

  // ---- files -----------------------------------------------------------------------------------
  async function have(path) {
    const cache = await caches.open(CACHE);
    if (await cache.match(STORAGE + path)) return true;
    try { const r = await fetch(SCOPE + 'storage/' + path, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
  }
  async function refreshFiles() {
    for (const [id, g] of Object.entries(GAMES)) {
      const rows = [...g.required.map(p => [p, true]), ...g.optional.map(p => [p, false])];
      const ul = $(`#files-${id}`); ul.innerHTML = '';
      let ok = true;
      for (const [p, req] of rows) {
        const present = await have(p);
        if (req && !present) ok = false;
        const li = document.createElement('li');
        li.className = present ? 'have' : (req ? 'missing' : 'optional');
        li.innerHTML = `<span class="mark"></span><code>${p}</code>${req ? '' : ' <em>optional</em>'}`;
        ul.appendChild(li);
      }
      $(`#play-${id}`).disabled = !ok;
      $(`#ready-${id}`).textContent = ok ? 'Ready to launch' : 'Files missing';
      $(`#ready-${id}`).className = 'ready ' + (ok ? 'ok' : 'no');
    }
  }

  async function storeSWF(path, bytes) {
    const swf = await toFWS(bytes);
    const cache = await caches.open(CACHE);
    await cache.put(STORAGE + path, new Response(swf, { headers: { 'Content-Type': 'application/x-shockwave-flash', 'Content-Length': String(swf.byteLength) } }));
  }
  async function toFWS(bytes) {
    if (!(bytes[0] === 0x43 && bytes[1] === 0x57 && bytes[2] === 0x53)) return bytes;
    const body = new Uint8Array(await new Response(new Blob([bytes.subarray(8)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const out = new Uint8Array(8 + body.length);
    out.set([0x46, 0x57, 0x53, bytes[3]]); new DataView(out.buffer).setUint32(4, out.length, true); out.set(body, 8);
    return out;
  }

  // Minimal zip reader: central directory -> entries -> inflate. Enough for Flashpoint's data packs.
  async function* zipEntries(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip file');
    const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    let p = cdOff;
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (name.endsWith('/')) continue;
      const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      const data = u8.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
      yield { name, usize, read: async () => method === 0 ? data
        : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) };
    }
  }

  async function importFile(file, warnings) {
    const name = file.name.toLowerCase();
    let stored = 0;
    if (name.endsWith('.zip')) {
      const buf = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (!PACKS[digest]) warnings.push(`${file.name} is not one of the known Flashpoint data packs (sha256 ${digest.slice(0, 12)}…); imported anyway, at your own risk.`);
      for await (const e of zipEntries(buf)) {
        const m = e.name.match(/^content\/storage\.cloud\.casualcollective\.com\/(.+\.swf)$/i);
        if (!m || !KNOWN.has(m[1])) continue;               // only the paths the launcher knows about
        setStatus(`Importing ${m[1]}`, 60, 'busy');
        await storeSWF(m[1], await e.read()); stored++;
      }
    } else if (name.endsWith('.swf')) {
      const targets = LOOSE[name];
      if (!targets) throw new Error(`Don't know where ${file.name} belongs`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      for (const t of targets) { await storeSWF(t, bytes); stored++; }
    } else throw new Error(`${file.name}: not a .zip or .swf`);
    return stored;
  }

  async function importFiles(files) {
    let total = 0; const warnings = [];
    try {
      for (const f of files) total += await importFile(f, warnings);
      if (warnings.length) setStatus(warnings.join(' '), 100, 'error');
      else setStatus(total ? `Imported ${total} file${total === 1 ? '' : 's'}. Files stay in this browser until you clear them.` : 'Nothing usable in that. Expecting the Flashpoint data pack zips or the SWFs by name.', 100, total ? 'ok' : 'error');
    } catch (err) { setStatus(String(err.message || err), 100, 'error'); }
    await refreshFiles();
  }

  const drop = $('#drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); });
  $('#file-input').addEventListener('change', e => importFiles([...e.target.files]));
  $('#clear').addEventListener('click', async () => { await caches.delete(CACHE); setStatus('Stored game files cleared. Saved progress is kept.', 100, ''); refreshFiles(); });

  // ---- play ------------------------------------------------------------------------------------
  let player = null, runningTimer = 0;
  async function play(id) {
    const g = GAMES[id];
    setStatus('Starting…', 10, 'busy');
    try { await swPromise; } catch {}
    if (!swReady) { setStatus('The service worker is not running, so the game cannot be served. Reload the page.', 100, 'error'); return; }
    showTab('play');
    document.body.dataset.game = id;
    if (player) { player.remove(); player = null; }
    if (!window.RufflePlayer || !window.RufflePlayer.newest()) { setStatus('Ruffle did not load. Are you online? (Ruffle is fetched from a CDN.)', 100, 'error'); return; }
    const cc = SCOPE + 'cc/';
    player = window.RufflePlayer.newest().createPlayer();
    $('#stage').appendChild(player);
    setStatus('Loading: 0%', 0, 'busy');
    clearTimeout(runningTimer);
    player.addEventListener('loadedmetadata', () => { setStatus('Loading: 100%', 100, 'ok'); applyVolume(); });
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      await player.ruffle().load({
        url: STORAGE + g.loader,
        // No page script access for user-supplied SWFs. allowNetworking must stay 'all': 'internal' stalls the widget's intro.
        allowNetworking: 'all', allowScriptAccess: false, autoplay: 'on', unmuteOverlay: 'hidden', openUrlMode: 'confirm',
        scale: 'showAll', forceScale: true, forceAlign: true, backgroundColor: '#000000', logLevel: 'warn',
        urlRewriteRules: [
          [/^https?:\/\/(widget|sessions|sessions2)\.casualcollective\.com\//, cc + 'widget.casualcollective.com/'],
          [/^https?:\/\/storage\.cloud\.casualcollective\.com\//, cc + 'storage.cloud.casualcollective.com/'],
        ],
      });
    } catch (err) {
      setStatus(`Could not load ${g.loader}: ${err.message || err}`, 100, 'error'); return;
    }
    runningTimer = setTimeout(() => setStatus(`${g.title} is running.`, 100, 'ok'), 6000);
  }
  $$('[data-play]').forEach(b => b.addEventListener('click', () => play(b.dataset.play)));
  $('#fullscreen').addEventListener('click', () => $('#stage').requestFullscreen && $('#stage').requestFullscreen());
  // Volume and mute drive Ruffle directly; the widget's own bar (bottom 25px of its stage) is clipped off by CSS.
  let muted = false;
  function applyVolume() { if (player) player.volume = muted ? 0 : 1; document.body.classList.toggle('muted', muted); $('#mute').title = muted ? 'Unmute' : 'Mute'; $('#mute').setAttribute('aria-pressed', String(muted)); }
  $('#mute').addEventListener('click', () => { muted = !muted; applyVolume(); });

  // ---- go ------------------------------------------------------------------------------------
  setStatus('Checking files…', 30, 'busy');
  swPromise = registerSW();
  swPromise.then(async () => {
    await refreshFiles();
    if (swReady) {
      const ready = Object.keys(GAMES).filter(id => !$(`#play-${id}`).disabled);
      setStatus(ready.length ? 'Ready. Pick a game.' : 'No game files yet. See "Get the files".', 100, ready.length ? 'ok' : 'error');
      const want = location.hash.slice(1);
      if (GAMES[want] && ready.includes(want)) play(want);
    }
  }).catch(err => setStatus('Service worker failed: ' + (err.message || err), 100, 'error'));
})();
