/**
 * D3 force simulation + node/edge rendering.
 */

import * as d3 from 'd3';
import { zones, types, entities, edges, entityMap, adjacency, songs, endId } from './data.js';
import { getState, setState, subscribe, DEPTH_LEVELS } from './state.js';
import { scheduleHullUpdate } from './zones.js';
import { entityPath } from './router.js';

let svg, zoomLayer, linksLayer, nodesLayer;
let simulation, linkEls, nodeEls;
let currentNodes = [], currentEdges = [];
let zoomBehavior;
const nodePositions = {}; // id -> {x,y} — persisted across rebuilds

export function initGraph(svgEl, sharedZoomLayer, onZoomChange) {
  svg = d3.select(svgEl);
  zoomLayer = sharedZoomLayer;

  linksLayer = zoomLayer.append('g').attr('class', 'links');
  nodesLayer = zoomLayer.append('g').attr('class', 'nodes');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.08, 6])
    .on('zoom', e => {
      zoomLayer.attr('transform', e.transform);
      onZoomChange?.(e.transform);
      // Show/hide labels based on zoom level
      if (nodeEls) {
        nodeEls.select('text')
          .attr('opacity', e.transform.k > 0.8 ? 1 : 0);
      }
    });

  svg.call(zoomBehavior)
    .on('click', e => { if (e.target === svgEl) setState({ selectedId: null }); });

  // Subscribe to state changes that require graph rebuild
  subscribe(['depthLevel', 'activeTypes', 'searchQuery', 'activeYear', 'activeSongId'], () => {
    rebuildGraph();
  });

  subscribe('selectedId', (id) => {
    applySelection(id);
  });

  subscribe('zoomTarget', (target) => {
    if (target?.zone) flyToZone(target.zone);
  });
}

function dims() {
  const el = document.getElementById('universe');
  return { w: el.clientWidth, h: el.clientHeight };
}

function edgeKey(e) {
  return `${endId(e.source)}||${endId(e.target)}`;
}

function getVisibleIds() {
  const { depthLevel, activeTypes, searchQuery, activeYear, activeSongId } = getState();
  const { min } = DEPTH_LEVELS[depthLevel];

  let ids = entities
    .filter(e => e.song_count >= min && (!activeTypes || activeTypes.has(e.type)))
    .map(e => e.id);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ids = ids.filter(id => {
      const e = entityMap[id];
      return e.name.toLowerCase().includes(q) ||
             (e.description || '').toLowerCase().includes(q);
    });
  }

  if (activeSongId) {
    const song = songs.find(s => s.id === activeSongId);
    if (song) {
      const songSet = new Set(song.entities);
      ids = ids.filter(id => songSet.has(id));
    }
  } else if (activeYear !== null) {
    const ySet = new Set(
      songs.filter(s => s.year === activeYear).flatMap(s => s.entities)
    );
    ids = ids.filter(id => ySet.has(id));
  }

  return new Set(ids);
}

export function rebuildGraph() {
  if (simulation) simulation.stop();

  const { w, h } = dims();
  const { depthLevel } = getState();
  const { edgeMin } = DEPTH_LEVELS[depthLevel];
  const visibleIds = getVisibleIds();

  // Preserve existing positions
  if (currentNodes.length) {
    currentNodes.forEach(n => {
      if (n.x != null) nodePositions[n.id] = { x: n.x, y: n.y };
    });
  }

  currentNodes = entities
    .filter(e => visibleIds.has(e.id))
    .map(e => {
      const saved = nodePositions[e.id];
      if (saved) return { ...e, x: saved.x, y: saved.y };
      const z = zones[e.zone] || zones['переход'];
      return {
        ...e,
        x: z.x * w + (Math.random() - 0.5) * w * 0.15,
        y: z.y * h + (Math.random() - 0.5) * h * 0.15,
      };
    });

  const nodeSet = new Set(currentNodes.map(n => n.id));
  // d3.forceLink() rewrites link.source/target from ids into node objects, in place.
  // Feed it throwaway copies so the shared `edges` array keeps its string ids —
  // otherwise every rebuild after the first filters against objects and drops all links.
  currentEdges = edges
    .filter(e => e.weight >= edgeMin && nodeSet.has(endId(e.source)) && nodeSet.has(endId(e.target)))
    .map(e => ({ ...e, source: endId(e.source), target: endId(e.target) }));

  // ── Links ──
  linkEls = linksLayer.selectAll('.link')
    .data(currentEdges, edgeKey)
    .join(
      enter => enter.append('path').attr('class', 'link'),
      update => update,
      exit => exit.transition().duration(300).attr('opacity', 0).remove()
    );

  // ── Nodes ──
  nodeEls = nodesLayer.selectAll('.node')
    .data(currentNodes, d => d.id)
    .join(
      enter => {
        const g = enter.append('g')
          .attr('class', 'node')
          .attr('opacity', 0)
          .call(g => g.transition().duration(500).attr('opacity', 1));

        g.append('circle').attr('class', 'node-pulse');
        g.append('circle').attr('class', 'node-core');
        g.append('text').attr('class', 'node-label');
        return g;
      },
      update => update,
      exit => exit.transition().duration(300).attr('opacity', 0).remove()
    )
    .call(d3.drag()
      .on('start', (e, d) => {
        if (!e.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => {
        if (!e.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    )
    .on('click', (e, d) => {
      e.stopPropagation();
      window.location.hash = entityPath(d.id).slice(1); // set hash → router → setState
    });

  nodeEls.select('.node-core')
    .attr('r', d => nodeR(d))
    .attr('fill', d => types[d.type]?.color ?? '#888');

  // Pulse ring (animated via CSS)
  nodeEls.select('.node-pulse')
    .attr('r', d => nodeR(d) + 2)
    .attr('fill', 'none')
    .attr('stroke', d => types[d.type]?.color ?? '#888')
    .attr('stroke-width', 0.8)
    .attr('stroke-opacity', 0)
    .attr('class', d => `node-pulse pulse-${d.type}`);

  nodeEls.select('.node-label')
    .text(d => d.name)
    .attr('y', d => nodeR(d) + 4)
    .attr('text-anchor', 'middle')
    .attr('font-family', "'Cascadia Code', Consolas, 'SF Mono', ui-monospace, Menlo, monospace")
    .attr('font-size', 10)
    .attr('fill', 'rgba(255,255,255,0.55)')
    .attr('pointer-events', 'none');

  // ── Simulation ──
  simulation = d3.forceSimulation(currentNodes)
    .force('link', d3.forceLink(currentEdges).id(d => d.id).distance(75).strength(0.25))
    .force('charge', d3.forceManyBody().strength(d => -90 - nodeR(d) * 8))
    .force('collision', d3.forceCollide(d => nodeR(d) + 7))
    .force('zone', zoneForce(w, h, 0.2))
    .on('tick', ticked)
    .on('end', () => {
      // After settling, update zone hulls
      const { w: ww, h: hh } = dims();
      scheduleHullUpdate(getNodesByZone, ww, hh, 0);
    });

  // Update status
  updateStatus();

  // Apply current selection
  applySelection(getState().selectedId);

  // Schedule hull update during simulation too
  scheduleHullUpdate(getNodesByZone, w, h, 1500);
}

function zoneForce(w, h, strength) {
  return alpha => {
    currentNodes.forEach(n => {
      const z = zones[n.zone] || zones['переход'];
      n.vx += (z.x * w - n.x) * strength * alpha;
      n.vy += (z.y * h - n.y) * strength * alpha;
    });
  };
}

function ticked() {
  if (linkEls) {
    linkEls.attr('d', d => {
      const sx = d.source.x ?? 0, sy = d.source.y ?? 0;
      const tx = d.target.x ?? 0, ty = d.target.y ?? 0;
      const mx = (sx + tx) / 2 + (ty - sy) * 0.12;
      const my = (sy + ty) / 2 - (tx - sx) * 0.12;
      return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
    });
  }
  if (nodeEls) {
    nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }
}

function nodeR(d) {
  return 4 + Math.sqrt(Math.max(d.song_count || 1, 1)) * 2.2;
}

function getNodesByZone() {
  const byZone = {};
  currentNodes.forEach(n => {
    if (!byZone[n.zone]) byZone[n.zone] = [];
    byZone[n.zone].push({ x: n.x, y: n.y });
  });
  return byZone;
}

function applySelection(selectedId) {
  if (!nodeEls) return;

  if (selectedId) {
    const neighbors = new Set((adjacency[selectedId] || []).map(e => e.id));

    nodeEls
      .classed('selected', d => d.id === selectedId)
      .classed('neighbor', d => neighbors.has(d.id))
      .classed('faded', d => d.id !== selectedId && !neighbors.has(d.id));

    linkEls
      .classed('highlighted', d =>
        endId(d.source) === selectedId || endId(d.target) === selectedId)
      .classed('dim', d =>
        endId(d.source) !== selectedId && endId(d.target) !== selectedId);
  } else {
    nodeEls.classed('selected', false).classed('neighbor', false).classed('faded', false);
    linkEls.classed('highlighted', false).classed('dim', false);
  }
}

function flyToZone(zoneId) {
  const z = zones[zoneId];
  if (!z) return;
  const { w, h } = dims();
  const cx = z.x * w, cy = z.y * h;
  svg.transition().duration(800).ease(d3.easeCubicInOut)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(w/2 - cx*2.5, h/2 - cy*2.5).scale(2.5));
}

export function resetZoom() {
  const { w, h } = dims();
  svg.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
}

function updateStatus() {
  const lv = DEPTH_LEVELS[getState().depthLevel];
  const left = document.getElementById('status-left');
  const right = document.getElementById('status-right');
  if (left) left.textContent = `СЛОЙ ${getState().depthLevel + 1}: ${lv.label} · ${currentNodes.length} сущностей · ${currentEdges.length} связей`;
  if (right) right.textContent = `всего ${entities.length} сущностей в архиве`;
}

export function getCurrentNodes() { return currentNodes; }
