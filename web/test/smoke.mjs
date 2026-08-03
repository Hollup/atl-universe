/**
 * Headless smoke test — boots the built bundle in jsdom and drives the
 * interactions that were broken before, so they can't silently come back.
 *
 *   npm run build && npm test
 *
 * Guards, specifically:
 *   - d3.forceLink() mutating the shared `edges` array, which used to wipe out
 *     every link the first time you moved a slider or typed in search
 *   - the wiki overlay throwing on a missing element id, so no entity page opened
 *   - the panel and the wiki fighting over the same #/entity/ route
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!fs.existsSync(dist)) {
  console.error('No dist/ — run `npm run build` first.');
  process.exit(1);
}
const bundle = fs.readdirSync(path.join(dist, 'assets')).find(f => f.endsWith('.js'));

// Strip the tags jsdom would try to fetch; we eval the assets ourselves below.
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '')
  .replace(/<link[^>]*>/g, '');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const d = window.document;

const errors = [];
window.addEventListener('error', e => errors.push('window.error: ' + e.message));
process.on('uncaughtException', e => errors.push('uncaught: ' + e.message));

// ── jsdom gaps the app would otherwise trip over (not app bugs) ──
const el = d.getElementById('universe');
Object.defineProperty(el, 'clientWidth',  { value: 1400 });
Object.defineProperty(el, 'clientHeight', { value: 800 });

window.HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {}, beginPath() {}, arc() {}, fill() {}, set fillStyle(_) {},
});

// d3 drives enter/exit transitions off rAF — a no-op stub would leave exiting
// elements parked in the DOM and make every element count meaningless.
window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame  = id => clearTimeout(id);

// jsdom has no SVGAnimatedLength, which d3-zoom's defaultExtent reads.
for (const [prop, val] of [['width', 1400], ['height', 800]]) {
  Object.defineProperty(window.SVGSVGElement.prototype, prop, {
    get() { return { baseVal: { value: val } }; }, configurable: true,
  });
}

const settle = (ms = 500) => new Promise(r => setTimeout(r, ms));
let failed = 0;

function check(label, fn) {
  let ok = false;
  try { ok = !!fn(); }
  catch (e) { errors.push(`${label}: ${e.message}`); }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  return ok;
}

function load(file, label) {
  try { window.eval(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`${label}: ${e.message}`); failed++; }
}

load(path.join(dist, 'data.js'), 'data.js');
load(path.join(dist, 'assets', bundle), 'bundle boot');

const fire = (node, type) => node.dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
const input = (node, value) => {
  node.value = value;
  node.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const links = () => d.querySelectorAll('.link').length;

console.log('\n── boot ──');
check('graph rendered nodes', () => d.querySelectorAll('.node').length > 0);
check('graph rendered links', () => links() > 0);
const linksAtBoot = links();
console.log(`      ${d.querySelectorAll('.node').length} nodes, ${linksAtBoot} links`);

console.log('\n── links survive rebuilds (the regression) ──');
input(d.getElementById('depth'), '3');
await settle();
check('links survive a depth change', () => links() > 0);
console.log(`      ${links()} links at СЛОЙ 3`);

input(d.getElementById('search'), 'а');
await settle(200);
input(d.getElementById('search'), '');
await settle();
check('links survive search then clear', () => links() > 0);

input(d.getElementById('depth'), '2');
await settle();
check('links restored on return to СЛОЙ 2', () => links() === linksAtBoot);
check('shared edges kept their string ids', () => typeof window.ATL.edges[0].source === 'string');

console.log('\n── panel and wiki are separate routes ──');
fire(d.querySelector('.node'), 'click');
await settle(150);
check('node click opens the side panel', () => d.getElementById('panel').classList.contains('open'));
check('node click leaves the wiki closed', () => !d.getElementById('wiki-overlay').classList.contains('open'));

const wikiLink = d.querySelector('.wiki-link');
check('panel links out to #/wiki/', () => wikiLink?.getAttribute('href').startsWith('#/wiki/'));

if (wikiLink) {
  window.location.hash = wikiLink.getAttribute('href').slice(1);
  await settle(200);
  check('wiki overlay opens', () => d.getElementById('wiki-overlay').classList.contains('open'));
  check('wiki shows the entity name', () => d.getElementById('wiki-name').textContent.length > 0);
  check('wiki drew the ego-graph', () => d.querySelectorAll('#wiki-ego circle').length > 0);
  check('wiki listed appearances', () => d.querySelectorAll('.wiki-ap').length > 0);
}

console.log('\n── zone labels ──');
const label = d.querySelector('.zone-label');
check('zone label carries data-zone', () => label?.getAttribute('data-zone'));
check('zone label accepts pointer events', () => label?.getAttribute('pointer-events') === 'auto');
fire(label, 'click');
await settle(200);
check('zone click routes to #/zone/', () => window.location.hash.startsWith('#/zone/'));

// jsdom applies no CSS, so element counts above prove nothing about visibility.
// Read the built stylesheet directly and assert the things that must be on screen.
console.log('\n── built CSS: is any of it actually visible ──');
const cssFile = fs.readdirSync(path.join(dist, 'assets')).find(f => f.endsWith('.css'));
const css = fs.readFileSync(path.join(dist, 'assets', cssFile), 'utf8');

// Alpha of the resting `.link` rule — 0 means an invisible graph, which is how
// v2 shipped: it kept v1's transparent base but lost the .link.visible rule that
// used to make links show. The minifier rewrites rgba() to #rrggbbaa, so accept both.
function strokeAlpha(rule) {
  const body = css.match(new RegExp(`\\${rule}\\{([^}]*)\\}`))?.[1];
  if (!body) return null;
  const hex = body.match(/stroke:#[0-9a-f]{6}([0-9a-f]{2})/i);
  if (hex) return parseInt(hex[1], 16) / 255;
  const rgba = body.match(/stroke:rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  if (rgba) return parseFloat(rgba[1]);
  return /stroke:#[0-9a-f]{6}\b/i.test(body) ? 1 : null;
}

const resting = strokeAlpha('.link');
check('links have a visible resting stroke', () => resting !== null && resting > 0.02);
console.log(`      resting .link alpha = ${resting === null ? 'NOT FOUND' : resting.toFixed(3)}`);
check('selected links are brighter than resting', () => strokeAlpha('.link.highlighted') > resting);

check('wiki overlay is hidden until .open', () => /#wiki-overlay\{[^}]*display:none/.test(css));
check('panel is off-canvas until .open', () => /#panel\{[^}]*transform:translate(X)?\(100%\)/.test(css));
check('universe fills the viewport', () => /#universe\{[^}]*position:fixed/.test(css));

console.log(
  errors.length ? `\n${errors.length} error(s):\n  ` + errors.join('\n  ') : '\nNo uncaught errors.'
);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed || errors.length ? 1 : 0);
