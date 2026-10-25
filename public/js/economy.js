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
];

export const PORTUGUESE_PORTS = ['lisbon', 'lagos', 'funchal'];

// [base price, sold here?]. Every port buys every good; only some sell.
const MARKETS = {
  lisbon:    { k: 0.012, p: { wine: [9, 1], cloth: [11, 1], sugar: [26], dye: [24], gold: [120], ivory: [54], pepper: [44] } },
  lagos:     { k: 0.02,  p: { wine: [8, 1], cloth: [12, 1], sugar: [24], dye: [22], gold: [110], ivory: [46], pepper: [38] } },
  funchal:   { k: 0.03,  p: { wine: [16], cloth: [18], sugar: [11, 1], dye: [20], gold: [100], ivory: [40], pepper: [34] } },
  lanzarote: { k: 0.035, p: { wine: [17], cloth: [19], sugar: [18], dye: [9, 1], gold: [95], ivory: [38], pepper: [30] } },
  arguin:    { k: 0.03,  p: { wine: [22], cloth: [26], sugar: [20], dye: [16], gold: [68, 1], ivory: [34], pepper: [26] } },
  gambia:    { k: 0.03,  p: { wine: [25], cloth: [30], sugar: [22], dye: [18], gold: [78, 1], ivory: [18, 1], pepper: [12, 1] } },
};

const GOLD_K = 1.6; // gold is scarce: each pouch moves the price more
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

  k(port, good) {
    return MARKETS[port].k * (good === 'gold' ? GOLD_K : 1);
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
    return { bought, cost };
  }

  sell(port, good, n) {
    let sold = 0, income = 0;
    while (sold < n) {
      income += this.sellPrice(port, good);
      this.press[port][good] += 1;
      sold++;
    }
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
