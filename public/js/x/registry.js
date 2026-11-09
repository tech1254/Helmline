// How an expansion adds to the world: ports (with their harbours and markets), hulls, goods.
// Called at the top of an expansion's rules module, so the additions are in place before the
// game reads the tables (x/index.js is imported first, by main.js and the simulators).
// Pure rules: no browser modules.

import { PORTS, HARBOURS } from '../world.js';
import { MARKETS, GOODS } from '../economy.js';
import { START } from '../ports.js';

export function addPort(port, { harbour = null, market = null, start = null } = {}) {
  if (PORTS.some((p) => p.id === port.id)) return;
  if (harbour) HARBOURS[port.id] = harbour;
  PORTS.push(Object.assign(port, harbour || { depth: 5 }));
  if (market) {
    // every good must have a price: what the expansion leaves out, priced as a far port prices it
    for (const g of GOODS) if (!market.p[g.id]) market.p[g.id] = [Math.round((MARKETS.lisbon.p[g.id]?.[0] || 20) * 1.5)];
    MARKETS[port.id] = market;
  }
  if (start) START[port.id] = start;
}
