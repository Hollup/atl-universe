/**
 * Loads window.ATL (injected by public/data.js) and builds indexes.
 */

export let zones, types, entities, edges, songs;
export let entityMap = {};    // id -> entity
export let adjacency = {};    // id -> [{id, weight}]
export let songMap   = {};    // id -> song
export let songsByYear = {};  // year -> song[]

/**
 * A link end is a string id until d3.forceLink() swaps in the node object.
 * Anything reading source/target off a shared edge must go through this.
 */
export function endId(end) {
  return (end && typeof end === 'object') ? end.id : end;
}

export function initData() {
  if (typeof window.ATL === 'undefined') {
    throw new Error('data.js failed to load — open via http://localhost:5173, not file://');
  }

  ({ zones, types, entities, edges, albums: songs } = window.ATL);

  entities.forEach(e => { entityMap[e.id] = e; });

  edges.forEach(e => {
    if (!adjacency[e.source]) adjacency[e.source] = [];
    if (!adjacency[e.target]) adjacency[e.target] = [];
    adjacency[e.source].push({ id: e.target, weight: e.weight });
    adjacency[e.target].push({ id: e.source, weight: e.weight });
  });

  songs.forEach(s => {
    songMap[s.id] = s;
    if (!songsByYear[s.year]) songsByYear[s.year] = [];
    songsByYear[s.year].push(s);
  });
}
