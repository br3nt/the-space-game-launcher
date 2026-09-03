# The Space Game: Launcher

Play **The Space Game** and **The Space Game: Missions** (Casual Collective, 2009) again.

The SWFs you can still download are 16 KB loaders. At start-up they phone home to
`widget.casualcollective.com`, fetch a wrapper, fetch a config, fetch the actual game, and do a
handshake. Those servers are gone, so all you get is
*"Unable to load game. Please notify www.casualcollective.com."*

This repo is a static page plus a **service worker that answers as the dead servers did**. The
original loader, wrapper and game run unmodified in [Ruffle](https://ruffle.rs/).

**Play it: <https://br3nt.github.io/the-space-game-launcher/>**

No game files are in this repo. You fetch them from the archives (links and checksums are on the
page and below) and drop them on the page. They stay in your browser.

## Get the files

Flashpoint Archive's data packs for both games. Same URLs the Flashpoint launcher uses.

| Game | Zip | sha256 |
|---|---|---|
| The Space Game | [944ea5a3-558d-feda-4eb7-e900f3e60b06-1631483058057.zip](https://download.unstable.life/gib-roms/Games/944ea5a3-558d-feda-4eb7-e900f3e60b06-1631483058057.zip) | `80790aab1c8da74fa7d2202fc9a788e23e7480a7c41933ff5140c9f8534dd5ab` |
| The Space Game: Missions | [3f7c5f17-19df-30d3-2deb-a6c1b7252af3-1631483066872.zip](https://download.unstable.life/gib-roms/Games/3f7c5f17-19df-30d3-2deb-a6c1b7252af3-1631483066872.zip) | `937d1e37774f82a1968f122e21d715e78988eac8579902cffb2c185da12b36b2` |

Fallbacks: the loader is on [archive.org](https://archive.org/details/thespacegame); the game
(`zones/pub/10/thespacegame.v83.swf`) and wrapper (`zones/pub/10/widget.swf`) are on the Wayback
Machine under `storage.cloud.casualcollective.com`. Missions only survives in Flashpoint.

## Run it locally

```
git clone https://github.com/br3nt/the-space-game-launcher
cd the-space-game-launcher
# unzip the data packs and copy content/storage.cloud.casualcollective.com/* into storage/
python3 -m http.server 8000
open http://localhost:8000
```

`storage/` is git-ignored. You want to end up with:

```
storage/games/thespacegame.swf
storage/games/tsgmissions.swf
storage/zones/pub/10/widget.swf
storage/zones/pub/10/thespacegame.v83.swf
storage/zones/pub/10/thespacegamebg.swf        (optional, menu background)
storage/zones/pub/16/widget.swf
storage/zones/pub/16/tsgmissions.v16.swf
storage/zones/pub/stingers/ccblocks.swf        (optional, the Casual Collective intro)
```

You can also drop the zips on the page when it is served locally; it works the same as on GitHub
Pages. A static server is required either way: service workers do not run from `file://`.

Files under `storage/` are converted and cached in the browser on first use, so after editing one,
click "Clear stored files" on the page to pick up the change. Saved progress lives in a separate
cache and survives that.

## How it works

1. Loader → `POST widget.casualcollective.com/load` → `zone=pub&w1=<widget url>&w2=<api base>`.
2. Loader loads `w1&wcc=w2&gid=10&rid=…`.
3. Widget → `POST <wcc>/pub/session/setup?gid=10` → JSON. `result` must be `1`;
   `swfs.base + swfs.game + ".v" + swfs.gamev + ".swf"` is the game URL; `cls` is the player class
   (2 = member, which enables the members-only content); `pd` is saved player data (`k=v,k=v`).
4. Widget → `POST session/start`, `session/levelStart`, then loads the stinger, splash and game.
5. Handshake: the game sets `hss = random(9999999)`; the widget calls
   `game.CCHandshake((hss/11 - int(hss/11)) + hss % 11)`; on success it calls `game.CCSetup()` and
   injects `game.CCAPI`.

`sw.js` intercepts `<scope>cc/<host>/<path>` (the page tells Ruffle to rewrite the
`*.casualcollective.com` hostnames to that) and serves the SWFs from the browser's Cache Storage
or from `./storage/`, converting compressed SWFs to uncompressed on the way: the widget's preloader
waits for `getBytesLoaded() == getBytesTotal()`, which Ruffle only satisfies for an uncompressed
child SWF.

The same widget served every Casual Collective game (Desktop TD Pro, Buggle Stars, Desktop Armada,
Flash Element TD 2, …). `sw.js` carries their ids and versions from Flashpoint's reconstructed
`setup.php`, untested. Given their files, they should launch the same way.

The story of working this out is on [Brent's blog](https://br3nt.github.io/).

## Credits

The games are by David Scott and The Casual Collective, audio by Somatone. Preservation by
[Flashpoint Archive](https://flashpointarchive.org/) and the Internet Archive. Flash emulation by
[Ruffle](https://ruffle.rs/); decompilation with [JPEXS](https://github.com/jindrapetrik/jpexs-decompiler).
Launcher by Brent Jacobs with Claude (Anthropic Fable 5.1), September 2026. MIT licence for the
launcher code only; it grants nothing over the games.
