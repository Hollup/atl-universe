/**
 * Bottom timeline: album dots + activity bars.
 * Clicking a dot filters by year; clicking song title highlights song entities.
 */

import * as d3 from 'd3';
import { entityMap, songs, songsByYear } from './data.js';
import { getState, setState, subscribe } from './state.js';

const MONO = "'Cascadia Code', Consolas, 'SF Mono', ui-monospace, Menlo, monospace";

let tlSvg, tip, hideTimer;

export function initTimeline() {
  document.getElementById('tl-reset-year').addEventListener('click', () => {
    setState({ activeYear: null, activeSongId: null });
  });
  subscribe(['activeYear', 'activeSongId'], () => buildTimeline());
  buildTimeline();
}

export function buildTimeline() {
  tlSvg = d3.select('#timeline-svg');
  tlSvg.selectAll('*').remove();

  const { activeYear } = getState();

  const resetBtn = document.getElementById('tl-reset-year');
  resetBtn.hidden = activeYear == null;
  resetBtn.textContent = activeYear == null ? '' : `× показать все годы (сейчас ${activeYear})`;

  const h = 72, pad = 20;

  // Dedupe albums
  const albumSet = {};
  songs.filter(s => s.year > 0).forEach(s => {
    const key = `${s.album}||${s.year}`;
    if (!albumSet[key]) albumSet[key] = { name: s.album, year: s.year, songs: [], entities: [] };
    albumSet[key].songs.push(s);
    s.entities.forEach(e => {
      if (!albumSet[key].entities.includes(e)) albumSet[key].entities.push(e);
    });
  });
  const albumList = Object.values(albumSet).sort((a, b) => a.year - b.year);
  const years = [...new Set(albumList.map(a => a.year))].sort((a, b) => a - b);

  const colW = 110;
  const totalW = years.length * colW + pad * 2;
  tlSvg.attr('width', totalW).attr('height', h);

  const xScale = d3.scaleLinear()
    .domain([years[0], years[years.length - 1]])
    .range([pad + colW / 2, totalW - pad - colW / 2]);

  // Baseline
  tlSvg.append('line')
    .attr('x1', pad).attr('x2', totalW - pad)
    .attr('y1', h - 22).attr('y2', h - 22)
    .attr('stroke', 'rgba(255,255,255,0.05)');

  // Activity bars
  const byYear = {};
  years.forEach(y => {
    byYear[y] = new Set(albumList.filter(a => a.year === y).flatMap(a => a.entities)).size;
  });
  const maxAct = Math.max(...Object.values(byYear));
  const barH = 32;

  tlSvg.selectAll('.act-bar').data(years).join('rect')
    .attr('class', 'act-bar')
    .attr('x', y => xScale(y) - colW * 0.38)
    .attr('width', colW * 0.76)
    .attr('y', y => h - 22 - (byYear[y] / maxAct) * barH)
    .attr('height', y => (byYear[y] / maxAct) * barH)
    .attr('fill', y => activeYear === y ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)')
    .attr('rx', 1)
    .style('cursor', 'pointer')
    .on('click', (e, y) => {
      setState({ activeYear: activeYear === y ? null : y, activeSongId: null });
    });

  // Year labels
  tlSvg.selectAll('.yr-lbl').data(years).join('text')
    .attr('class', 'yr-lbl')
    .attr('x', y => xScale(y)).attr('y', h - 6)
    .attr('text-anchor', 'middle')
    .attr('font-family', MONO).attr('font-size', 8)
    .attr('fill', y => activeYear === y ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)')
    .attr('letter-spacing', 1)
    .text(y => y);

  // Album dots
  const byYearAlbums = {};
  albumList.forEach(a => {
    if (!byYearAlbums[a.year]) byYearAlbums[a.year] = [];
    byYearAlbums[a.year].push(a);
  });
  const dotData = albumList.map(a => {
    const idx = byYearAlbums[a.year].indexOf(a);
    const tot = byYearAlbums[a.year].length;
    return { ...a, xOff: (idx - (tot - 1) / 2) * 7 };
  });

  tlSvg.selectAll('.adot').data(dotData).join('circle')
    .attr('class', 'adot')
    .attr('cx', d => xScale(d.year) + d.xOff)
    .attr('cy', h - 22)
    .attr('r', 3.5)
    .attr('fill', d => activeYear === d.year ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)')
    .attr('stroke', d => activeYear === d.year ? '#fff' : 'rgba(255,255,255,0.2)')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      const newYear = activeYear === d.year ? null : d.year;
      setState({ activeYear: newYear, activeSongId: null });
    })
    .on('mouseenter', (e, d) => {
      showTooltip(e, d);
    })
    .on('mouseleave', () => hideTip());
}

function showTooltip(e, album) {
  clearTimeout(hideTimer);
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tl-tip';
    // Keep the tooltip alive while the cursor is travelling across it —
    // otherwise leaving the 3.5px dot kills it before the song list is reachable.
    tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tip.addEventListener('mouseleave', () => hideTip());
    document.body.appendChild(tip);
  }

  const songList = album.songs.slice(0, 6).map(s =>
    `<div class="tl-tip-song" data-id="${s.id}">${s.title}</div>`
  ).join('');
  const more = album.songs.length > 6
    ? `<div class="tl-tip-more">+${album.songs.length - 6} ещё</div>` : '';

  tip.innerHTML = `
    <div class="tl-tip-name">${album.name}</div>
    <div class="tl-tip-year">${album.year}</div>
    ${songList}${more}
  `;

  // Attach song click handlers
  tip.querySelectorAll('.tl-tip-song').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.id;
      setState({ activeSongId: getState().activeSongId === sid ? null : sid });
      hideTip(0);
    });
  });

  tip.style.left  = (e.clientX + 10) + 'px';
  tip.style.top   = (e.clientY - 80) + 'px';
  tip.style.display = 'block';
}

function hideTip(delay = 260) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (tip) tip.style.display = 'none';
  }, delay);
}
