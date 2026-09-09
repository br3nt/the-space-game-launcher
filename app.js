// The Space Game launcher page: tabs, starfield, file import, and starting Ruffle.
(() => {
  const SCOPE = new URL('./', location.href).href;
  const CACHE = 'tsg-files-v1';
  const SAVES = 'tsg-saves-v1';   // player data, kept apart from the files (sw.js writes it)
  const STORAGE = SCOPE + 'cc/storage.cloud.casualcollective.com/';

  // What each game needs. Paths are relative to storage.cloud.casualcollective.com, exactly as in
  // Flashpoint's data packs (content/storage.cloud.casualcollective.com/...).
  const GAMES = {
    thespacegame: {
      title: 'The Space Game', gid: 10, loader: 'games/thespacegame.swf', stage: 725,   // 700 of game + the widget's bar, see sw.js
      required: ['games/thespacegame.swf', 'zones/pub/10/widget.swf', 'zones/pub/10/thespacegame.v83.swf'],
      optional: ['zones/pub/10/thespacegamebg.swf', 'zones/pub/stingers/ccblocks.swf'],
    },
    tsgmissions: {
      title: 'The Space Game: Missions', gid: 16, loader: 'games/tsgmissions.swf', stage: 525,
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
  const drop = $('#drop');

  // ---- tabs ------------------------------------------------------------------------------------
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    document.body.dataset.tab = name;
  }
  function goTab(name) { showTab(name); history.replaceState(null, '', '#' + name); }
  $$('.tab').forEach(t => t.addEventListener('click', () => goTab(t.dataset.tab)));
  // In-text links between tabs ("See Get the files").
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-goto]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); goTab(a.dataset.goto); $('.tabs').scrollIntoView({ block: 'start' });
  });
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
  const status = $('#status'), statusText = $('#status-text'), dropStatus = $('#drop-status');
  const FILES_LINK = '<a href="#files" data-goto="files">Get the files</a>';
  function setStatus(msg, pct, kind, html) {
    if (html) statusText.innerHTML = msg; else statusText.textContent = msg;
    status.style.setProperty('--pct', (pct ?? 100) + '%');
    status.dataset.kind = kind || '';
  }
  // Import messages are also shown next to the drop zone, which lives on the "Get the files" tab.
  function setDropStatus(msg, kind) { dropStatus.textContent = msg; dropStatus.dataset.kind = kind || ''; dropStatus.hidden = !msg; }

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
    let allReady = true;
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
      if (!ok) allReady = false;
      $(`#play-${id}`).disabled = !ok;
      $(`#ready-${id}`).innerHTML = ok ? 'Ready to launch' : 'No files yet. ' + FILES_LINK;
      $(`#ready-${id}`).className = 'ready ' + (ok ? 'ok' : 'no');
      $(`#check-${id}`).textContent = ok ? 'Ready' : 'Files missing';
      $(`#check-${id}`).className = 'ready ' + (ok ? 'ok' : 'no');
    }
    // Once every file is in, the drop zone has done its job. It comes back if the files are cleared.
    drop.hidden = allReady;
    $('#drop-blurb').hidden = allReady;
    $('#drop-done').hidden = !allReady;
  }

  // Saved progress, per game: what sw.js stored from the game's player/data posts.
  async function refreshSaves() {
    const cache = await caches.open(SAVES);
    const ul = $('#saves'); ul.innerHTML = '';
    for (const [id, g] of Object.entries(GAMES)) {
      const r = await cache.match(SCOPE + 'cc/pd/' + g.gid);
      const pd = r ? await r.text() : '';
      const li = document.createElement('li');
      const name = document.createElement('b'); name.textContent = g.title;
      const state = document.createElement('span'); state.className = pd ? 'have' : 'none';
      state.textContent = pd ? `${pd.split(',').filter(Boolean).length} value${pd.includes(',') ? 's' : ''} saved` : 'nothing saved yet';
      li.append(name, ' ', state);
      if (pd) {
        const btn = document.createElement('button'); btn.className = 'link'; btn.textContent = 'clear';
        btn.addEventListener('click', async () => { await cache.delete(SCOPE + 'cc/pd/' + g.gid); setDropStatus(`${g.title}: saved progress cleared.`, ''); refreshSaves(); });
        li.append(' ', btn);
      }
      ul.appendChild(li);
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
        setStatus(`Importing ${m[1]}`, 60, 'busy'); setDropStatus(`Importing ${m[1]}`, 'busy');
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
    let msg, kind;
    try {
      for (const f of files) total += await importFile(f, warnings);
      if (warnings.length) { msg = warnings.join(' '); kind = 'error'; }
      else if (total) { msg = `Imported ${total} file${total === 1 ? '' : 's'}.`; kind = 'ok'; }
      else { msg = 'Nothing usable in that. Expecting the Flashpoint data pack zips or the SWFs by name.'; kind = 'error'; }
    } catch (err) { msg = String(err.message || err); kind = 'error'; }
    setStatus(msg, 100, kind); setDropStatus(msg, kind);
    await refreshFiles();
    const ready = Object.keys(GAMES).filter(id => !$(`#play-${id}`).disabled);
    if (kind === 'ok' && ready.length) setDropStatus(msg + ' Ready to play.', 'ok');
  }

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); });
  $('#file-input').addEventListener('change', e => importFiles([...e.target.files]));
  // A zip dropped anywhere else (the Play tab, say) must not navigate the page away; route it to the importer.
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); if (drop.contains(e.target)) return; goTab('files'); importFiles([...e.dataTransfer.files]); });
  $('#clear').addEventListener('click', async () => { await caches.delete(CACHE); setStatus('Stored game files cleared. Saved progress is kept.', 100, ''); setDropStatus('Stored game files cleared. Saved progress is kept.', ''); refreshFiles(); });

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
    const mine = player;
    $('#stage').style.setProperty('--stage-h', g.stage);   // the widget's bar takes the bottom 25px; CSS clips it
    showRows(500);
    $('#stage').appendChild(player);
    setStatus('Loading: 0%', 0, 'busy');
    clearTimeout(runningTimer);
    player.addEventListener('loadedmetadata', () => {
      setStatus('Loading: 100%', 100, 'ok'); applyVolume();
      // Size the stage from what Ruffle actually loaded, so the page and the worker's loader never disagree
      // (a cached page can outlive a worker update, or the other way round).
      if (player.metadata && player.metadata.height) $('#stage').style.setProperty('--stage-h', player.metadata.height);
    });
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      await player.ruffle().load({
        url: STORAGE + g.loader,
        // No page script access for user-supplied SWFs. allowNetworking must stay 'all': 'internal' stalls the widget's intro.
        // Links the games open (the banners, "More games") are rewritten below to places that still exist, so they open without a prompt.
        allowNetworking: 'all', allowScriptAccess: false, autoplay: 'on', unmuteOverlay: 'hidden', openUrlMode: 'allow',
        scale: 'showAll', forceScale: true, forceAlign: true, backgroundColor: '#000000', logLevel: 'warn',
        // Like Steam, pause the game while its tab is in the background and resume it when the tab is back. Ruffle's
        // default keeps ticking on a throttled clock instead, which is the crawl that looks like a hang.
        backgroundExecutionMode: 'none',
        urlRewriteRules: [
          [/^https?:\/\/(widget|sessions|sessions2)\.casualcollective\.com\//, cc + 'widget.casualcollective.com/'],
          [/^https?:\/\/storage\.cloud\.casualcollective\.com\//, cc + 'storage.cloud.casualcollective.com/'],
          // Missions' "play the original TSG" banner: games?id=2 was The Space Game's page. Open it here instead.
          [/^https?:\/\/www\.casualcollective\.com\/games\?id=2(&.*)?$/, SCOPE + '#thespacegame'],
          // Everything else on the dead site goes to the Wayback Machine's 2009 copy.
          [/^https?:\/\/(www\.)?casualcollective\.com\//, 'https://web.archive.org/web/2009/http://www.casualcollective.com/'],
        ],
      });
    } catch (err) {
      if (player === mine) setStatus(`Could not load ${g.loader}: ${err.message || err}`, 100, 'error');
      return;
    }
    if (player !== mine) return;             // a second Launch replaced this player meanwhile
    // Ruffle only pauses on a visibilitychange event. A game launched into a tab that is already hidden never
    // gets one, so send it ourselves; Ruffle then notes it was playing and resumes when the tab comes back.
    if (document.hidden) document.dispatchEvent(new Event('visibilitychange'));
    syncStatus(6000);
  }
  $$('[data-play]').forEach(b => b.addEventListener('click', () => play(b.dataset.play)));
  $$('.tab').forEach(t => t.addEventListener('click', () => { if (t.dataset.tab === 'files') refreshSaves(); }));
  $('#fullscreen').addEventListener('click', () => $('#stage').requestFullscreen && $('#stage').requestFullscreen());
  // Volume and mute drive Ruffle directly; the widget's own bar (bottom 25px of its stage) is clipped off by CSS.
  let muted = false;
  function applyVolume() { if (player) player.volume = muted ? 0 : 1; document.body.classList.toggle('muted', muted); $('#mute').title = muted ? 'Unmute' : 'Mute'; $('#mute').setAttribute('aria-pressed', String(muted)); }
  $('#mute').addEventListener('click', () => { muted = !muted; applyVolume(); });
  // The Space Game's stage is 700 rows tall, but only Sandbox Mode (level 13) uses the bottom 200, for its wave
  // designer. Everywhere else that strip is an empty panel, so the stage shows 500 rows and grows for Sandbox.
  // The worker relays the widget's level calls; the score or level-update post means the level is over.
  const SANDBOX = { 10: 13 };
  function showRows(rows) { $('#stage').style.setProperty('--stage-vis', rows); }
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'levelStart') showRows(SANDBOX[m.gid] === m.lnum ? 700 : 500);
    else if (m.type === 'levelEnd') showRows(500);
  });
  // Quitting a level posts nothing, so watch for the game's own Quit button (top right of the play bar) followed
  // by its YES confirmation, in stage coordinates. Two clicks in the right places within a few seconds.
  let quitAsked = 0;
  $('#stage').addEventListener('pointerdown', e => {
    const st = $('#stage'); if (st.style.getPropertyValue('--stage-vis') !== '700') return;
    const r = st.getBoundingClientRect(), k = 700 / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    if (x >= 555 && x <= 610 && y <= 26) quitAsked = Date.now();
    else if (x >= 538 && x <= 588 && y >= 26 && y <= 52 && Date.now() - quitAsked < 8000) { quitAsked = 0; showRows(500); }
  }, true);
  // Ruffle does the pausing (backgroundExecutionMode above). This keeps the status bar truthful about it.
  function syncStatus(delay) {
    clearTimeout(runningTimer);
    runningTimer = setTimeout(() => {
      const title = GAMES[document.body.dataset.game].title;
      setStatus(document.hidden ? `${title} is paused while this tab is in the background.` : `${title} is running.`, 100, 'ok');
    }, delay);
  }
  document.addEventListener('visibilitychange', () => { if (player) syncStatus(800); });

  // ---- go ------------------------------------------------------------------------------------
  setStatus('Checking files…', 30, 'busy');
  swPromise = registerSW();
  swPromise.then(async () => {
    await refreshFiles(); await refreshSaves();
    if (swReady) {
      const ready = Object.keys(GAMES).filter(id => !$(`#play-${id}`).disabled);
      if (ready.length) setStatus('Ready. Pick a game.', 100, 'ok');
      else setStatus('No game files yet. ' + FILES_LINK + '.', 100, 'error', true);
      const want = location.hash.slice(1);
      if (GAMES[want] && ready.includes(want)) play(want);
    }
  }).catch(err => setStatus('Service worker failed: ' + (err.message || err), 100, 'error'));
})();
