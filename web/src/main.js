import * as d3 from 'd3';
import './style/main.css';
import './style/graph.css';
import './style/panel.css';
import './style/wiki.css';
import './style/timeline.css';

import { initData, zones, types } from './data.js';
import { getState, setState, DEPTH_LEVELS } from './state.js';
import { initRouter } from './router.js';
import { initGraph, rebuildGraph } from './graph.js';
import { initZones, drawZonesFallback } from './zones.js';
import { initPanel } from './panel.js';
import { initWiki } from './wiki.js';
import { initTimeline } from './timeline.js';
import { initParticleBackground } from './particles.js';

// ── Load data ──
try {
  initData();
} catch (e) {
  document.body.innerHTML = `<div style="padding:40px;font-family:monospace;color:#f55;background:#06060f;font-size:13px">${e.message}</div>`;
  throw e;
}

// ── Type filter buttons ──
const activeTypes = new Set(Object.keys(types));
setState({ activeTypes });

const filtersEl = document.getElementById('filters');
Object.entries(types).forEach(([type, meta]) => {
  const btn = document.createElement('button');
  btn.className = 'filter-btn active';
  btn.textContent = meta.label;
  btn.style.color = meta.color;
  btn.style.borderColor = meta.color;
  btn.addEventListener('click', () => {
    const cur = getState().activeTypes || new Set(Object.keys(types));
    const next = new Set(cur);
    next.has(type) ? next.delete(type) : next.add(type);
    btn.classList.toggle('active', next.has(type));
    setState({ activeTypes: next });
  });
  filtersEl.appendChild(btn);
});

// ── Depth slider ──
const depthSlider = document.getElementById('depth');
const depthVal    = document.getElementById('depth-val');

function applyDepth(v) {
  const idx = v - 1;
  depthVal.textContent = DEPTH_LEVELS[idx].label;
  setState({ depthLevel: idx });
}
depthSlider.addEventListener('input', e => applyDepth(+e.target.value));
applyDepth(2); // start at ОСНОВНОЕ

// ── Search ──
document.getElementById('search').addEventListener('input', e => {
  setState({ searchQuery: e.target.value.toLowerCase() });
});

// ── SVG setup ──
const svgEl     = document.getElementById('svg');
const svg       = d3.select(svgEl);
svg.append('defs'); // needed by zones.js

const zoomLayer = svg.append('g').attr('class', 'zoom-root');

// ── Particles (behind everything) ──
const universeEl = document.getElementById('universe');
const particles  = initParticleBackground(universeEl);

// ── Zones layer (first child of zoomLayer) ──
initZones(svg, zoomLayer);

// ── Graph (appends links + nodes layers on top of zones) ──
initGraph(svgEl, zoomLayer, (transform) => {
  particles.updateTransform(transform);
});

// ── Initial draw ──
const { w, h } = dims();
drawZonesFallback(w, h);
rebuildGraph();

// ── Panel ──
initPanel();

// ── Wiki (bound to the #/wiki/{id} route inside initWiki) ──
initWiki();

// ── Router (parses initial hash) ──
initRouter();

// ── Timeline ──
initTimeline();

// ── Resize ──
window.addEventListener('resize', () => {
  const { w, h } = dims();
  drawZonesFallback(w, h);
  rebuildGraph();
});

function dims() {
  const el = document.getElementById('universe');
  return { w: el.clientWidth, h: el.clientHeight };
}
