/**
 * Right-side entity detail panel.
 * Subscribes to selectedId changes.
 */

import { zones, types, entityMap, adjacency } from './data.js';
import { subscribe, setState } from './state.js';
import { entityPath, wikiPath } from './router.js';

let panelEl;

export function initPanel() {
  panelEl = document.getElementById('panel');
  document.getElementById('panel-close').addEventListener('click', () => {
    setState({ selectedId: null });
    window.location.hash = '/';
  });

  subscribe('selectedId', (id) => {
    if (id) openPanel(id);
    else closePanel();
  });
}

function openPanel(id) {
  const entity = entityMap[id];
  if (!entity) return;

  const meta = types[entity.type];
  document.getElementById('panel-type').textContent = meta?.label ?? entity.type;
  document.getElementById('panel-type').style.color  = meta?.color ?? '#888';
  document.getElementById('panel-name').textContent  = entity.name;

  const zname = zones[entity.zone]?.name ?? entity.zone ?? '';
  const realm = entity.realm ? ` · ${entity.realm}` : '';
  const years = entity.first_year
    ? ` · ${entity.first_year}${entity.last_year !== entity.first_year ? '–'+entity.last_year : ''}`
    : '';
  document.getElementById('panel-meta').textContent = `${zname}${realm}${years}`;
  document.getElementById('panel-desc').textContent = entity.description || '';

  const body = document.getElementById('panel-body');
  body.innerHTML = '';

  if (entity.origin) {
    body.innerHTML += `
      <div class="sec">Происхождение</div>
      <div class="origin-text">${entity.origin}</div>`;
  }

  // Appearances
  const apps = (entity.appearances || [])
    .filter(a => a.excerpt)
    .sort((a, b) => (a.year || 9999) - (b.year || 9999));

  if (apps.length) {
    body.innerHTML += `<div class="sec">Появления (${apps.length})</div>`;
    apps.forEach(ap => {
      body.innerHTML += `
        <div class="ap">
          <div class="ap-song">${ap.song}</div>
          <div class="ap-year">${ap.album}${ap.year ? ' · ' + ap.year : ''}</div>
          <div class="ap-quote">«${ap.excerpt}»</div>
        </div>`;
    });
  }

  // Connections
  const nbrs = adjacency[id] || [];
  if (nbrs.length) {
    body.innerHTML += `<div class="sec">Связи (${nbrs.length})</div><div id="conn-tags"></div>`;
    const wrap = body.querySelector('#conn-tags');
    nbrs.sort((a, b) => b.weight - a.weight).forEach(({ id: nid }) => {
      const ne = entityMap[nid];
      if (!ne) return;
      const span = document.createElement('span');
      span.className = 'conn-tag';
      span.style.color = types[ne.type]?.color ?? '#888';
      span.style.borderColor = (types[ne.type]?.color ?? '#333') + '55';
      span.textContent = ne.name;
      span.addEventListener('click', () => {
        window.location.hash = entityPath(nid).slice(1);
      });
      wrap.appendChild(span);
    });
  }

  // Wiki link — distinct route from the panel, so this actually navigates
  body.innerHTML += `
    <div style="margin-top:20px">
      <a class="wiki-link" href="${wikiPath(id)}">Открыть полную страницу →</a>
    </div>`;

  panelEl.classList.add('open');
}

function closePanel() {
  panelEl.classList.remove('open');
}
