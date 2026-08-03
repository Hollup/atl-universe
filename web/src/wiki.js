/**
 * Full-screen entity wiki overlay.
 * Triggered by #/entity/{id} route.
 * Shows: metadata, ego-graph (mini D3 force), all appearances with excerpts,
 * related entities beyond direct connections.
 */

import * as d3 from 'd3';
import { zones, types, entities, edges, entityMap, adjacency, songs, endId } from './data.js';
import { subscribe, getState } from './state.js';
import { entityPath, wikiPath } from './router.js';

let overlayEl, egoSvg, egoSim;

// Closing the wiki drops back to the entity's panel view, not all the way to the map.
function dismiss() {
  const id = getState().wikiId;
  window.location.hash = id ? entityPath(id).slice(1) : '/';
}

export function initWiki() {
  overlayEl = document.getElementById('wiki-overlay');
  document.getElementById('wiki-close').addEventListener('click', dismiss);
  document.getElementById('wiki-back').addEventListener('click', () => {
    history.back();
  });

  // Close on backdrop click
  overlayEl.addEventListener('click', e => {
    if (e.target === overlayEl) dismiss();
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) dismiss();
  });

  // The overlay is driven purely by the #/wiki/{id} route; the side panel
  // listens to selectedId separately, so the two no longer fight over one route.
  subscribe('wikiId', (id) => {
    if (id) openWiki(id);
    else closeWiki();
  });
}

export function openWiki(id) {
  const entity = entityMap[id];
  if (!entity) return;

  const meta = types[entity.type];
  const zoneData = zones[entity.zone];

  // Header
  document.getElementById('wiki-type').textContent = meta?.label ?? entity.type;
  document.getElementById('wiki-type').style.color  = meta?.color ?? '#888';
  document.getElementById('wiki-name').textContent  = entity.name;

  const years = entity.first_year
    ? `${entity.first_year}${entity.last_year !== entity.first_year ? '–'+entity.last_year : ''}`
    : '';
  document.getElementById('wiki-meta').textContent =
    [zoneData?.name, entity.realm, years].filter(Boolean).join(' · ');

  document.getElementById('wiki-desc').textContent = entity.description || '';

  // Origin
  const originEl   = document.getElementById('wiki-origin-text');
  const originWrap = document.getElementById('wiki-origin-wrap');
  originEl.textContent = entity.origin || '';
  originWrap.style.display = entity.origin ? '' : 'none';

  // Ego graph
  buildEgoGraph(id, meta?.color ?? '#888');

  // Appearances
  buildAppearances(id);

  // Related entities (2nd-degree connections)
  buildRelated(id);

  overlayEl.classList.add('open');
}

function closeWiki() {
  overlayEl.classList.remove('open');
  if (egoSim) egoSim.stop();
}

function buildEgoGraph(centerId, centerColor) {
  const container = document.getElementById('wiki-ego');
  container.innerHTML = '';

  const w = container.clientWidth || 300;
  const h = container.clientHeight || 280;

  const nbrs = (adjacency[centerId] || [])
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 14); // max 14 neighbors

  const nodeIds = [centerId, ...nbrs.map(n => n.id)];
  const nodeData = nodeIds.map(id => ({ ...entityMap[id], isCenter: id === centerId }));

  const edgeData = nbrs.map(n => ({
    source: centerId,
    target: n.id,
    weight: n.weight,
  }));

  // Also add edges between neighbors — as copies, so this ego simulation
  // never mutates the shared `edges` array the main graph reads from.
  const nbrSet = new Set(nbrs.map(n => n.id));
  edges.forEach(e => {
    const s = endId(e.source), t = endId(e.target);
    if (nbrSet.has(s) && nbrSet.has(t)) {
      edgeData.push({ ...e, source: s, target: t });
    }
  });

  const svg = d3.select(container).append('svg')
    .attr('width', w).attr('height', h);

  const linkEl = svg.append('g').selectAll('line')
    .data(edgeData)
    .join('line')
    .attr('stroke', 'rgba(255,255,255,0.12)')
    .attr('stroke-width', d => Math.min(d.weight * 0.4, 2));

  const nodeEl = svg.append('g').selectAll('g')
    .data(nodeData)
    .join('g')
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      // Stay inside the wiki when hopping between connected entities.
      window.location.hash = wikiPath(d.id).slice(1);
    });

  nodeEl.append('circle')
    .attr('r', d => d.isCenter ? 10 : 4 + Math.sqrt(Math.max(d.song_count || 1, 1)) * 1.6)
    .attr('fill', d => d.isCenter ? centerColor : (types[d.type]?.color ?? '#888'))
    .attr('filter', d => d.isCenter ? 'url(#glow)' : null);

  nodeEl.append('text')
    .text(d => d.name)
    .attr('font-family', "'Courier New', monospace")
    .attr('font-size', d => d.isCenter ? 10 : 8)
    .attr('fill', 'rgba(255,255,255,0.65)')
    .attr('text-anchor', 'middle')
    .attr('y', d => (d.isCenter ? 10 : 4 + Math.sqrt(Math.max(d.song_count || 1, 1)) * 1.6) + 11)
    .attr('pointer-events', 'none');

  egoSim = d3.forceSimulation(nodeData)
    .force('link', d3.forceLink(edgeData).id(d => d.id).distance(55).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide(d => d.isCenter ? 14 : 8))
    .on('tick', () => {
      linkEl
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeEl.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

function buildAppearances(id) {
  const entity = entityMap[id];
  const container = document.getElementById('wiki-appearances');
  container.innerHTML = '';

  const apps = (entity.appearances || [])
    .sort((a, b) => (a.year || 9999) - (b.year || 9999));

  if (!apps.length) {
    container.innerHTML = '<div class="empty">Нет цитат</div>';
    return;
  }

  apps.forEach(ap => {
    const div = document.createElement('div');
    div.className = 'wiki-ap';
    div.innerHTML = `
      <div class="wiki-ap-header">
        <span class="wiki-ap-song">${ap.song}</span>
        <span class="wiki-ap-year">${ap.album}${ap.year ? ' · ' + ap.year : ''}</span>
      </div>
      ${ap.excerpt ? `<div class="wiki-ap-quote">«${highlightName(ap.excerpt, entity.name)}»</div>` : ''}
    `;
    container.appendChild(div);
  });
}

function buildRelated(id) {
  const container = document.getElementById('wiki-related');
  container.innerHTML = '';

  // 2nd-degree: entities that share songs with this entity but aren't direct neighbors
  const directNbrs = new Set((adjacency[id] || []).map(n => n.id));
  const coScore = {};

  songs.forEach(s => {
    if (!s.entities.includes(id)) return;
    s.entities.forEach(eid => {
      if (eid !== id && !directNbrs.has(eid)) {
        coScore[eid] = (coScore[eid] || 0) + 1;
      }
    });
  });

  const related = Object.entries(coScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([eid]) => entityMap[eid])
    .filter(Boolean);

  if (!related.length) {
    container.innerHTML = '<div class="empty">—</div>';
    return;
  }

  related.forEach(e => {
    const span = document.createElement('span');
    span.className = 'conn-tag';
    span.style.color = types[e.type]?.color ?? '#888';
    span.style.borderColor = (types[e.type]?.color ?? '#333') + '55';
    span.textContent = e.name;
    span.addEventListener('click', () => {
      window.location.hash = wikiPath(e.id).slice(1);
    });
    container.appendChild(span);
  });
}

function highlightName(text, name) {
  if (!name || !text) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), m => `<strong>${m}</strong>`);
}
