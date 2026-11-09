/* Shader Fragments · interactive math diagrams (plain canvas 2D, theme-aware) */
(function () {
'use strict';
const SF = (window.SF = window.SF || {});
const W = (SF.widgets = SF.widgets || {});
const TAU = Math.PI * 2;

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim() || '#888';
  return { ink: g('--ink'), ink2: g('--ink-2'), line: g('--line'), accent: g('--accent'), cool: g('--cool'), bg: g('--surface'), soft: g('--surface-2'), pink: g('--pink') || '#d0569c' };
}
const f2 = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

/* Shared scaffolding: a responsive canvas, a readout line, optional controls. */
function make(el, opts) {
  el.classList.add('widget');
  el.innerHTML = '<div class="w-canvas"><canvas></canvas></div><div class="w-controls"></div><p class="w-readout" aria-live="polite"></p>' + (opts.caption ? '<p class="w-caption">' + opts.caption + '</p>' : '');
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
  const box = { el, canvas, ctx, controls: el.querySelector('.w-controls'), readout: el.querySelector('.w-readout'), w: 0, h: 0, drag: null };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    box.w = canvas.clientWidth; box.h = Math.round(box.w * (opts.aspect || 0.5));
    canvas.style.height = box.h + 'px';
    canvas.width = Math.round(box.w * dpr); canvas.height = Math.round(box.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    box.draw();
  };
  box.draw = () => { ctx.clearRect(0, 0, box.w, box.h); opts.draw(box, colors()); };
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  if (opts.down) {
    canvas.addEventListener('pointerdown', e => { const p = pt(e); box.drag = opts.down(box, p) || null; if (box.drag) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} box.draw(); } });
    canvas.addEventListener('pointermove', e => { if (box.drag && opts.move) { opts.move(box, pt(e)); box.draw(); } });
    const up = () => { box.drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => box.draw());
  requestAnimationFrame(resize);
  return box;
}
function slider(box, label, min, max, step, value, on) {
  const id = 'w' + Math.random().toString(36).slice(2, 8);
  const wrap = document.createElement('label');
  wrap.className = 'w-slider';
  wrap.htmlFor = id;
  wrap.innerHTML = '<span>' + label + '</span><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"><output></output>';
  const input = wrap.querySelector('input'), out = wrap.querySelector('output');
  const upd = () => { out.textContent = (+input.value).toFixed(step < 1 ? 2 : 0); on(+input.value); box.draw(); };
  input.addEventListener('input', upd);
  box.controls.appendChild(wrap);
  out.textContent = (+value).toFixed(step < 1 ? 2 : 0);
  return input;
}
function button(box, label, on) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn small'; b.textContent = label;
  b.addEventListener('click', () => { on(b); box.draw(); });
  box.controls.appendChild(b);
  return b;
}
function arrow(ctx, x0, y0, x1, y1, color, width) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hs = Math.min(10, L * 0.35);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 2.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hs * 0.6, y1 - Math.sin(a) * hs * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - hs * Math.cos(a - 0.45), y1 - hs * Math.sin(a - 0.45)); ctx.lineTo(x1 - hs * Math.cos(a + 0.45), y1 - hs * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
}
function label(ctx, text, x, y, color, align, font) {
  ctx.fillStyle = color; ctx.font = font || '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
function grid(ctx, ox, oy, s, w, h, c, step) {
  ctx.strokeStyle = c.line; ctx.lineWidth = 1;
  const st = (step || 1) * s;
  ctx.beginPath();
  for (let x = ox % st; x < w; x += st) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = oy % st; y < h; y += st) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke();
}

/* ── unit circle: cos and sin are just the x and y of a point on a circle ── */
W['unit-circle'] = el => {
  let th = 1.0, anim = false, last = 0;
  const box = make(el, {
    aspect: 0.46,
    caption: 'Drag the point around the circle, or press Play. Its x is cos θ, its y is sin θ, and the right side unrolls sin θ as a wave.',
    draw(b, c) {
      const { ctx, w, h } = b;
      const R = Math.min(h * 0.38, w * 0.17), cx = R + 34, cy = h / 2;
      grid(ctx, cx, cy, R, cx + R + 26, h, c, 0.5);
      ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      const px = cx + Math.cos(th) * R, py = cy - Math.sin(th) * R;
      ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
      ctx.strokeStyle = c.cool; ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.strokeStyle = c.ink2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, -(((th % TAU) + TAU) % TAU), true); ctx.stroke();
      ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
      label(ctx, 'θ', cx + R * 0.3 * Math.cos(th / 2), cy - R * 0.3 * Math.sin(th / 2), c.ink2, 'center');
      // the unrolled wave
      const gx = cx + R + 50, gw = w - gx - 16;
      if (gw > 60) {
        ctx.strokeStyle = c.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx + gw, cy); ctx.moveTo(gx, cy - R); ctx.lineTo(gx + gw, cy - R); ctx.moveTo(gx, cy + R); ctx.lineTo(gx + gw, cy + R); ctx.stroke();
        ctx.strokeStyle = c.cool; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= 200; i++) { const t = i / 200 * TAU, x = gx + i / 200 * gw, y = cy - Math.sin(t) * R; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i <= 200; i++) { const t = i / 200 * TAU, x = gx + i / 200 * gw, y = cy - Math.cos(t) * R; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.globalAlpha = 1;
        const tt = ((th % TAU) + TAU) % TAU, wx = gx + tt / TAU * gw, wy = cy - Math.sin(tt) * R;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = c.cool; ctx.beginPath(); ctx.arc(wx, wy, 6, 0, TAU); ctx.fill();
        label(ctx, '0', gx, cy + R + 14, c.ink2, 'center');
        label(ctx, 'π', gx + gw / 2, cy + R + 14, c.ink2, 'center');
        label(ctx, '2π', gx + gw, cy + R + 14, c.ink2, 'center');
        label(ctx, 'sin θ', gx + gw - 4, cy - R - 12, c.cool, 'right');
        label(ctx, 'cos θ', gx + 4, cy - R - 12, c.accent, 'left');
      }
      const deg = ((th * 180 / Math.PI) % 360 + 360) % 360;
      b.readout.innerHTML = '<b>θ</b> = ' + f2(((th % TAU) + TAU) % TAU) + ' radians (' + deg.toFixed(0) + '°) &nbsp; <b style="color:var(--accent)">cos θ = x = ' + f2(Math.cos(th)) + '</b> &nbsp; <b style="color:var(--cool)">sin θ = y = ' + f2(Math.sin(th)) + '</b>';
      b.geo = { cx, cy, R };
    },
    down(b, p) { const g = b.geo; if (Math.hypot(p.x - g.cx, p.y - g.cy) < g.R * 1.6) { th = Math.atan2(g.cy - p.y, p.x - g.cx); return true; } },
    move(b, p) { const g = b.geo; th = Math.atan2(g.cy - p.y, p.x - g.cx); }
  });
  const tick = now => { if (!anim) return; th += Math.min(0.05, (now - last) / 1000) * 0.9; last = now; box.draw(); requestAnimationFrame(tick); };
  button(box, 'Play', bt => { anim = !anim; bt.textContent = anim ? 'Pause' : 'Play'; if (anim) { last = performance.now(); requestAnimationFrame(tick); } });
};

/* ── vectors: add, subtract, length, dot product ── */
W['vectors'] = el => {
  let a = { x: 2, y: 1 }, b = { x: 0.5, y: 1.8 }, mode = el.dataset.mode || 'add';
  const box = make(el, {
    aspect: 0.55,
    caption: 'Drag the tips of a and b. Switch between adding, subtracting and the dot product.',
    draw(bx, c) {
      const { ctx, w, h } = bx;
      const s = Math.min(w, h * 1.8) / 9, ox = w * 0.36, oy = h * 0.74;
      bx.geo = { s, ox, oy };
      grid(ctx, ox, oy, s, w, h, c, 1);
      const P = v => [ox + v.x * s, oy - v.y * s];
      const [ax, ay] = P(a), [bxx, byy] = P(b);
      if (mode === 'add') {
        const sum = { x: a.x + b.x, y: a.y + b.y }, [sx, sy] = P(sum);
        ctx.globalAlpha = 0.45; arrow(ctx, ax, ay, sx, sy, c.cool, 2); arrow(ctx, bxx, byy, sx, sy, c.accent, 2); ctx.globalAlpha = 1;
        arrow(ctx, ox, oy, sx, sy, c.ink, 3); label(ctx, 'a + b', sx + 8, sy - 10, c.ink);
        bx.readout.innerHTML = 'a = (' + f2(a.x) + ', ' + f2(a.y) + ') &nbsp; b = (' + f2(b.x) + ', ' + f2(b.y) + ') &nbsp; <b>a + b = (' + f2(sum.x) + ', ' + f2(sum.y) + ')</b>: add x to x and y to y. Walking a then b lands where a + b points.';
      } else if (mode === 'sub') {
        arrow(ctx, ax, ay, bxx, byy, c.ink, 3); label(ctx, 'b − a', (ax + bxx) / 2 + 8, (ay + byy) / 2 - 10, c.ink);
        const d = { x: b.x - a.x, y: b.y - a.y };
        bx.readout.innerHTML = '<b>b − a = (' + f2(d.x) + ', ' + f2(d.y) + ')</b> is the arrow from a’s tip to b’s tip. Its length, <b>length(b − a) = ' + f2(Math.hypot(d.x, d.y)) + '</b>, is the distance between the two points.';
      } else {
        const lb = Math.hypot(b.x, b.y) || 1, nb = { x: b.x / lb, y: b.y / lb };
        const dot = a.x * b.x + a.y * b.y, pr = a.x * nb.x + a.y * nb.y, [px, py] = P({ x: nb.x * pr, y: nb.y * pr });
        ctx.setLineDash([5, 5]); ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = c.pink; ctx.lineWidth = 11; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = 1;
        const la = Math.hypot(a.x, a.y) || 1, cos = dot / (la * lb), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
        bx.readout.innerHTML = '<b>dot(a, b) = ' + f2(a.x) + '×' + f2(b.x) + ' + ' + f2(a.y) + '×' + f2(b.y) + ' = ' + f2(dot) + '</b> &nbsp; angle = ' + (ang * 180 / Math.PI).toFixed(0) + '° &nbsp; cos(angle) = ' + f2(cos) + '. The pink bar is how far a reaches along b’s direction (' + f2(pr) + ').';
      }
      arrow(ctx, ox, oy, ax, ay, c.cool, 3); label(ctx, 'a', ax + 10, ay, c.cool);
      arrow(ctx, ox, oy, bxx, byy, c.accent, 3); label(ctx, 'b', bxx + 10, byy, c.accent);
      ctx.fillStyle = c.ink; [[ax, ay], [bxx, byy]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); });
    },
    down(bx, p) {
      const g = bx.geo, V = v => [g.ox + v.x * g.s, g.oy - v.y * g.s];
      const [ax, ay] = V(a), [bxx, byy] = V(b);
      if (Math.hypot(p.x - ax, p.y - ay) < 22) return 'a';
      if (Math.hypot(p.x - bxx, p.y - byy) < 22) return 'b';
    },
    move(bx, p) {
      const g = bx.geo, v = { x: Math.round((p.x - g.ox) / g.s * 10) / 10, y: Math.round((g.oy - p.y) / g.s * 10) / 10 };
      if (bx.drag === 'a') a = v; else b = v;
    }
  });
  const btns = [];
  const set = (m, bt) => { mode = m; btns.forEach(x => x.classList.toggle('on', x === bt)); };
  btns.push(button(box, 'a + b', bt => set('add', bt)), button(box, 'b − a', bt => set('sub', bt)), button(box, 'dot(a, b)', bt => set('dot', bt)));
  btns[{ add: 0, sub: 1, dot: 2 }[mode] || 0].classList.add('on');
};

/* ── rotation: the rotation matrix is just where the two axis arrows end up ── */
W['rotation'] = el => {
  let th = 0.6;
  const shape = [[0, 0], [0, 2], [1.2, 2], [1.2, 1.6], [0.4, 1.6], [0.4, 1.15], [1, 1.15], [1, 0.75], [0.4, 0.75], [0.4, 0]].map(([x, y]) => [x * 0.75, y * 0.75]);
  const box = make(el, {
    aspect: 0.5,
    caption: 'Move the slider. The rotated shape is built from the two rotated axis arrows: x·(cos θ, sin θ) + y·(−sin θ, cos θ).',
    draw(b, c) {
      const { ctx, w, h } = b;
      const narrow = w < 520;
      const s = Math.min(h / 4.2, w / (narrow ? 6.5 : 8.5)), ox = w * (narrow ? 0.3 : 0.27), oy = h * 0.5;
      grid(ctx, ox, oy, s, w * (narrow ? 0.6 : 0.56), h, c, 1);
      const C = Math.cos(th), S = Math.sin(th);
      const R = (x, y) => [x * C - y * S, x * S + y * C];
      const P = (x, y) => [ox + x * s, oy - y * s];
      const poly = (pts, fill, alpha) => { ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => { const [X, Y] = P(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; };
      poly(shape, c.ink2, 0.16);
      poly(shape.map(([x, y]) => R(x, y)), c.accent, 0.5);
      ctx.globalAlpha = 0.35; arrow(ctx, ox, oy, ...P(1, 0), c.ink2, 2); arrow(ctx, ox, oy, ...P(0, 1), c.ink2, 2); ctx.globalAlpha = 1;
      const [ex, ey] = P(C, S), [fx, fy] = P(-S, C);
      arrow(ctx, ox, oy, ex, ey, c.cool, 3);
      arrow(ctx, ox, oy, fx, fy, c.pink, 3);
      const tag = (txt, x, y, dx, dy, col) => label(ctx, txt, x + dx * 12, y - dy * 12, col, dx >= 0 ? 'left' : 'right');
      if (!narrow) { tag('(cos θ, sin θ)', ex, ey, C, S, c.cool); tag('(−sin θ, cos θ)', fx, fy, -S, C, c.pink); }
      // the matrix
      const mx = w * (narrow ? 0.64 : 0.62), my = h * 0.26;
      label(ctx, 'mat2(', mx, my, c.ink2);
      label(ctx, f2(C) + ', ' + f2(S) + ',', mx + 16, my + 22, c.cool);
      label(ctx, f2(-S) + ', ' + f2(C) + ')', mx + 16, my + 44, c.pink);
      if (!narrow) {
        const sm = '12px "JetBrains Mono", ui-monospace, monospace';
        label(ctx, 'column 1 = new x arrow', mx, my + 78, c.cool, 'left', sm);
        label(ctx, 'column 2 = new y arrow', mx, my + 98, c.pink, 'left', sm);
      }
      b.readout.innerHTML = '<b>θ = ' + f2(th) + ' rad (' + (th * 180 / Math.PI).toFixed(0) + '°)</b>. <b style="color:var(--cool)">x arrow → (' + f2(C) + ', ' + f2(S) + ')</b>, <b style="color:var(--pink)">y arrow → (' + f2(-S) + ', ' + f2(C) + ')</b>. A point (x, y) moves to (x·cos θ − y·sin θ, x·sin θ + y·cos θ).';
    }
  });
  slider(box, 'θ', -3.14, 3.14, 0.01, th, v => { th = v; });
};

/* ── mix: linear interpolation on a number line and in color ── */
W['mix'] = el => {
  let t = 0.3;
  const box = make(el, {
    aspect: 0.28,
    caption: 'mix(a, b, t) = a + (b − a) × t. Slide t: at 0 you get a, at 1 you get b, in between you slide along the line.',
    draw(b, c) {
      const { ctx, w, h } = b;
      const x0 = 40, x1 = w - 40, y = h * 0.38;
      ctx.strokeStyle = c.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      const A = 0.2, B = 0.9, val = A + (B - A) * t;
      [[x0, 'a = 0.2'], [x1, 'b = 0.9']].forEach(([x, s]) => { ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); label(ctx, s, x, y + 22, c.ink2, 'center'); });
      const px = x0 + (x1 - x0) * t;
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(px, y, 9, 0, TAU); ctx.fill();
      label(ctx, f2(val), px, y - 22, c.accent, 'center');
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgb(38,77,230)'); g.addColorStop(1, 'rgb(242,140,38)');
      ctx.fillStyle = g; ctx.fillRect(x0, h * 0.72, x1 - x0, 14);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, h * 0.68); ctx.lineTo(px, h * 0.72 + 18); ctx.stroke();
      const col = [38 + (242 - 38) * t, 77 + (140 - 77) * t, 230 + (38 - 230) * t].map(Math.round);
      b.readout.innerHTML = '<b>t = ' + f2(t) + '</b> &nbsp; mix(0.2, 0.9, t) = 0.2 + 0.7 × ' + f2(t) + ' = <b>' + f2(val) + '</b> &nbsp; on colors: vec3(' + col.map(v => f2(v / 255)).join(', ') + ') <i class="sw" style="background:rgb(' + col.join(',') + ')"></i>';
    }
  });
  slider(box, 't', 0, 1, 0.01, t, v => { t = v; });
};

/* ── value noise: four random corners, blended ── */
W['bilinear'] = el => {
  let v = [0.15, 0.9, 0.55, 0.3], smooth = true;
  const box = make(el, {
    aspect: 0.42,
    caption: 'Four corner values (click a corner to change it). Every point inside blends them: first along x, then along y. Toggle the blend curve to see the creases a straight blend leaves.',
    draw(b, c) {
      const { ctx, w, h } = b;
      const size = Math.min(h - 58, w * 0.38), x0 = 58, y0 = 30;
      const img = ctx.createImageData(Math.round(size), Math.round(size));
      const sm = x => smooth ? x * x * (3 - 2 * x) : x;
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const fx = sm(i / (img.width - 1)), fy = sm(1 - j / (img.height - 1));
        const bot = v[0] + (v[1] - v[0]) * fx, top = v[2] + (v[3] - v[2]) * fx, val = bot + (top - bot) * fy;
        const k = (j * img.width + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(val * 255); img.data[k + 3] = 255;
      }
      const dpr = b.canvas.width / b.w;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(tmp, x0 * dpr, y0 * dpr, size * dpr, size * dpr); ctx.restore();
      const corners = [[x0, y0 + size], [x0 + size, y0 + size], [x0, y0], [x0 + size, y0]];
      corners.forEach(([x, y], i) => { ctx.fillStyle = 'rgb(' + Array(3).fill(Math.round(v[i] * 255)).join(',') + ')'; ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill(); ctx.stroke(); label(ctx, f2(v[i]), x + (i % 2 ? 16 : -16), y + (i < 2 ? 16 : -16), c.ink, i % 2 ? 'left' : 'right'); });
      // the profile along the bottom edge
      const gx = x0 + size + 70, gw = w - gx - 20;
      if (gw > 80) {
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(gx, y0, gw, size);
        ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= 100; i++) { const t = i / 100, val = v[0] + (v[1] - v[0]) * sm(t), x = gx + t * gw, y = y0 + size - val * size; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        label(ctx, gw > 190 ? 'bottom edge, left → right' : 'bottom edge', gx, y0 + size + 14, c.ink2);
      }
      b.geo = { corners };
      b.readout.innerHTML = 'Blend: <b>' + (smooth ? 'smooth, f·f·(3 − 2f)' : 'straight line, f') + '</b>. ' + (smooth ? 'The curve flattens at both ends, so neighbouring cells meet without a crease.' : 'Each cell is fine alone, but slopes jump at the edges, which shows up as creases.');
    },
    down(b, p) {
      const i = b.geo.corners.findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 20);
      if (i >= 0) { v[i] = Math.round(Math.random() * 100) / 100; return true; }
    }
  });
  button(box, 'Straight blend', bt => { smooth = !smooth; bt.textContent = smooth ? 'Straight blend' : 'Smooth blend'; });
};

/* ── raymarching in 2D: march by the distance to the nearest thing ── */
W['raymarch'] = el => {
  let ang = -0.12, steps = 12;
  const circles = [[5.2, 0.6, 1.0], [7.6, -1.7, 1.2], [3.6, -2.4, 0.8], [8.8, 2.0, 0.9]];
  const sdf = (x, y) => { let d = 1e9; for (const [cx, cy, r] of circles) d = Math.min(d, Math.hypot(x - cx, y - cy) - r); d = Math.min(d, y + 3.4); return d; };
  const box = make(el, {
    aspect: 0.5,
    caption: 'A ray leaves the camera on the left. At each step, the distance to the nearest surface is a circle that is guaranteed empty, so the ray can safely jump to its edge. Drag in the picture to aim.',
    draw(b, c) {
      const { ctx, w, h } = b;
      const s = Math.min(w / 11, h / 7.6), ox = 0.6 * s, oy = h * 0.45;
      b.geo = { s, ox, oy };
      const P = (x, y) => [ox + x * s, oy - y * s];
      ctx.fillStyle = c.soft; ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.5;
      for (const [cx, cy, r] of circles) { const [X, Y] = P(cx, cy); ctx.beginPath(); ctx.arc(X, Y, r * s, 0, TAU); ctx.fill(); ctx.stroke(); }
      const [, gy] = P(0, -3.4); ctx.fillRect(0, gy, w, h - gy); ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      let x = 0, y = 0, t = 0, hit = false, i = 0;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (i = 0; i < steps; i++) {
        const d = sdf(x, y);
        const [X, Y] = P(x, y);
        ctx.strokeStyle = c.cool; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X, Y, Math.max(d, 0) * s, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = c.cool; ctx.beginPath(); ctx.arc(X, Y, 3.5, 0, TAU); ctx.fill();
        if (d < 0.02) { hit = true; break; }
        if (t > 14) break;
        x += dx * d; y += dy * d; t += d;
      }
      const [X0, Y0] = P(0, 0), [X1, Y1] = P(x, y);
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
      ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(X0, Y0, 7, 0, TAU); ctx.fill();
      if (hit) { ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(X1, Y1, 7, 0, TAU); ctx.fill(); }
      b.readout.innerHTML = hit ? '<b>Hit</b> after ' + (i + 1) + ' steps, at distance t = ' + f2(t) + '. Notice how the steps shrink near a surface.' : (t > 14 ? '<b>Missed</b>: the ray travelled past the far limit, so this pixel shows the sky.' : '<b>Not done yet</b> after ' + steps + ' steps. Give it more steps, or aim closer to a surface edge to see how grazing rays struggle.');
    },
    down(b, p) { const g = b.geo; ang = Math.atan2(g.oy - p.y, p.x - g.ox); return true; },
    move(b, p) { const g = b.geo; ang = Math.atan2(g.oy - p.y, p.x - g.ox); }
  });
  slider(box, 'max steps', 1, 40, 1, steps, v => { steps = v; });
};

/* ── adding waves: any sound is a sum of sine waves ── */
W['waves'] = el => {
  const amps = [1, 0.5, 0.25], freqs = [1, 3, 7];
  const box = make(el, {
    aspect: 0.42,
    caption: 'Three sine waves at different frequencies, added together. The right side shows the recipe: how much of each frequency is in the sum. That recipe is what the FFT recovers from real sound.',
    draw(b, c) {
      const { ctx, w, h } = b;
      const gw = w * 0.66, mid = h / 2, A = h * 0.18;
      ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, mid); ctx.lineTo(gw, mid); ctx.stroke();
      const cols = [c.cool, c.accent, c.pink];
      amps.forEach((a, k) => {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const t = i / 300, x = 10 + t * (gw - 10), y = mid - Math.sin(t * TAU * freqs[k]) * a * A; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.globalAlpha = 1;
      });
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let i = 0; i <= 400; i++) { const t = i / 400, x = 10 + t * (gw - 10); let v = 0; amps.forEach((a, k) => { v += Math.sin(t * TAU * freqs[k]) * a; }); const y = mid - v * A; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      label(ctx, 'waveform (the sum)', 14, 16, c.ink2);
      const bx0 = gw + 40, bw = (w - bx0 - 20) / 3;
      amps.forEach((a, k) => { const bh = a * h * 0.6; ctx.fillStyle = cols[k]; ctx.fillRect(bx0 + k * bw + 6, h - 34 - bh, bw - 12, bh); label(ctx, freqs[k] + '×', bx0 + k * bw + bw / 2, h - 18, c.ink2, 'center'); });
      label(ctx, 'spectrum', bx0, 16, c.ink2);
      b.readout.innerHTML = 'amounts: ' + amps.map((a, k) => freqs[k] + '× → ' + f2(a)).join(' · ');
    }
  });
  amps.forEach((a, k) => slider(box, freqs[k] + '× wave', 0, 1, 0.01, a, v => { amps[k] = v; }));
};
})();
