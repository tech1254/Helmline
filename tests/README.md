# Tests

Browser tests that play the game in headless Chromium and check what happens.

## Running

```
python3 tests/run.py               # all tests
python3 tests/run.py ledger fleet  # only tests whose names contain these words
python3 tests/run.py -v            # show each test's output
```

The runner starts `mock/server.mjs`, a local stand-in for Cloudflare: it runs the real Worker (`src/worker.js`) with SQLite in place of D1 and serves `public/` as the assets, on port 8787 (set `PORT` to change it). Screenshots go to `tests/output/`, which git ignores.

Needs Python 3 with Playwright (`pip install playwright && playwright install chromium`) and Node 22.5 or later (for `node:sqlite`).

Every test except `corsairs` calms the seas (no random corsair attacks) so its clicks are not interrupted. A test passes when it exits cleanly and every `ERRORS` line it prints is empty (no JavaScript errors on the page). Most also print what they saw, so `-v` shows whether the numbers look right.

## What they cover

| Test | What it plays through |
| --- | --- |
| `trade_and_voyage` | Market and Price book tabs, trade confirmations, voyage confirmation and estimate |
| `controls` | Keyboard shortcuts, waiting in port, cloud and help panels, corsair and time-away dialogs |
| `contract_unlock` | Prince Henry's first contract at 500 cz, kept across a reload |
| `contracts` | Generated contracts at every port, refills, ship limits by standing |
| `fleet_routes` | A six-stop route with buy and sell orders, run for 320 days |
| `corsairs` | Run, fight and pay; the pause afterwards with Hold course and Turn back; hull damage and repairs |
| `time_away` | 8 to 30 hours away: catch-up, deadlines, straying captains, fading standing |
| `harbourmaster`, `harbourmaster_south` | Suggested runs net of wages and spoilage; ledger speed with all nine ports |
| `ledger`, `ledger_reports` | The books balance; captains' accounts arrive at ports on their routes |
| `notices` | Pop-up timing, tap to close, the feed and unread count, on desktop and phone |
| `sail_list` | The Sail to… list opens quickly |
| `old_save` | A save from before events and the fleet still loads |
| `phone` | Phone layout: one row at the top, the bottom bar (pause, speed, Books reopening the last tab, More), help, and a long summary that scrolls |
| `cloud_two_devices` | Cloud save on one device, load on another, conflicts |
| `feedback` | Report a bug or idea from Help; typing does not trigger shortcuts; the draft survives a reload; reports are stored with or without game details |
| `captain_prices` | Captains' price notes reach the price book only at ports on their route; the course home from Mina swings out to sea |
| `routes_file` | The ready-made routes match what the pathfinder plans |

The debug hooks the tests use (`window.helmline.dockAt`, `advance`, `away`, `accounts`, `encounter`) are defined at the bottom of `public/js/main.js`.

## Fleet simulator

`node tests/sim/fleet_sim.mjs` runs the real fleet, market and events code headless (no browser) and reports what hired captains earn over a night away (200 days), averaged over many runs: cash, cargo still aboard, sales, purchases and wages per route. Use it before changing any economy number.

```
node tests/sim/fleet_sim.mjs --days 200 --runs 60
node tests/sim/fleet_sim.mjs --k 0.75      # markets a quarter deeper
node tests/sim/fleet_sim.mjs --wage -1     # every captain 1 cz a day cheaper
```

Results on 26 October 2026, cash per ship per 200 days:

| Route (captain's navigation) | Before | Smarter loads, upkeep 1 | Plus wind-aware courses |
| --- | --- | --- | --- |
| Lisbon cloth ⇄ Gambia pepper (★★★★★) | −164 | +517 | +952 |
| Lisbon → Arguin → Lanzarote, best goods (★★★★★) | +483 | +852 | +1,550 |
| Lisbon ⇄ Lanzarote, best goods (★★★) | −124 | +121 | +298 |
| Lisbon ⇄ Gambia, best goods (★★★) | +1,255 | +1,569 | +1,401 |

`node tests/sim/passages.mjs --skill` shows passage times by navigation stars (Costa da Mina → Lisbon: 86 days at one star, 64 at five).

## Ready-made sea routes

`public/data/routes.json` holds every port-to-port route for each level of navigator skill, so the game never plans them while you play. After changing the coastline, ports, winds or pathfinder, rebuild it with `node tests/tools/build_routes.mjs` (about 20 s); `test_routes_file` fails until you do.
