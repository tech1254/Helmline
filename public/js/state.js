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
  introDone: false,
  pendingSummary: null,
  pendingEncounter: null,
  offlineBuffer: null, // messages collected while catching up, shown as one summary
  ledgerWho: 'all',
  lastPushed: null, // the cloud payload last sent, so unchanged games are not re-sent
  cloudClock: 0,
};
