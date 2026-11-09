/* Shader Fragments · page logic (static site: nothing is stored anywhere) */
(function () {
'use strict';
const SF = window.SF;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const PAGE = document.body.dataset.page;
const REF = window.SF_REF || {};

const ICON = {
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  restart: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 2.5v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  full: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

let toastT = 0;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('<div id="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
function showText(title, text) {
  const m = el(`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-box"><h3>${esc(title)}</h3><p class="eyebrow">Copying was blocked, so select all and copy it yourself.</p><textarea readonly></textarea><div><button class="btn primary">Close</button></div></div></div>`);
  $('textarea', m).value = text;
  $('button', m).onclick = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  $('textarea', m).select();
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label || 'Copied'); }
  catch (_) { showText(label || 'Copy', text); }
}
function saveFile(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Saved ' + filename);
}

/* ───────── p5.js export ───────── */
function toP5(code, audio) {
  return `// Exported from Shader Fragments. Paste into editor.p5js.org and press play.
// Works with p5.js 1.x and 2.x. Your shader runs as a filter over the whole canvas;
// anything you draw in draw() before filter(fx) reaches the shader as iChannel0.
${audio ? '// This shader listened to audio on the site. In p5 there is no audio texture,\n// so iChannel0 is your drawing instead. Feed it p5.FFT values as uniforms if you like.\n' : ''}
const frag = \`#version 300 es
precision highp float;
uniform sampler2D tex0;     // what p5 drew this frame
uniform vec2 canvasSize;    // canvas size in pixels, provided by p5
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
in vec2 vTexCoord;
out vec4 outColor;
vec3 iResolution;

// p5's texture coordinates run top to bottom, Shadertoy's run bottom to top.
// These lines flip p5's canvas so iChannel0 lines up with fragCoord.
vec4 sf_texture(sampler2D s, vec2 uv) { return texture(s, vec2(uv.x, 1.0 - uv.y)); }
#define texture(s, uv) sf_texture(s, uv)
#define iChannel0 tex0

// mainImage is renamed shadertoyImage here: p5 mistakes any function whose
// name starts with "main" for the shader's own main().
${code.replace(/\bmainImage\b/g, 'shadertoyImage').replace(/`/g, "'").replace(/\$\{/g, '$ {')}

void main() {
  iResolution = vec3(canvasSize, 1.0);
  vec2 fragCoord = vec2(vTexCoord.x, 1.0 - vTexCoord.y) * canvasSize;
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  shadertoyImage(c, fragCoord);
  outColor = vec4(c.rgb, 1.0);
}\`;

let fx;

function setup() {
  createCanvas(600, 600, WEBGL);
  fx = createFilterShader(frag);
}

function draw() {
  background(0);
  // Draw anything here (in WEBGL mode, (0, 0) is the center and y points down).
  // It reaches the shader as iChannel0.

  fx.setUniform('iTime', millis() / 1000);
  fx.setUniform('iTimeDelta', deltaTime / 1000);
  fx.setUniform('iFrame', frameCount);
  fx.setUniform('iMouse', [mouseX, height - mouseY, mouseIsPressed ? 1 : 0, 0]);
  filter(fx);
}
`;
}
SF.toP5 = toP5;

/* ───────── the workbench ───────── */
const Stage = {
  eng: null, canvas: null, host: null, editor: null, ex: null, passes: null, cfg: null, tab: 'image', errors: [],
  mount(host) {
    this.host = host;
    host.innerHTML = `
      <div class="stage-head"><span class="stage-label">Workbench</span><span class="stage-title"></span></div>
      <div class="canvas-wrap"><span class="rec" hidden></span><span class="mouse-hint" hidden>drag on the canvas</span><div class="inspect" hidden></div></div>
      <div class="bar">
        <button class="sbtn icon" data-act="play" aria-label="Pause" title="Pause">${ICON.pause}</button>
        <button class="sbtn icon" data-act="restart" aria-label="Restart" title="Restart time (and simulations)">${ICON.restart}</button>
        <button class="sbtn icon" data-act="full" aria-label="Full screen" title="Full screen">${ICON.full}</button>
        <span class="clock" aria-hidden="true">iTime 0.0</span>
        <span class="grow"></span>
        <div class="menu">
          <button class="sbtn" data-act="export" aria-haspopup="true" aria-expanded="false">Export ▾</button>
          <div class="menu-pop" hidden>
            <button data-x="png">Save PNG<small>this frame</small></button>
            <button data-x="hd">Save PNG, 1920 × 1080<small>for wallpapers and posters</small></button>
            <button data-x="clip">Record a 6-second clip<small>MP4 or WebM, ready to post</small></button>
            <button data-x="toy">Copy for Shadertoy<small>paste into shadertoy.com/new</small></button>
            <button data-x="p5">Copy as p5.js sketch<small>paste into editor.p5js.org</small></button>
          </div>
        </div>
      </div>
      <div class="audio-row" hidden><button class="sbtn hot" data-act="beat">▶ Play beat</button><label class="sbtn" for="audio-file">Load a track</label><input id="audio-file" type="file" accept="audio/*" hidden><button class="sbtn" data-act="mic">Use microphone</button><button class="sbtn" data-act="stopaudio">Stop sound</button><span class="state"></span></div>
      <div class="tabs" role="tablist" aria-label="Shader passes" hidden><button role="tab" data-tab="image" aria-selected="true">Image</button><button role="tab" data-tab="buffer" aria-selected="false">Buffer A</button></div>
      <div class="editor-host"></div>
      <div class="err" hidden role="status"></div>
      <div class="foot"><button class="sbtn" data-act="reset">Reset code</button><span class="tip">Hover the canvas to inspect any pixel.</span></div>`;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Live shader output');
    $('.canvas-wrap', host).prepend(this.canvas);
    this.eng = new SF.Engine(this.canvas, { dprCap: 1.5 });
    if (this.eng.failed) $('.canvas-wrap', host).insertAdjacentHTML('beforeend', '<div class="no-gl">WebGL2 isn’t available in this browser, so shaders can’t run here. Try a recent Chrome, Edge, Firefox or Safari.</div>');
    this.editor = new SF.Editor($('.editor-host', host), { onChange: v => this.onEdit(v) });
    let n = 0;
    this.eng.onFrame = e => { if (++n % 6 === 0) { const c = $('.clock', host); if (c) c.textContent = 'iTime ' + e.time.toFixed(1); } };
    this.eng.onInspect = info => this.paintInspect(info);
    this.wire();
    this.eng.start();
  },

  /* ex = { id, label, title, passes: {image, buffer}, cfg } */
  load(ex) {
    this.ex = ex;
    this.passes = { image: ex.passes.image, buffer: ex.passes.buffer == null ? null : ex.passes.buffer };
    this.cfg = ex.cfg || {};
    this.tab = 'image';
    const hasBuf = this.passes.buffer != null, audio = !!this.cfg.audio;
    $('.stage-title', this.host).textContent = ex.label ? ex.label + ' · ' + ex.title : (ex.title || '');
    $('.tabs', this.host).hidden = !hasBuf;
    $$('.tabs [data-tab]', this.host).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === 'image')));
    $('.audio-row', this.host).hidden = !audio;
    $('[data-x="hd"]', this.host).disabled = hasBuf;
    $('[data-x="p5"]', this.host).disabled = hasBuf;
    this.editor.value = this.passes.image;
    this.eng.playing = true;
    $('[data-act="play"]', this.host).innerHTML = ICON.pause;
    this.showErrors(this.eng.load(this.passes, this.cfg));
    this.paintMouseHint();
    if (!audio && SF.audio.mode !== 'demo') SF.audio.stop();
  },

  onEdit(v) {
    this.passes[this.tab] = v;
    clearTimeout(this._ct);
    this._ct = setTimeout(() => { this.showErrors(this.eng.update(this.passes)); this.paintMouseHint(); }, 120);
  },

  paintMouseHint() {
    const uses = /iMouse/.test(this.passes.image + (this.passes.buffer || ''));
    $('.mouse-hint', this.host).hidden = !uses;
    this.canvas.classList.toggle('grab', uses);
  },

  paintInspect(info) {
    const box = $('.inspect', this.host);
    if (!info) { box.hidden = true; return; }
    const f = v => v.toFixed(2), f3 = v => v.toFixed(3);
    const uvx = info.x / info.w, uvy = info.y / info.h;
    const cx = (2 * info.x - info.w) / info.h, cy = (2 * info.y - info.h) / info.h;
    box.hidden = false;
    box.innerHTML = `<span><b>fragCoord</b> ${f(info.x)}, ${f(info.y)}</span><span><b>uv</b> ${f3(uvx)}, ${f3(uvy)}</span><span><b>centered</b> ${f3(cx)}, ${f3(cy)}</span><span><b>color</b> <i style="background:rgb(${info.rgb.map(c => Math.round(c * 255)).join(',')})"></i>${info.rgb.map(f).join(', ')}</span>`;
  },

  showErrors(errs) {
    this.errors = errs || [];
    const box = $('.err', this.host);
    const mine = this.errors.filter(e => e.pass === this.tab);
    this.editor.setErrors(mine.map(e => e.line));
    if (!this.errors.length) { box.hidden = true; box.innerHTML = ''; return; }
    const first = mine[0] || this.errors[0];
    const other = first.pass !== this.tab;
    box.hidden = false;
    box.innerHTML = `<span>${other ? `The <b>${first.pass === 'buffer' ? 'Buffer A' : 'Image'}</b> tab has an error. ` : ''}${esc(SF.explainError(first.msg))}</span>
      <span class="msg">${first.line ? `<button data-line="${first.line}">line ${first.line}</button>: ` : ''}${esc(first.msg)}${this.errors.length > 1 ? ` (+${this.errors.length - 1} more)` : ''}</span>
      <span class="msg dim">The canvas keeps showing the last version that worked.</span>`;
    const lb = $('[data-line]', box);
    if (lb) lb.onclick = () => { if (other) this.setTab(first.pass); this.editor.focusLine(first.line); };
  },

  setTab(tab) {
    if (tab === this.tab || this.passes[tab] == null) return;
    this.tab = tab;
    $$('.tabs [data-tab]', this.host).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.editor.value = this.passes[tab];
    this.showErrors(this.errors);
  },

  wire() {
    const host = this.host, eng = this.eng;
    const pop = $('.menu-pop', host), exp = $('[data-act="export"]', host);
    const closeMenu = () => { pop.hidden = true; exp.setAttribute('aria-expanded', 'false'); };
    host.addEventListener('click', async e => {
      const t = e.target.closest('button');
      if (!t || !host.contains(t)) return;
      const act = t.dataset.act;
      if (t.dataset.tab) { this.setTab(t.dataset.tab); return; }
      if (act === 'play') {
        eng.playing = !eng.playing; eng.needsDraw = true;
        t.innerHTML = eng.playing ? ICON.pause : ICON.play;
        t.setAttribute('aria-label', eng.playing ? 'Pause' : 'Play'); t.title = eng.playing ? 'Pause' : 'Play';
      } else if (act === 'restart') eng.restart();
      else if (act === 'full') {
        const w = $('.canvas-wrap', host);
        try { if (document.fullscreenElement) await document.exitFullscreen(); else await w.requestFullscreen(); } catch (_) { toast('Full screen is not available here.'); }
      } else if (act === 'export') { const open = pop.hidden; pop.hidden = !open; exp.setAttribute('aria-expanded', String(open)); }
      else if (t.dataset.x) { closeMenu(); this.exportAs(t.dataset.x); }
      else if (act === 'reset') this.confirmReset(t);
      else if (act === 'beat') { try { SF.audio.playBeat(); } catch (_) { toast('Sound is not available in this browser.'); } }
      else if (act === 'mic') { try { await SF.audio.useMic(); toast('Listening to your microphone'); } catch (_) { toast('The microphone was blocked or isn’t available.'); } }
      else if (act === 'stopaudio') SF.audio.stop();
    });
    document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('.menu')) closeMenu(); });
    const file = $('#audio-file', host);
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try { await SF.audio.playFile(f); toast('Playing ' + f.name); } catch (_) { toast('That file couldn’t be played. Try an MP3, WAV or M4A.'); }
      file.value = '';
    });
    const state = $('.audio-row .state', host);
    const paint = m => { state.textContent = { beat: 'built-in beat', file: 'your track', mic: 'microphone', demo: 'quiet demo signal' }[m] || ''; };
    paint(SF.audio.mode);
    SF.audio.onChange(paint);
    host.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); eng.restart(); }
    });
  },

  confirmReset(btn) {
    const foot = btn.closest('.foot');
    if ($('.reset-confirm', foot)) return;
    const c = el(`<span class="reset-confirm">Replace your edits with the original? <button class="sbtn hot" data-yes>Reset</button><button class="sbtn" data-no>Keep mine</button></span>`);
    btn.after(c);
    $('[data-no]', c).onclick = ev => { ev.stopPropagation(); c.remove(); };
    $('[data-yes]', c).onclick = ev => { ev.stopPropagation(); c.remove(); this.load(this.ex); toast('Back to the original code'); };
  },

  fileBase() { return 'shader-' + (this.ex && this.ex.id ? this.ex.id : 'workbench') + '-' + Date.now().toString(36); },

  async exportAs(kind) {
    const eng = this.eng;
    if (eng.failed) return;
    if (kind === 'png') { const b = await eng.toBlob('image/png'); if (b) saveFile(this.fileBase() + '.png', b); }
    else if (kind === 'hd') { const b = await eng.snapshotHD(1920, 1080); if (b) saveFile(this.fileBase() + '-1920.png', b); }
    else if (kind === 'clip') {
      const rec = $('.rec', this.host);
      try {
        rec.hidden = false;
        const r = await eng.record(6, s => { rec.textContent = '● REC ' + Math.max(0, s); });
        rec.hidden = true;
        saveFile(this.fileBase() + '.' + r.ext, r.blob);
      } catch (err) { rec.hidden = true; toast(err && err.message ? err.message : 'Recording failed.'); }
    } else if (kind === 'toy') {
      const a = !!this.cfg.audio;
      const text = this.passes.buffer != null
        ? `// ───── Buffer A ─────\n// On Shadertoy: click the + tab next to "Image", choose Buffer A, paste this,\n// then set Buffer A's iChannel0 to "Buffer A" (itself).${a ? '\n// Set Buffer A\'s iChannel1 to sound: a track from the Music tab, or the Microphone.' : ''}\n// Shadertoy buffers run at full resolution and default to linear filtering:\n// use the gear icon on a channel to switch to nearest if the course example did.\n\n${this.passes.buffer}\n\n\n// ───── Image ─────\n// Paste this into the Image tab and set its iChannel0 to "Buffer A".\n\n${this.passes.image}\n`
        : (a ? '// On Shadertoy, set iChannel0 to sound: a track from the Music tab, the Microphone, or SoundCloud.\n\n' : '') + this.passes.image + '\n';
      copyText(text, 'Copied. Paste it into shadertoy.com/new');
    } else if (kind === 'p5') copyText(toP5(this.passes.image, !!this.cfg.audio), 'Copied. Paste it into editor.p5js.org');
  }
};
SF.Stage = Stage;

/* ───────── examples embedded in a page ───────── */
function readExample(fig) {
  const passes = { image: null, buffer: null };
  $$('script[type="text/x-glsl"]', fig).forEach(s => { passes[s.dataset.pass || 'image'] = s.textContent.replace(/^\n/, '').replace(/\s+$/, ''); });
  let cfg = {};
  try { cfg = JSON.parse(fig.dataset.cfg || '{}'); } catch (_) {}
  return { id: fig.dataset.ex, label: fig.dataset.label, title: fig.dataset.title, passes, cfg };
}

function initExamples(previewer) {
  const figs = $$('figure.ex');
  const list = figs.map(readExample);
  figs.forEach((fig, i) => {
    const ex = list[i];
    const view = $('.ex-view', fig);
    const c = document.createElement('canvas');
    c.setAttribute('aria-label', 'Live preview: ' + ex.title);
    view.prepend(c);
    if (previewer && !previewer.failed) {
      const item = previewer.add(c, ex.passes, ex.cfg);
      c.addEventListener('sf-error', e => { view.insertAdjacentHTML('beforeend', '<p class="no-gl">This example failed to compile: ' + esc(e.detail[0].msg) + '</p>'); });
      const pb = $('[data-act="pp"]', fig);
      if (pb) pb.addEventListener('click', () => { item.playing = !item.playing; pb.innerHTML = item.playing ? ICON.pause : ICON.play; pb.setAttribute('aria-label', item.playing ? 'Pause preview' : 'Play preview'); });
    } else view.insertAdjacentHTML('beforeend', '<div class="no-gl">WebGL2 isn’t available, so previews can’t run.</div>');
    $$('pre.ex-code code', fig).forEach(code => { code.innerHTML = SF.highlight(code.textContent); });
    const edit = $('[data-act="edit"]', fig);
    if (edit) edit.addEventListener('click', () => {
      if (!Stage.host) return;
      Stage.load(ex);
      if (window.matchMedia('(max-width: 1080px)').matches) Stage.host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Loaded into the workbench: ' + ex.label);
    });
    const copy = $('[data-act="copy"]', fig);
    if (copy) copy.addEventListener('click', () => copyText(ex.passes.buffer != null ? '// Buffer A\n' + ex.passes.buffer + '\n\n// Image\n' + ex.passes.image : ex.passes.image, 'Copied ' + ex.label));
    const more = $('.ex-more', fig);
    if (more) more.addEventListener('click', () => { fig.classList.toggle('open'); more.textContent = fig.classList.contains('open') ? 'Show less' : more.dataset.label; });
  });
  return list;
}

/* inline `code` that names something in the reference becomes a link with a tooltip */
function linkTerms() {
  $$('main code, .ch-body code, .home code').forEach(code => {
    if (code.closest('pre, a, .no-ref')) return;
    const m = code.textContent.trim().match(/^([A-Za-z_]\w*)(\s*\(.*\))?$/);
    if (!m || !REF[m[1]]) return;
    const a = document.createElement('a');
    a.className = 'ref-link';
    a.href = SF.refLink(m[1]);
    code.replaceWith(a);
    a.appendChild(code);
    const show = e => { const r = a.getBoundingClientRect(); SF.showTip(e && e.clientX != null ? e.clientX : r.left, e && e.clientY != null ? e.clientY : r.bottom - 10, m[1], REF[m[1]]); };
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', () => show(null));
    a.addEventListener('mouseleave', SF.hideTip);
    a.addEventListener('blur', SF.hideTip);
  });
}

function highlightSnippets() {
  $$('pre.snip:not(.js) code').forEach(code => { code.innerHTML = SF.highlight(code.textContent); });
  $$('pre.snip').forEach(pre => {
    if (pre.dataset.nocopy != null) return;
    const b = el('<button class="snip-copy" type="button">Copy</button>');
    b.addEventListener('click', () => copyText(pre.querySelector('code').textContent, 'Copied'));
    pre.appendChild(b);
  });
}

function initWidgets() {
  $$('[data-widget]').forEach(w => {
    const fn = SF.widgets && SF.widgets[w.dataset.widget];
    if (fn) { try { fn(w); } catch (e) { w.textContent = 'This diagram could not start: ' + e.message; } }
  });
}

function initTocSpy() {
  const links = $$('.ch-toc a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { links.forEach(a => a.classList.remove('on')); const a = map.get(e.target.id); if (a) a.classList.add('on'); } });
  }, { rootMargin: '-15% 0px -75% 0px' });
  $$('.ch-body h2[id]').forEach(h => io.observe(h));
}

/* ───────── pages ───────── */
function boot() {
  highlightSnippets();
  linkTerms();
  initWidgets();
  if (PAGE === 'chapter') {
    const pv = new SF.Previewer();
    const list = initExamples(pv);
    const host = $('#workbench');
    if (host) {
      Stage.mount(host);
      const start = list.find(x => x.id === host.dataset.start) || list[0];
      if (start) Stage.load(start);
    }
    initTocSpy();
  } else if (PAGE === 'playground') {
    const host = $('#workbench');
    Stage.mount(host);
    const sel = $('#start-from');
    const all = window.SF_EXAMPLES || [];
    const toolkit = all.find(x => x.id === host.dataset.start) || all[0];
    sel.addEventListener('change', () => {
      const ex = all.find(x => x.id === sel.value);
      if (ex) Stage.load(ex);
    });
    const want = (location.hash || '').replace('#', '');
    const first = all.find(x => x.id === want) || toolkit;
    if (first) { Stage.load(first); sel.value = first.id; }
  } else if (PAGE === 'home') {
    const c = $('#hero-canvas'), src = $('#hero-code');
    if (c && src) {
      const eng = new SF.Engine(c, { dprCap: 1.25 });
      if (!eng.failed) { eng.load({ image: src.textContent }, {}); eng.start(); }
    }
    const pv = new SF.Previewer();
    initExamples(pv);
  } else if (PAGE === 'reference') {
    const box = $('#ref-search');
    if (box) box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      $$('.ref-entry').forEach(e => { e.hidden = !!q && !e.textContent.toLowerCase().includes(q); });
      $$('.ref-group').forEach(g => { g.hidden = !!q && !$$('.ref-entry', g).some(e => !e.hidden); });
    });
    if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) { t.classList.add('flash'); setTimeout(() => t.scrollIntoView({ block: 'center' }), 50); } }
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
