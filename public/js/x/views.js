// The expansions' screens (x/index.js lists their rules). A view module exports a default
// object, every field optional:
//   id               'colonies'
//   init()           once, at start (event listeners and the like)
//   portBox(pid)     html for the port panel
//   houseBox()       html for the house panel
//   click(t)         a click on an element t: true if it was this expansion's
//   onDock(pid)      you make port (after the rules' onDock messages are reported)
//   draw()           draw on the chart (after the rival houses' ships)

// The expansions, one line each, a blank line between them so that branches merge cleanly.
// Uncomment a line to turn an expansion on (its branch does).
export const VIEWS = [];

// import colonies from './coloniesview.js'; VIEWS.push(colonies);

// import heir from './heirview.js'; VIEWS.push(heir);

// import silver from './silverview.js'; VIEWS.push(silver);

// import cod from './codview.js'; VIEWS.push(cod);

// import india from './indiaview.js'; VIEWS.push(india);

