# Helmline

An age-of-sail exploration and trade game. This is **Prototype 0**: the West African coast in the 1450s, built to test whether the core loop of sailing, discovering and trading is fun.

## What's in the prototype

- **Chart:** a portolan-style map from the Azores and Iberia down to the Gulf of Guinea. Everything outside the known coast is fogged and clears as you sail.
- **One caravel**, hold 40, about 5 knots, 3 cruzados a day in wages at sea.
- **Winds:** north-east trades in the south, northerlies off Portugal, westerlies out at sea, light south-westerlies and calms in the Gulf of Guinea. Sailing home against the trades is slow; swinging out to sea (the *volta do mar*) is usually faster.
- **Nine ports:** Lisbon, Lagos, Funchal, Lanzarote (known at the start); Arguin, the Gambia River, Serra Leoa, Rio dos Cestos (the Grain Coast) and the Costa da Mina (to be discovered).
- **Seven goods** with reactive prices: trading moves the price, and it recovers over weeks.
- **Price book:** prices you have actually seen, with their age, and route suggestions based only on that data, reckoned net of wages for the real passage and expected spoilage.
- **Ledger:** every cruzado in and out, with totals by kind. Your own dealings are entered at once; a hired captain's only when you call at a port where he has traded, so until then part of the purse is "not yet accounted for".
- **Chart rewards:** the crown pays 150 cz per new port or land group when you return to Lisbon.
- **Contracts** (from 500 cz): Prince Henry's first commission, then delivery contracts with deadlines.
- **Standing:** tiers that raise contract pay, improve prices in Portuguese ports and open the Lisbon shipyard.
- **Market events:** harvests, plagues, blockades and gluts shift prices or close ports; news reaches you in port, late for distant places.
- **Spoilage:** wine, dye, pepper, sugar and cloth slowly spoil at sea, faster in the tropics.
- **Hired ships:** buy caravels (how many depends on standing), hire captains with navigation and trade skills, and give each a route of up to six stops with buy and sell orders at each, which they run on their own.
- **Time away:** with hired captains and your ship in port, the world moves on while you are gone: a tenth of normal speed for the first 90 days, then tapering (a night or a workday is about 200 days, at most 210). Contract deadlines wait for you. Captains start to stray after 16 hours away (skimming, then going ashore) and standing fades after 24 hours. A summary greets you on return.
- **Corsairs of Barbary:** encounters off Morocco, the Algarve and the Canaries; run, fight or pay tribute. Notoriety draws more corsairs, caution fewer. Battle damage slows the ship until repaired in Lisbon, Lagos or Funchal.
- **Notices:** pop-ups stay up long enough to read (longer for longer messages), pause while hovered and close on a tap; every notice is also kept in a feed under the bell, with an unread count.
- **Wait in port**, zoom buttons, Captain's notes for the first voyages, and a How to play screen.
- Saves to the browser, and optionally to the cloud with a save code to play across devices.

Not yet included: ship-to-ship combat beyond auto-resolve, navigation drift, more than one hired ship, dynasty.

## Layout

- `src/worker.js` is the Worker: it serves `public/` and answers `/api/saves` for cloud saves, stored in the D1 database `helmline-saves` (schema in `migrations/`). Only a hash of each save code is stored.
- `public/` holds the game's static files (no build step).
  - `js/world.js` holds the coastlines, ports, winds and sea-route pathfinding.
  - `js/economy.js` holds goods, base prices and the market model.
  - `js/contracts.js` holds contracts and standing.
  - `js/events.js` holds market events and news.
  - `js/fleet.js` holds hired ships and captains.
  - `js/accounts.js` holds the ledger.
  - `js/main.js` holds rendering, input, the HUD and panels, time and saving.
- `wrangler.jsonc` configures the Worker. Pushes to `main` deploy through Cloudflare Workers Builds.

## Run locally

Any static server works, for example `python3 -m http.server -d public 8000`, or `npm install && npm run dev` for Wrangler.

Keyboard: space pauses, 1/2/3 set the speed, P opens the price book, L the ledger, N the notices, W toggles the wind arrows.


 
