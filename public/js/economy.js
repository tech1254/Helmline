// Reactive market: each port has a base price per good. Trading pushes the price
// (buying raises it, selling lowers it) and that pressure fades over weeks.
// Prices also wander slowly on their own, so old information goes stale.

// spoil: share of the cargo lost per day at sea (faster in the tropics). 0 = keeps forever.
export const GOODS = [
  { id: 'wine', name: 'Wine', unit: 'casks', one: 'cask', spoil: 0.006, rot: 'turned to vinegar' },
  { id: 'cloth', name: 'Wool cloth', unit: 'bolts', one: 'bolt', spoil: 0.001, rot: 'mildewed' },
  { id: 'sugar', name: 'Sugar', unit: 'chests', one: 'chest', spoil: 0.002, rot: 'spoiled in the damp' },
  { id: 'dye', name: 'Orchil dye', unit: 'sacks', one: 'sack', spoil: 0.004, rot: 'rotted' },
  { id: 'gold', name: 'Gold dust', unit: 'pouches', one: 'pouch', spoil: 0, rot: '' },
  { id: 'ivory', name: 'Ivory', unit: 'tusks', one: 'tusk', spoil: 0, rot: '' },
  { id: 'pepper', name: 'Melegueta pepper', unit: 'sacks', one: 'sack', spoil: 0.003, rot: 'gone musty' },
  { id: 'wheat', name: 'Wheat', unit: 'sacks', one: 'sack', spoil: 0.002, rot: 'gone mouldy' },
  { id: 'salt', name: 'Salt', unit: 'sacks', one: 'sack', spoil: 0.001, rot: 'dissolved in the damp' },
  { id: 'alquices', name: 'Moorish cloth', unit: 'bales', one: 'bale', spoil: 0.001, rot: 'mildewed' },
  { id: 'copper', name: 'Copper', unit: 'bars', one: 'bar', spoil: 0, rot: '' },
  { id: 'brazilwood', name: 'Brazilwood', unit: 'logs', one: 'log', spoil: 0.001, rot: 'rotted' },
  { id: 'spices', name: 'Indian spices', unit: 'quintals', one: 'quintal', spoil: 0.002, rot: 'lost their savour' },
];
// Wheat from Morocco fed Portugal, Madeira and the Ceuta garrison; salt from the pans of Cádiz
// and Setúbal was prized all down the African coast; Moorish cloth (alquicés) bought at Safi was
// what the factors at Arguin traded for gold.

// Copper bars from Flanders were what the Kongo and Malabar wanted; brazilwood was the red dye
// that gave Brazil its name; and pepper, cinnamon and cloves from Calicut were the prize of it all.

export const PORTUGUESE_PORTS = ['lisbon', 'porto', 'lagos', 'funchal', 'ceuta', 'saotome'];

// [base price, sold here?]. Every port buys every good; only some sell.
const MARKETS = {
  lisbon:    { k: 0.012, p: { wine: [9, 1], cloth: [11, 1], sugar: [26], dye: [24], gold: [120], ivory: [54], pepper: [44], wheat: [14], salt: [4, 1], alquices: [14], copper: [16, 1], brazilwood: [30], spices: [110] } },
  porto:     { k: 0.02, p: { wine: [7, 1], cloth: [12, 1], sugar: [28], dye: [26], gold: [118], ivory: [52], pepper: [46], wheat: [12], salt: [7], alquices: [15], copper: [18], brazilwood: [32], spices: [105] } },
  lagos:     { k: 0.02, p: { wine: [8, 1], cloth: [12, 1], sugar: [24], dye: [22], gold: [110], ivory: [46], pepper: [38], wheat: [13], salt: [5], alquices: [14], copper: [18], brazilwood: [28], spices: [100] } },
  cadiz:     { k: 0.015, p: { wine: [9, 1], cloth: [13], sugar: [28], dye: [25], gold: [125], ivory: [56], pepper: [46], wheat: [13], salt: [3, 1], alquices: [15], copper: [18], brazilwood: [31], spices: [118] } },
  ceuta:     { k: 0.035, p: { wine: [16], cloth: [18], sugar: [24], dye: [22], gold: [105], ivory: [44], pepper: [40], wheat: [18], salt: [6], alquices: [14], copper: [22], brazilwood: [24], spices: [95] } },
  safi:      { k: 0.03, p: { wine: [18], cloth: [20], sugar: [20], dye: [16], gold: [90], ivory: [40], pepper: [32], wheat: [6, 1], salt: [6], alquices: [10, 1], copper: [26], brazilwood: [22], spices: [90] } },
  funchal:   { k: 0.03, p: { wine: [16], cloth: [18], sugar: [11, 1], dye: [20], gold: [100], ivory: [40], pepper: [34], wheat: [15], salt: [8], alquices: [15], copper: [22], brazilwood: [22], spices: [100] } },
  lanzarote: { k: 0.035, p: { wine: [17], cloth: [19], sugar: [18], dye: [9, 1], gold: [95], ivory: [38], pepper: [30], wheat: [15], salt: [7], alquices: [16], copper: [24], brazilwood: [20], spices: [85] } },
  arguin:    { k: 0.03, p: { wine: [22], cloth: [26], sugar: [20], dye: [16], gold: [68, 1], ivory: [34], pepper: [26], wheat: [16], salt: [10], alquices: [26], copper: [30], brazilwood: [18], spices: [70] } },
  gambia:    { k: 0.03, p: { wine: [25], cloth: [30], sugar: [22], dye: [18], gold: [78, 1], ivory: [18, 1], pepper: [12, 1], wheat: [14], salt: [18], alquices: [24], copper: [32], brazilwood: [16], spices: [60] } },
  serraleoa: { k: 0.03, p: { wine: [24], cloth: [31], sugar: [23], dye: [19], gold: [85], ivory: [15, 1], pepper: [11, 1], wheat: [14], salt: [20], alquices: [22], copper: [30], brazilwood: [16], spices: [60] } },
  cestos:    { k: 0.035, p: { wine: [26], cloth: [32], sugar: [24], dye: [20], gold: [90], ivory: [24], pepper: [7, 1], wheat: [14], salt: [20], alquices: [22], copper: [30], brazilwood: [16], spices: [60] } },
  mina:      { k: 0.025, p: { wine: [30], cloth: [40], sugar: [26], dye: [22], gold: [52, 1], ivory: [21, 1], pepper: [16], wheat: [16], salt: [22], alquices: [30], copper: [36], brazilwood: [16], spices: [70] } },
  // Upriver on the Gambia: gold and ivory straight from the caravans, and salt worth its weight.
  // Beyond the Gulf of Guinea, open to Portuguese ships as history reaches them (world.js PORTS `from`).
  mpinda:    { k: 0.03, p: { wine: [28], cloth: [38], sugar: [26], dye: [9, 1], gold: [92], ivory: [14, 1], pepper: [18], wheat: [16], salt: [26], alquices: [30], copper: [10, 1], brazilwood: [18], spices: [70] } },
  saotome:   { k: 0.035, p: { wine: [24], cloth: [30], sugar: [9, 1], dye: [20], gold: [88], ivory: [26], pepper: [15, 1], wheat: [22], salt: [18], alquices: [26], copper: [26], brazilwood: [18], spices: [75] } },
  saobras:   { k: 0.06, p: { wine: [30], cloth: [30], sugar: [28], dye: [24], gold: [90], ivory: [17, 1], pepper: [24], wheat: [20], salt: [22], alquices: [28], copper: [28], brazilwood: [20], spices: [80] } },
  portoseguro: { k: 0.04, p: { wine: [30], cloth: [34], sugar: [20], dye: [20], gold: [95], ivory: [30], pepper: [30], wheat: [18], salt: [20], alquices: [28], copper: [26], brazilwood: [5, 1], spices: [90] } },
  // Calicut, beyond the chart: pepper and spices for gold, copper and good cloth.
  calicut:   { k: 0.01, p: { wine: [40], cloth: [34], sugar: [30], dye: [20], gold: [150], ivory: [45], pepper: [12], wheat: [20], salt: [12], alquices: [20], copper: [42], brazilwood: [25], spices: [18, 1] } },
  cantor:    { k: 0.03, p: { wine: [28], cloth: [36], sugar: [24], dye: [20], gold: [58, 1], ivory: [13, 1], pepper: [14], wheat: [16], salt: [30], alquices: [32], copper: [34], brazilwood: [16], spices: [60] } },
};

const GOLD_K = 1.6; // gold is scarce: each pouch moves the price more
const SPICE_K = 0.35; // all Europe wants spices: a cargo moves the price far less than other goods
// Thin markets: every load moves the price half as far again as it first did, so dumping a full
// hold in one port costs dear (economy change B, 27 Oct 2026; see tests/sim/economy_sim.mjs).
const DEPTH = 1.5;
const SPREAD = 0.07;
const PRESSURE_DAYS = 30; // how long the effect of a trade lingers
const DRIFT_DAYS = 60;
const DRIFT_VOL = 0.045;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Market {
  constructor(saved) {
    this.press = {};
    this.drift = {};
    this.effects = {}; // event multipliers: effects[port][good]
    this.closedPorts = new Set(); // ports closed by an event
    this.edge = {}; // standing bonus per port: better prices for a trusted captain
    for (const port of Object.keys(MARKETS)) {
      this.press[port] = {};
      this.drift[port] = {};
      for (const g of GOODS) {
        this.press[port][g.id] = saved?.press?.[port]?.[g.id] ?? 0;
        this.drift[port][g.id] = saved?.drift?.[port]?.[g.id] ?? gauss() * 0.06;
      }
    }
  }

  toJSON() {
    return { press: this.press, drift: this.drift };
  }

  sells(port, good) {
    return !!MARKETS[port].p[good][1];
  }

  // `scale[port]`: how a port's size changes its depth (ports.js; 1 in 1451, less as it grows).
  k(port, good) {
    return MARKETS[port].k * DEPTH * (good === 'gold' ? GOLD_K : good === 'spices' ? SPICE_K : 1) * (this.scale?.[port] ?? 1);
  }

  basePrice(port, good) {
    return MARKETS[port].p[good][0];
  }

  mid(port, good) {
    const base = MARKETS[port].p[good][0];
    const ev = this.effects[port]?.[good] ?? 1;
    return base * ev * Math.exp(this.drift[port][good] - this.k(port, good) * this.press[port][good]);
  }

  closed(port) {
    return this.closedPorts.has(port);
  }

  buyPrice(port, good) {
    return Math.max(1, Math.round(this.mid(port, good) * (1 + SPREAD) * (1 - (this.edge[port] || 0))));
  }

  sellPrice(port, good) {
    return Math.max(1, Math.round(this.mid(port, good) * (1 - SPREAD) * (1 + (this.edge[port] || 0))));
  }

  // Buy up to n units, limited by purse and free hold space. Each unit costs a bit more.
  buy(port, good, n, purse, free) {
    let bought = 0, cost = 0;
    if (!this.sells(port, good)) return { bought, cost };
    while (bought < n && bought < free) {
      const price = this.buyPrice(port, good);
      if (cost + price > purse) break;
      cost += price;
      this.press[port][good] -= 0.5; // producers have deep stocks
      bought++;
    }
    this.vol = this.vol || {};
    this.vol[port] = (this.vol[port] || 0) + bought; // units traded, for the port's growth (ports.js)
    return { bought, cost };
  }

  sell(port, good, n) {
    let sold = 0, income = 0;
    while (sold < n) {
      income += this.sellPrice(port, good);
      this.press[port][good] += 1;
      sold++;
    }
    this.vol = this.vol || {};
    this.vol[port] = (this.vol[port] || 0) + sold;
    return { sold, income };
  }

  tick(days) {
    const decay = Math.exp(-days / PRESSURE_DAYS);
    const pull = days / DRIFT_DAYS;
    const vol = DRIFT_VOL * Math.sqrt(days);
    for (const port of Object.keys(MARKETS)) {
      for (const g of GOODS) {
        this.press[port][g.id] *= decay;
        const d = this.drift[port][g.id];
        this.drift[port][g.id] = Math.max(-0.4, Math.min(0.4, d - d * pull + gauss() * vol));
      }
    }
  }

  // Snapshot of what a captain in port can see today.
  observe(port) {
    const prices = {};
    for (const g of GOODS) {
      prices[g.id] = {
        buy: this.sells(port, g.id) ? this.buyPrice(port, g.id) : null,
        sell: this.sellPrice(port, g.id),
      };
    }
    return prices;
  }
}
