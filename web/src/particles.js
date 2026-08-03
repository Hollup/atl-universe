/**
 * Canvas particle background — slowly drifting starfield.
 * Zone proximity tints particles with zone color.
 */

import { zones } from './data.js';

let canvas, ctx, particles = [], animFrame;
let curW = 0, curH = 0;
let lastTransform = { x: 0, y: 0, k: 1 };

// Zone centers in screen space (updated on resize / zoom)
let zoneCenters = [];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}

function initParticles(w, h, count = 280) {
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.1 + 0.2,
    vx: (Math.random() - 0.5) * 0.08,
    vy: (Math.random() - 0.5) * 0.08,
    baseAlpha: Math.random() * 0.35 + 0.05,
    twinkleSpeed: Math.random() * 0.008 + 0.002,
    twinklePhase: Math.random() * Math.PI * 2,
  }));
}

function updateZoneCenters(w, h, transform) {
  // transform: d3 zoom transform {x, y, k}
  zoneCenters = Object.values(zones).map(z => ({
    x: z.x * w * transform.k + transform.x,
    y: z.y * h * transform.k + transform.y,
    color: hexToRgb(z.color),
    radius: Math.min(w, h) * 0.25 * transform.k,
  }));
}

function getParticleColor(px, py) {
  let totalR = 180, totalG = 180, totalB = 200, totalW = 1;
  for (const zc of zoneCenters) {
    const dx = px - zc.x, dy = py - zc.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < zc.radius) {
      const influence = Math.pow(1 - dist / zc.radius, 2) * 0.7;
      totalR += zc.color.r * influence;
      totalG += zc.color.g * influence;
      totalB += zc.color.b * influence;
      totalW += influence;
    }
  }
  return `${Math.round(totalR/totalW)},${Math.round(totalG/totalW)},${Math.round(totalB/totalW)}`;
}

function draw() {
  const w = curW, h = curH;
  ctx.clearRect(0, 0, w, h);
  const t = performance.now() / 1000;

  for (const p of particles) {
    // Drift
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;

    // Twinkle
    const alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(t * p.twinkleSpeed * 100 + p.twinklePhase));
    const rgb = getParticleColor(p.x, p.y);

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    ctx.fill();
  }

  animFrame = requestAnimationFrame(draw);
}

export function initParticleBackground(container) {
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  container.insertBefore(canvas, container.firstChild);

  function resize() {
    curW = container.clientWidth;
    curH = container.clientHeight;
    canvas.width  = curW;
    canvas.height = curH;
    ctx = canvas.getContext('2d');
    initParticles(curW, curH);
    // Zone centers are in screen space, so they move when the canvas does.
    updateZoneCenters(curW, curH, lastTransform);
  }

  resize();
  window.addEventListener('resize', resize);
  draw();

  return {
    updateTransform(transform) {
      lastTransform = transform;
      updateZoneCenters(curW, curH, transform);
    },
    destroy() {
      cancelAnimationFrame(animFrame);
      canvas.remove();
      window.removeEventListener('resize', resize);
    }
  };
}
