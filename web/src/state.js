/**
 * Reactive state store. All modules read from here and call setState() to update.
 * Listeners are notified only when relevant slices change.
 */

export const DEPTH_LEVELS = [
  { label: 'ЯДРО',       min: 4,  edgeMin: 6  },
  { label: 'ОСНОВНОЕ',   min: 2,  edgeMin: 3  },
  { label: 'РАЗВЁРНУТО', min: 1,  edgeMin: 2  },
  { label: 'ДЕТАЛЬНО',   min: 1,  edgeMin: 1  },
  { label: 'ВСЁ',        min: 0,  edgeMin: 0  },
];

const state = {
  depthLevel: 1,         // index into DEPTH_LEVELS
  activeTypes: null,     // Set<string> — null means all
  searchQuery: '',
  selectedId: null,       // entity shown in the side panel
  wikiId: null,           // entity shown in the fullscreen wiki overlay
  activeYear: null,
  activeSongId: null,
  zoomTarget: null,      // { x, y, scale } for programmatic zoom
};

const listeners = new Map(); // key -> Set of callbacks

export function getState() {
  return { ...state };
}

export function setState(patch) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) {
      state[k] = v;
      changed.push(k);
    }
  }
  if (changed.length === 0) return;

  // Notify wildcard listeners
  (listeners.get('*') || new Set()).forEach(fn => fn(state, changed));
  // Notify key-specific listeners
  changed.forEach(k => {
    (listeners.get(k) || new Set()).forEach(fn => fn(state[k], state));
  });
}

export function subscribe(keyOrKeys, fn) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  keys.forEach(k => {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(fn);
  });
  return () => keys.forEach(k => listeners.get(k)?.delete(fn));
}
