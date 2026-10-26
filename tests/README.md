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

A test passes when it exits cleanly and every `ERRORS` line it prints is empty (no JavaScript errors on the page). Most also print what they saw, so `-v` shows whether the numbers look right.

## What they cover

| Test | What it plays through |
| --- | --- |
| `trade_and_voyage` | Market and Price book tabs, trade confirmations, voyage confirmation and estimate |
| `controls` | Keyboard shortcuts, waiting in port, cloud and help panels, corsair and time-away dialogs |
| `contract_unlock` | Prince Henry's first contract at 500 cz, kept across a reload |
| `contracts` | Generated contracts at every port, refills, ship limits by standing |
| `fleet_routes` | A six-stop route with buy and sell orders, run for 320 days |
| `corsairs` | Run, fight and pay, hull damage and repairs |
| `time_away` | 8 to 30 hours away: catch-up, deadlines, straying captains, fading standing |
| `harbourmaster`, `harbourmaster_south` | Suggested runs net of wages and spoilage; ledger speed with all nine ports |
| `ledger`, `ledger_reports` | The books balance; captains' accounts arrive at ports on their routes |
| `notices` | Pop-up timing, tap to close, the feed and unread count, on desktop and phone |
| `sail_list` | The Sail to… list opens quickly |
| `old_save` | A save from before events and the fleet still loads |
| `phone` | Phone layout |
| `cloud_two_devices` | Cloud save on one device, load on another, conflicts |

The debug hooks the tests use (`window.helmline.dockAt`, `advance`, `away`, `accounts`, `encounter`) are defined at the bottom of `public/js/main.js`.
