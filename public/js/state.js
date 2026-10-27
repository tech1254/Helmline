// The game state shared by every module: the save itself (S), the market, and UI flags.

export let S; // the saved game
export let market;
export function setGame(s, m) {
  S = s;
  market = m;
}

// Interface state shared between modules (kept in one object so any module may change it).
export const ui = {
  panelMode: null, // 'port' | 'prices' | 'ledger' | 'contracts' | 'fleet' | 'sail' | 'help' | 'cloud' | 'notices' | null
  speed: 1,
  lastSpeed: 1,
  showWind: true,
  hoverPort: null,
  modal: null,
  screen: null, // the ship register or shipyard, full screen; time stands still while it is open
  hireHull: 'caravel', // the hull chosen in the Fleet tab for a new captain
  arrival: null, // the port arrival scene, while it plays
  introDone: false,
  pendingSummary: null,
  pendingEncounter: null,
  offlineBuffer: null, // messages collected while catching up, shown as one summary
  ledgerWho: 'all',
  lastPushed: null, // the cloud payload last sent, so unchanged games are not re-sent
  cloudClock: 0,
  lastBook: null, // the trading panel last open, for the Books button
  feedbackFrom: null, // the panel open before the feedback form
  feedbackResume: null, // the speed to resume when the form closes, if opening it paused the game
};
