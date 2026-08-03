/**
 * Hash-based router.
 * Routes:
 *   #/                    → default view
 *   #/entity/{id}         → open entity side panel
 *   #/wiki/{id}           → open fullscreen entity wiki (panel stays behind it)
 *   #/zone/{id}           → fly to zone
 *   #/year/{year}         → filter by year
 *   #/song/{id}           → highlight song
 */

import { setState } from './state.js';

const routes = [
  { pattern: /^\/wiki\/(.+)$/,    handler: ([, id]) => setState({ wikiId: decodeURIComponent(id), selectedId: decodeURIComponent(id) }) },
  { pattern: /^\/entity\/(.+)$/,  handler: ([, id]) => setState({ wikiId: null, selectedId: decodeURIComponent(id) }) },
  { pattern: /^\/zone\/(.+)$/,    handler: ([, id]) => setState({ zoomTarget: { zone: decodeURIComponent(id) } }) },
  { pattern: /^\/year\/(\d+)$/,   handler: ([, y])  => setState({ activeYear: parseInt(y) }) },
  { pattern: /^\/song\/(.+)$/,    handler: ([, id]) => setState({ activeSongId: decodeURIComponent(id) }) },
  { pattern: /^\/?$/,             handler: ()       => setState({ wikiId: null, selectedId: null, activeYear: null, activeSongId: null, zoomTarget: null }) },
];

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  for (const { pattern, handler } of routes) {
    const m = hash.match(pattern);
    if (m) { handler(m); return; }
  }
}

export function navigate(path) {
  window.location.hash = path;
}

export function entityPath(id)  { return `#/entity/${encodeURIComponent(id)}`; }
export function wikiPath(id)    { return `#/wiki/${encodeURIComponent(id)}`; }
export function zonePath(id)    { return `#/zone/${encodeURIComponent(id)}`; }
export function yearPath(year)  { return `#/year/${year}`; }
export function songPath(id)    { return `#/song/${encodeURIComponent(id)}`; }

export function initRouter() {
  window.addEventListener('hashchange', parseHash);
  parseHash(); // handle initial hash
}
