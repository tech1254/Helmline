// Ports through the century: size, market depth and berth, with no trade from the player
// (history and ordinary growth only) or with a steady trade through some ports.
//   node tests/sim/port_growth.mjs              # by decade, 1451 to 1501
//   node tests/sim/port_growth.mjs --trade 800   # plus 800 units a year through each port
import * as Ports from '../../public/js/ports.js';
import { PORTS } from '../../public/js/world.js';
import { dayOfYear } from '../../public/js/ships.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const TRADE = arg('trade', 0);
const S = { day: 0 };
Ports.ensurePorts(S);
const market = { vol: {}, closed: () => false };
const rows = [];
let news = [];
for (let year = 1451; year <= 1501; year++) {
  if ((year - 1451) % 10 === 0) rows.push([year, ...PORTS.map((p) => p.id).map((id) => S.ports[id].size)]);
  const end = dayOfYear(year + 1);
  while (S.day < end) {
    const dd = Math.min(10, end - S.day);
    if (TRADE) for (const p of PORTS) market.vol[p.id] = TRADE * dd / 365;
    S.day += dd;
    news = news.concat(Ports.grow(S, dd, market).map((m) => `${year}: ${m.log}`));
  }
}
const ids = PORTS.map((p) => p.id);
console.log(`People by decade${TRADE ? `, with ${TRADE} units a year traded through every port` : ', history only'}:`);
console.log('year  ' + ids.map((i) => i.slice(0, 8).padStart(9)).join(''));
for (const [y, ...v] of rows) console.log(`${y}  ` + v.map((n) => Math.round(n).toLocaleString('en').padStart(9)).join(''));
console.log('\nIn 1501, market depth (1 = as in 1451; lower = each unit moves the price less) and berth (m, mean):');
console.log('      ' + ids.map((i) => i.slice(0, 8).padStart(9)).join(''));
console.log('depth ' + ids.map((id) => Ports.depthScale(S, id).toFixed(2).padStart(9)).join(''));
console.log('berth ' + ids.map((id) => String(Ports.depthOf(S, id)).padStart(9)).join(''));
console.log('tier  ' + ids.map((id) => Ports.tierOf(S.ports[id].size).slice(0, 8).padStart(9)).join(''));
console.log('\nNews:\n' + news.map((n) => '  ' + n).join('\n'));
