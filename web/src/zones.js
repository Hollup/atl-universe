/**
 * Zone nebula rendering.
 * After simulation settles, computes convex hull of each zone's nodes,
 * expands it outward, smooths with Catmull-Rom, renders as glowing blob.
 */

import * as d3 from 'd3';
import { zones } from './data.js';

let zonesLayer, defsEl;
let zoneBlobs = {}, zoneTexts = {}, zoneRings = {};
let hullUpdateTimer = null;

export function initZones(svg, zoomLayer) {
  defsEl = svg.select('defs');

  // Soft blur filter
  const softBlur = defsEl.append('filter')
    .attr('id', 'zone-blur')
    .attr('x', '-80%').attr('y', '-80%')
    .attr('width', '260%').attr('height', '260%');
  softBlur.append('feGaussianBlur').attr('stdDeviation', 50);

  // Glow filter for nodes
  const glow = defsEl.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  glow.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
  const merge = glow.append('feMerge');
  merge.append('feMergeNode').attr('in', 'blur');
  merge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Radial gradients per zone
  Object.entries(zones).forEach(([id, z]) => {
    const rg = defsEl.append('radialGradient').attr('id', `zg-${id}`)
      .attr('gradientUnits', 'userSpaceOnUse');
    rg.append('stop').attr('offset', '0%').attr('stop-color', z.color).attr('stop-opacity', 0.9);
    rg.append('stop').attr('offset', '55%').attr('stop-color', z.color).attr('stop-opacity', 0.4);
    rg.append('stop').attr('offset', '100%').attr('stop-color', z.color).attr('stop-opacity', 0);
  });

  zonesLayer = zoomLayer.insert('g', ':first-child').attr('class', 'zones-bg');

  // Create base elements per zone
  Object.entries(zones).forEach(([id, z]) => {
    // Blob (will be updated with hull path or fallback circle)
    zoneBlobs[id] = zonesLayer.append('path')
      .attr('class', `zone-blob zone-blob-${id}`)
      .attr('fill', `url(#zg-${id})`)
      .attr('filter', 'url(#zone-blur)')
      .attr('pointer-events', 'none')
      .attr('opacity', 0);

    // Inner ring
    zoneRings[id] = zonesLayer.append('circle')
      .attr('class', `zone-ring`)
      .attr('fill', 'none')
      .attr('stroke', z.color)
      .attr('stroke-width', 0.6)
      .attr('stroke-opacity', 0.2)
      .attr('stroke-dasharray', '4,8')
      .attr('pointer-events', 'none')
      .attr('opacity', 0);

    // Label
    zoneTexts[id] = zonesLayer.append('text')
      .attr('class', 'zone-label')
      .attr('text-anchor', 'middle')
      .attr('font-family', "'Courier New', monospace")
      .attr('font-size', 13)
      .attr('letter-spacing', 6)
      .attr('fill', '#fff')
      .attr('fill-opacity', 0.75)
      .attr('filter', 'url(#glow)')
      .attr('data-zone', id)
      .attr('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .attr('opacity', 0)
      .text(z.name.toUpperCase())
      .on('click', () => {
        window.location.hash = `/zone/${encodeURIComponent(id)}`;
      });
  });
}

export function drawZonesFallback(w, h) {
  // Fallback: simple circles at configured positions (used before nodes exist)
  Object.entries(zones).forEach(([id, z]) => {
    const cx = z.x * w, cy = z.y * h;
    const r  = Math.min(w, h) * 0.18;

    // Update gradient center
    defsEl.select(`#zg-${id}`)
      .attr('cx', cx).attr('cy', cy).attr('r', r * 1.5);

    zoneBlobs[id]
      .attr('d', circlePath(cx, cy, r * 1.4))
      .transition().duration(800).attr('opacity', 1);

    zoneRings[id]
      .attr('cx', cx).attr('cy', cy).attr('r', r * 0.5)
      .transition().duration(800).attr('opacity', 1);

    zoneTexts[id]
      .attr('x', cx).attr('y', cy - r * 0.55)
      .transition().duration(800).attr('opacity', 1);
  });
}

export function updateZoneHulls(nodesByZone, w, h) {
  // nodesByZone: { zoneId: [{x, y}] }
  Object.entries(zones).forEach(([id, z]) => {
    const pts = nodesByZone[id] || [];
    const cx = z.x * w, cy = z.y * h;
    const r  = Math.min(w, h) * 0.18;

    let pathD;
    if (pts.length >= 3) {
      const hull = d3.polygonHull(pts.map(n => [n.x, n.y]));
      if (hull) {
        const expanded = expandPolygon(hull, 70);
        pathD = smoothPath(expanded);
      }
    }
    if (!pathD) {
      pathD = circlePath(cx, cy, r * 1.4);
    }

    // Update gradient center to current centroid
    const centroid = pts.length ? getCentroid(pts) : { x: cx, y: cy };
    defsEl.select(`#zg-${id}`)
      .attr('cx', centroid.x).attr('cy', centroid.y)
      .attr('r', r * 2);

    zoneBlobs[id]
      .transition().duration(1200).ease(d3.easeSinInOut)
      .attr('d', pathD).attr('opacity', 1);

    zoneRings[id]
      .attr('cx', centroid.x).attr('cy', centroid.y)
      .attr('r', r * 0.45)
      .transition().duration(1200).attr('opacity', 1);

    zoneTexts[id]
      .transition().duration(1200)
      .attr('x', centroid.x)
      .attr('y', centroid.y - r * 0.55)
      .attr('opacity', 1);
  });
}

export function scheduleHullUpdate(getNodesByZone, w, h, delay = 2000) {
  clearTimeout(hullUpdateTimer);
  hullUpdateTimer = setTimeout(() => {
    updateZoneHulls(getNodesByZone(), w, h);
  }, delay);
}

// ── Geometry helpers ──

function circlePath(cx, cy, r) {
  return `M ${cx-r},${cy} a ${r},${r} 0 1,0 ${r*2},0 a ${r},${r} 0 1,0 ${-r*2},0`;
}

function expandPolygon(hull, amount) {
  // Find centroid
  let cx = 0, cy = 0;
  hull.forEach(([x, y]) => { cx += x; cy += y; });
  cx /= hull.length; cy /= hull.length;

  return hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    return [x + (dx/len) * amount, y + (dy/len) * amount];
  });
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  // Closed Catmull-Rom via D3 line with curve
  const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
  return line(pts) || '';
}

function getCentroid(nodes) {
  let x = 0, y = 0;
  nodes.forEach(n => { x += n.x; y += n.y; });
  return { x: x / nodes.length, y: y / nodes.length };
}
