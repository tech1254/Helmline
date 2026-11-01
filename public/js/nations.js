// Nations: a new voyage is begun as a house of Portugal or of Castile (the four-nations doc). The
// nation decides the home port (where ships are built and captains hired, where the crown pays for
// charts and the house is founded), which hulls its yards build and from when, the first ship's
// name, the lenders and patrons, and the story. Everything else is shared: one map, one economy.
// Pure rules: no browser here.

export const NATIONS = {
  portugal: {
    id: 'portugal', name: 'Portugal', adj: 'Portuguese', home: 'lisbon', homeName: 'Lisbon', start: 'lisbon',
    flagship: 'São Cristóvão',
    // the hulls its yards build (ships.js HULLS), with any change of year for this nation
    ladder: ['barca', 'caravel', 'barinel', 'largecaravel', 'redonda', 'urca', 'nau', 'armedcaravel', 'galeao', 'naudaindia'],
    years: {},
    known: [],
    view: [-13, 29, 0.85],
    sub: 'Lisbon, the first of March, 1451',
    blurb: 'Prince Henry\'s captains have pushed past Cape Bojador. You own a small coasting barca, the <i>São Cristóvão</i>, and a purse of 300 cruzados. Everything south of the known coast is uncharted.',
    hearsay: [['lagos', 20], ['safi', 75], ['lanzarote', 110]],
  },
  castile: {
    id: 'castile', name: 'Castile', adj: 'Castilian', home: 'seville', homeName: 'Seville', start: 'palos',
    flagship: 'Santa María de la Rábida',
    // the Andalusian caravel is the same hull as Portugal's; the square-rigged one comes later
    // to Castile; the nao vizcaína, a Basque cargo ship, from the start; the Indies ships later
    ladder: ['barca', 'caravel', 'naovizcaina', 'largecaravel', 'redonda', 'urca', 'naocarrera', 'armedcaravel', 'galeon'],
    years: { redonda: { year: 1480 }, largecaravel: { year: 1470 } },
    known: ['gomera'],
    view: [-9, 33, 0.85],
    sub: 'Palos, the first of March, 1451',
    blurb: 'Your father was a pilot of Palos, and the sea kept him. You have his barca, a debt to the Genoese of Seville, and a purse of 300 cruzados. Portugal claims the Guinea coast; Castile\'s lords hold the Canaries.',
    hearsay: [['cadiz', 15], ['lanzarote', 60], ['safi', 90]],
  },
};

export const nationOf = (S) => NATIONS[S?.nation] || NATIONS.portugal;
export const home = (S) => nationOf(S).home;
export const homeName = (S) => nationOf(S).homeName;
export const isCastile = (S) => S?.nation === 'castile';
