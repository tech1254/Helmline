// Expansions (Nov 2026). Each expansion is a module of its own in this folder: its rules in
// x/<id>.js (pure: no browser modules) and its screens in x/<id>view.js. The game calls them
// through the hooks below, so an expansion is added, removed or merged by one line in this list
// (and one in x/views.js). Its state lives in S.x[id]; its ports, routes and markets are
// registered by the expansion itself (x/registry.js).
//
// A rules module exports a default object, every field optional:
//   id              'colonies'
//   name            'Settling the New World'
//   tick(S, dd, ctx)    days pass: returns messages (as sim.js reports them). ctx: { market, atSea, away }
//   onDock(S, pid)      you make port: returns messages
//   vessels(S)          ships to show on the chart and hunt (as houses.js positions them)
//   routes              true if it ships data/routes-<id>.json (routes to its own ports)
//   ports               the ids of the ports it adds (x/registry.js addPort)
//   effects(S)          price multipliers now: { port: { good: m } }
//   closed(S)           ports closed to trade now
// Pure rules: no browser modules.

import cod from './cod.js';

export const RULES = [
  cod,
].filter(Boolean);

export const state = (S, id) => { S.x = S.x || {}; S.x[id] = S.x[id] || {}; return S.x[id]; };
export function tickAll(S, dd, ctx) { const out = []; for (const x of RULES) if (x.tick) out.push(...(x.tick(S, dd, ctx) || [])); return out; }
export function dockAll(S, pid) { const out = []; for (const x of RULES) if (x.onDock) out.push(...(x.onDock(S, pid) || [])); return out; }
export function vesselsAll(S) { const out = []; for (const x of RULES) if (x.vessels) out.push(...(x.vessels(S) || [])); return out; }
export function effectsAll(S) {
  const out = {};
  for (const x of RULES) for (const [port, goods] of Object.entries(x.effects?.(S) || {})) {
    out[port] = out[port] || {};
    for (const [g, m] of Object.entries(goods)) out[port][g] = (out[port][g] || 1) * m;
  }
  return out;
}
export const closedAll = (S) => RULES.flatMap((x) => x.closed?.(S) || []);
export const routeFiles = () => RULES.filter((x) => x.routes).map((x) => `data/routes-${x.id}.json`);
