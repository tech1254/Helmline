# Helmline

An age-of-sail exploration and trade game. This is **Prototype 0**: the West African coast in the 1450s, built to test whether the core loop of sailing, discovering and trading is fun.

## What's in the prototype

- **Chart:** a portolan-style map from the Azores to the Gambia. Everything outside the known coast is fogged and clears as you sail.
- **One caravel**, hold 40, about 5 knots, 3 cruzados a day in wages at sea.
- **Winds:** north-east trades in the south, northerlies off Portugal, westerlies out at sea. Sailing home against the trades is slow; swinging out to sea (the *volta do mar*) is usually faster.
- **Six ports:** Lisbon, Lagos, Funchal, Lanzarote (known at the start), Arguin and the Gambia River (to be discovered).
- **Seven goods** with reactive prices: trading moves the price, and it recovers over weeks.
- **Trade ledger:** prices you have actually seen, with their age, and route suggestions based only on that data.
- **Chart rewards:** the crown pays 150 cz per new port or land group when you return to Lisbon.
- **Contracts** (from 500 cz): Prince Henry's first commission, then delivery contracts with deadlines.
- **Standing:** tiers that raise contract pay, improve prices in Portuguese ports and open the Lisbon shipyard.
- **Market events:** harvests, plagues, blockades and gluts shift prices or close ports; news reaches you in port, late for distant places.
- **Spoilage:** wine, dye, pepper, sugar and cloth slowly spoil at sea, faster in the tropics.
- **A second ship:** buy a caravel, hire a captain with navigation and trade skills, and give him a two-port route he runs on his own.
- **Corsairs of Barbary:** encounters off Morocco, the Algarve and the Canaries; run, fight or pay tribute. Notoriety draws more corsairs, caution fewer. Battle damage slows the ship until repaired in Lisbon, Lagos or Funchal.
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
  - `js/main.js` holds rendering, input, the HUD and panels, time and saving.
- `wrangler.jsonc` configures the Worker. Pushes to `main` deploy through Cloudflare Workers Builds.

## Run locally

Any static server works, for example `python3 -m http.server -d public 8000`, or `npm install && npm run dev` for Wrangler.

Keyboard: space pauses, 1/2/3 set the speed, L opens the ledger, W toggles the wind arrows.


 
