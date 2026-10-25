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
- Saves to the browser (localStorage).

Not yet included: combat, navigation drift, captains and fleets, dynasty, contracts, events, server saves.

## Layout

- `public/` is served as-is by the `helmline` Cloudflare Worker (static assets, no build step).
  - `js/world.js` holds the coastlines, ports, winds and sea-route pathfinding.
  - `js/economy.js` holds goods, base prices and the market model.
  - `js/main.js` holds rendering, input, the HUD and panels, and saving.
- `wrangler.jsonc` configures the Worker. Pushes to `main` deploy through Cloudflare Workers Builds.

## Run locally

Any static server works, for example `python3 -m http.server -d public 8000`, or `npm install && npm run dev` for Wrangler.

Keyboard: space pauses, 1/2/3 set the speed, L opens the ledger, W toggles the wind arrows.


 
