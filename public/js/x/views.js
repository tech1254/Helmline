// The expansions' screens (x/index.js lists their rules). A view module exports a default
// object, every field optional:
//   id               'colonies'
//   init()           once, at start (event listeners and the like)
//   portBox(pid)     html for the port panel
//   houseBox()       html for the house panel
//   click(t)         a click on an element t: true if it was this expansion's
//   onDock(pid)      you make port (after the rules' onDock messages are reported)
//   draw()           draw on the chart (after the rival houses' ships)

import cod from './codview.js';

export const VIEWS = [
  cod,
].filter(Boolean);
