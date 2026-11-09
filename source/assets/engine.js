/* Shader Fragments · engine
   A small Shadertoy-style runner on WebGL2:
   - GLC: one WebGL2 context with shared bits (full-screen triangle, audio texture)
   - Scene: one shader (Image pass + optional Buffer A pass) with its own time and buffers
   - Engine: the workbench (one visible canvas, render loop, mouse, pixel inspector, export)
   - Previewer: many small live previews that share ONE hidden context
   - SF.audio: built-in beat, your own track, or your microphone, as a 512x2 texture
   Chapter 18 of the course builds a minimal version of this from scratch. */
(function () {
'use strict';
const SF = (window.SF = window.SF || {});

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEADER = [
  '#version 300 es',
  'precision highp float;',
  'precision highp int;',
  'precision highp sampler2D;',
  'uniform vec3 iResolution;',
  'uniform float iTime;',
  'uniform float iTimeDelta;',
  'uniform int iFrame;',
  'uniform vec4 iMouse;',
  'uniform vec4 iDate;',
  'uniform sampler2D iChannel0;',
  'uniform sampler2D iChannel1;',
  'out vec4 sf_FragColor;',
  ''
].join('\n');
const HEADER_LINES = HEADER.split('\n').length - 1;
const FOOT_IMAGE = '\nvoid main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); sf_FragColor = vec4(c.rgb, 1.0); }\n';
const FOOT_BUFFER = '\nvoid main() { vec4 c = vec4(0.0); mainImage(c, gl_FragCoord.xy); sf_FragColor = c; }\n';
SF.HEADER = HEADER;

function parseErrors(log, pass, userLines) {
  const out = [];
  const re = /ERROR:\s*\d+:(\d+):\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(log))) {
    let line = parseInt(m[1], 10) - HEADER_LINES;
    let msg = m[2].trim();
    if (line > userLines) { line = 0; if (/mainImage/.test(msg) || /no matching overloaded/i.test(msg)) msg = 'mainImage is missing or misspelled. (' + msg + ')'; }
    if (line < 0) line = 0;
    out.push({ pass, line, msg });
  }
  if (!out.length && log) out.push({ pass, line: 0, msg: String(log).trim().split('\n')[0] });
  return out;
}

const HELP = [
  [/reserved|illegal use of reserved/i, 'That word is reserved in GLSL. Names like smooth, flat, input, output, sample, filter and half can’t be used for variables. Rename it.'],
  [/'smooth'|'flat'|'sample'|'filter'|'input'|'output'|'half'/i, 'That word is reserved in GLSL, so it can’t be a variable name. Rename it (for example softness, mask, amount).'],
  [/mainImage is missing/i, 'The runner looks for a function called exactly mainImage(out vec4 fragColor, in vec2 fragCoord). Check its spelling.'],
  [/cannot convert from .*int.* to .*float|int.*float.*convert/i, 'GLSL never turns whole numbers into decimals for you. Write 1.0 instead of 1, and 2.0 instead of 2 (Chapter 2).'],
  [/cannot convert/i, 'The two sides of = have different types, for example a vec3 stored into a float. Check what the right-hand side produces.'],
  [/wrong operand types|no operation .* exists/i, 'Two different types are being combined, like a float times an int, or a vec2 plus a vec3. Make them match: 2.0 instead of 2, or pick .xy from a vec3.'],
  [/undeclared identifier/i, 'This name doesn’t exist yet. Check the spelling (GLSL is case-sensitive) and that it is declared above this line.'],
  [/not enough data provided|too many arguments|constructor/i, 'A vector needs exactly the right number of values: vec3 needs 3 numbers (or a vec2 plus a float), vec4 needs 4.'],
  [/no matching overloaded function/i, 'A function got the wrong kinds of values. For example mix(a, b, t) needs a and b to be the same type, and length() needs a vector or a float.'],
  [/l-value|assign.*(uniform|const)|can't modify|cannot modify/i, 'That value can’t be changed here. Uniforms like iTime are read-only, and so are constants and "in" parameters.'],
  [/redefinition|already defined|redeclared/i, 'This name is declared twice in the same block. Drop the type on the second one (write d = ... instead of float d = ...), or rename it.'],
  [/'%'|modulus/i, 'For floats use mod(a, b). The % operator only works on ints.'],
  [/syntax error|unexpected|parse error/i, 'Something is off in the punctuation. Most often: a missing ; at the end of this line or the one above, or a bracket that never closes.'],
  [/loop|index/i, 'Loops in GLSL need a simple counter, like for (int i = 0; i < 8; i++).']
];
SF.explainError = function (msg) {
  for (const [re, text] of HELP) if (re.test(msg)) return text;
  return 'Read the message closely: it names the line, and usually the exact word it disliked. Chapter 19 covers debugging.';
};

/* ───────── GLC: a WebGL2 context plus the bits every scene shares ───────── */
class GLC {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    this.gl = gl;
    if (!gl) { this.failed = true; return; }
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vs = this.shader(gl.VERTEX_SHADER, VERT).shader;
    this.black = this.tex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]), gl.NEAREST);
    this.audioTex = this.tex(512, 2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1024), gl.LINEAR);
    this.audioData = new Uint8Array(1024);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
  }
  tex(w, h, internal, format, type, data, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  shader(type, src) {
    const gl = this.gl, sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || 'Unknown compile error';
      gl.deleteShader(sh);
      return { log };
    }
    return { shader: sh };
  }
  build(code, kind) {
    const gl = this.gl;
    const fs = this.shader(gl.FRAGMENT_SHADER, HEADER + code + (kind === 'image' ? FOOT_IMAGE : FOOT_BUFFER));
    if (fs.log) return { errors: parseErrors(fs.log, kind, code.split('\n').length) };
    const prog = gl.createProgram();
    gl.attachShader(prog, this.vs);
    gl.attachShader(prog, fs.shader);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    gl.deleteShader(fs.shader);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || 'Link error';
      gl.deleteProgram(prog);
      return { errors: [{ pass: kind, line: 0, msg: log }] };
    }
    const u = n => gl.getUniformLocation(prog, n);
    return { p: { prog, loc: { res: u('iResolution'), time: u('iTime'), dt: u('iTimeDelta'), frame: u('iFrame'), mouse: u('iMouse'), date: u('iDate'), ch0: u('iChannel0'), ch1: u('iChannel1') } } };
  }
  uploadAudio(time) {
    if (!SF.audio) return;
    const gl = this.gl;
    SF.audio.fill(this.audioData, time);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 2, gl.RED, gl.UNSIGNED_BYTE, this.audioData);
  }
}

/* ───────── Scene: one shader with its own clock, mouse and buffers ───────── */
class Scene {
  constructor(glc) {
    this.glc = glc;
    this.image = null; this.buffer = null;
    this.cfg = { bufferScale: 1, substeps: 1, filter: 'linear', audio: false };
    this.targets = null; this.ping = 0;
    this.time = 0; this.frame = 0; this.dt = 1 / 60;
    this.mouse = [0, 0, 0, 0];
  }
  _drop(kind) { if (this[kind]) { this.glc.gl.deleteProgram(this[kind].prog); this[kind] = null; } }
  load(passes, cfg) {
    if (!this.glc.gl) return [{ pass: 'image', line: 0, msg: 'WebGL2 is not available in this browser.' }];
    this.cfg = Object.assign({ bufferScale: 1, substeps: 1, filter: 'linear', audio: false }, cfg || {});
    this._drop('image'); this._drop('buffer');
    this.freeTargets();
    this.time = 0; this.frame = 0; this.mouse = [0, 0, 0, 0];
    return this.update(passes);
  }
  update(passes) {
    if (!this.glc.gl) return [];
    const errors = [];
    if (passes.buffer == null) this._drop('buffer');
    for (const kind of ['buffer', 'image']) {
      const code = passes[kind];
      if (code == null) continue;
      const r = this.glc.build(code, kind);
      if (r.errors) errors.push(...r.errors);
      else { this._drop(kind); this[kind] = r.p; }
    }
    return errors;
  }
  restart() { this.time = 0; this.frame = 0; this.freeTargets(); }
  free() { this._drop('image'); this._drop('buffer'); this.freeTargets(); }
  freeTargets() {
    if (!this.targets) return;
    const gl = this.glc.gl;
    for (const t of this.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.targets = null;
  }
  _makeTargets(w, h) {
    const glc = this.glc, gl = glc.gl;
    const wantLinear = this.cfg.filter !== 'nearest';
    const formats = [];
    if (glc.floatOK) {
      if (!wantLinear || glc.floatLinear) formats.push([gl.RGBA32F, gl.FLOAT]);
      formats.push([gl.RGBA16F, gl.HALF_FLOAT]);
    }
    formats.push([gl.RGBA8, gl.UNSIGNED_BYTE]);
    const mk = () => {
      const tex = gl.createTexture(), fb = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const [internal, type] of formats) {
        const filt = (wantLinear && !(internal === gl.RGBA32F && !glc.floatLinear)) ? gl.LINEAR : gl.NEAREST;
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { this.bufferFormat = internal === gl.RGBA8 ? 'rgba8' : internal === gl.RGBA16F ? 'rgba16f' : 'rgba32f'; break; }
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    };
    this.targets = [mk(), mk()];
    this.ping = 0;
  }
  _use(p, w, h, ch0, mouseScale, date) {
    const gl = this.glc.gl, L = p.loc, m = this.mouse;
    gl.useProgram(p.prog);
    gl.uniform3f(L.res, w, h, 1);
    gl.uniform1f(L.time, this.time);
    gl.uniform1f(L.dt, this.dt);
    gl.uniform1i(L.frame, this.frame);
    gl.uniform4f(L.mouse, m[0] * mouseScale, m[1] * mouseScale, m[2] * mouseScale, m[3] * mouseScale);
    gl.uniform4f(L.date, date[0], date[1], date[2], date[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ch0);
    gl.uniform1i(L.ch0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cfg.audio ? this.glc.audioTex : this.glc.black);
    gl.uniform1i(L.ch1, 1);
  }
  /* Draw into the default framebuffer, region (0,0,w,h). Steps the buffer pass when advance is true. */
  render(w, h, advance) {
    const glc = this.glc, gl = glc.gl;
    if (!gl || !this.image || glc.lost) return false;
    gl.bindVertexArray(glc.vao);
    const d = new Date();
    const date = [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000];
    if (this.buffer) {
      const bw = Math.max(1, Math.round(w * this.cfg.bufferScale)), bh = Math.max(1, Math.round(h * this.cfg.bufferScale));
      if (!this.targets || this.targets[0].w !== bw || this.targets[0].h !== bh) { this.freeTargets(); this._makeTargets(bw, bh); this.frame = 0; }
      const steps = (advance || this.frame === 0) ? this.cfg.substeps : 0;
      for (let s = 0; s < steps; s++) {
        const read = this.targets[this.ping], write = this.targets[1 - this.ping];
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
        gl.viewport(0, 0, write.w, write.h);
        this._use(this.buffer, write.w, write.h, read.tex, this.cfg.bufferScale, date);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.ping = 1 - this.ping;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const ch0 = (this.buffer && this.targets) ? this.targets[this.ping].tex : (this.cfg.audio ? glc.audioTex : glc.black);
    this._use(this.image, w, h, ch0, 1, date);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}

function bindPointer(canvas, getScene, onChange) {
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * canvas.width, (1 - (e.clientY - r.top) / r.height) * canvas.height];
  };
  let down = false;
  canvas.addEventListener('pointerdown', e => {
    const s = getScene(); if (!s) return;
    const p = pos(e);
    s.mouse = [p[0], p[1], p[0], p[1]];
    down = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (onChange) onChange();
  });
  canvas.addEventListener('pointermove', e => {
    const s = getScene(); if (!s || !down) return;
    const p = pos(e);
    s.mouse[0] = p[0]; s.mouse[1] = p[1];
    if (onChange) onChange();
  });
  const up = () => {
    const s = getScene(); if (!s || !down) return;
    down = false;
    s.mouse[2] = -Math.abs(s.mouse[2]); s.mouse[3] = -Math.abs(s.mouse[3]);
    if (onChange) onChange();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

/* ───────── Engine: the workbench canvas ───────── */
class Engine {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.glc = new GLC(canvas, opts);
    this.gl = this.glc.gl;
    this.failed = !!this.glc.failed;
    this.scene = new Scene(this.glc);
    this.playing = true; this.quality = 1; this.dprCap = opts.dprCap || 1.5;
    this.visible = true; this.needsDraw = true; this.fixedSize = !!opts.offscreen;
    this._raf = 0; this._last = 0; this._acc = 0; this._n = 0;
    this.inspect = null; this.onInspect = null; this.onFrame = null;
    this._px = new Uint8Array(4);
    this._tick = this._tick.bind(this);
    if (!opts.offscreen && !this.failed) {
      bindPointer(canvas, () => this.scene, () => { this.needsDraw = true; });
      canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        this.inspect = { x: Math.floor((e.clientX - r.left) / r.width * canvas.width), y: Math.floor((1 - (e.clientY - r.top) / r.height) * canvas.height) };
        this.needsDraw = true;
      });
      canvas.addEventListener('mouseleave', () => { this.inspect = null; if (this.onInspect) this.onInspect(null); });
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { for (const e of es) this.visible = e.isIntersecting; }, { threshold: 0.01 }).observe(canvas);
    }
  }
  get time() { return this.scene.time; }
  get buffer() { return this.scene.buffer; }
  get image() { return this.scene.image; }
  load(passes, cfg) { if (!this.fixedSize) this.quality = 1; this.needsDraw = true; return this.scene.load(passes, cfg); }
  update(passes) { this.needsDraw = true; return this.scene.update(passes); }
  restart() { this.scene.restart(); this.needsDraw = true; }

  _resize() {
    if (this.fixedSize) return;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.quality;
    const w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  render(advance) {
    if (this.failed || !this.scene.image) return;
    this._resize();
    if (this.scene.cfg.audio) this.glc.uploadAudio(this.scene.time);
    this.scene.render(this.canvas.width, this.canvas.height, advance);
    if (this.inspect && this.onInspect) {
      const { x, y } = this.inspect, gl = this.gl;
      if (x >= 0 && y >= 0 && x < this.canvas.width && y < this.canvas.height) {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._px);
        this.onInspect({ x: x + 0.5, y: y + 0.5, w: this.canvas.width, h: this.canvas.height, rgb: [this._px[0] / 255, this._px[1] / 255, this._px[2] / 255] });
      }
    }
  }
  start() { if (this.failed || this._raf) return; this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); }
  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!this.visible || document.hidden) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (!this.playing && !this.needsDraw) return;
    this.scene.dt = dt || 1 / 60;
    if (this.playing) this.scene.time += dt;
    this.render(this.playing);
    this.needsDraw = false;
    if (this.playing) this.scene.frame++;
    this._adapt(dt);
    if (this.onFrame) this.onFrame(this);
  }
  _adapt(dt) {
    if (this.scene.buffer || this.fixedSize || !this.playing) return;
    this._acc += dt; this._n++;
    if (this._n >= 30) {
      const avg = this._acc / this._n;
      this._acc = 0; this._n = 0;
      if (avg > 0.036 && this.quality > 0.45) this.quality *= 0.8;
    }
  }
  toBlob(type, quality) {
    return new Promise(res => { this.render(false); this.canvas.toBlob(b => res(b), type || 'image/png', quality || 0.92); });
  }
  async snapshotHD(w, h) {
    if (this.scene.buffer) return this.toBlob('image/png');
    const pw = this.canvas.width, ph = this.canvas.height, pf = this.fixedSize;
    this.fixedSize = true;
    this.canvas.width = w; this.canvas.height = h;
    const blob = await this.toBlob('image/png');
    this.canvas.width = pw; this.canvas.height = ph;
    this.fixedSize = pf; this.needsDraw = true;
    return blob;
  }
  record(seconds, onTick) {
    return new Promise((resolve, reject) => {
      if (!this.canvas.captureStream || !window.MediaRecorder) return reject(new Error('Recording is not supported in this browser.'));
      const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
      let stream, rec;
      try {
        stream = this.canvas.captureStream(60);
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
      } catch (e) { return reject(e); }
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const type = rec.mimeType || mime || 'video/webm';
        resolve({ blob: new Blob(chunks, { type }), ext: /mp4/.test(type) ? 'mp4' : 'webm' });
      };
      rec.start(250);
      let left = seconds;
      if (onTick) onTick(left);
      const iv = setInterval(() => { left--; if (onTick) onTick(left); if (left <= 0) { clearInterval(iv); try { rec.stop(); } catch (_) {} } }, 1000);
    });
  }
  /* Offscreen still (used to make thumbnails). */
  still(passes, cfg, w, h, t) {
    if (this.failed) return false;
    this.fixedSize = true;
    this.canvas.width = w; this.canvas.height = h;
    const errs = this.load(passes, cfg);
    if (errs.length || !this.scene.image) return false;
    if (this.scene.buffer) {
      const frames = (cfg && cfg.thumbFrames) || 160;
      for (let i = 0; i < frames; i++) { this.render(true); this.scene.time += 1 / 30; this.scene.frame++; }
    } else { this.scene.time = t == null ? 2.5 : t; this.render(false); }
    return true;
  }
}

/* ───────── Previewer: many small live canvases, one hidden GPU context ───────── */
class Previewer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640; this.canvas.height = 400;
    this.glc = new GLC(this.canvas, {});
    this.failed = !!this.glc.failed;
    this.items = [];
    this._last = 0;
    this._tick = this._tick.bind(this);
    this.io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
      for (const e of es) { const it = this.items.find(i => i.canvas === e.target); if (it) it.visible = e.isIntersecting; }
    }, { rootMargin: '120px 0px' }) : null;
  }
  add(canvas, passes, cfg) {
    const item = { canvas, ctx: canvas.getContext('2d'), passes, cfg: cfg || {}, scene: null, visible: !this.io, errors: null, playing: true };
    this.items.push(item);
    if (this.io) this.io.observe(canvas);
    bindPointer(canvas, () => item.scene, null);
    if (!this._raf && !this.failed) { this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); }
    return item;
  }
  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    let dt = Math.min(Math.max((now - this._last) / 1000, 0), 0.1);
    this._last = now;
    if (document.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let audioDone = false;
    for (const it of this.items) {
      if (!it.visible || it.errors) continue;
      if (!it.scene) {
        it.scene = new Scene(this.glc);
        const errs = it.scene.load(it.passes, it.cfg);
        if (errs.length) { it.errors = errs; it.canvas.dispatchEvent(new CustomEvent('sf-error', { detail: errs })); continue; }
      }
      const w = Math.max(2, Math.min(900, Math.round(it.canvas.clientWidth * dpr)));
      const h = Math.max(2, Math.min(600, Math.round(it.canvas.clientHeight * dpr)));
      if (it.canvas.width !== w || it.canvas.height !== h) { it.canvas.width = w; it.canvas.height = h; }
      if (this.canvas.width < w || this.canvas.height < h) { this.canvas.width = Math.max(this.canvas.width, w); this.canvas.height = Math.max(this.canvas.height, h); }
      if (it.cfg.audio && !audioDone) { this.glc.uploadAudio(it.scene.time); audioDone = true; }
      it.scene.dt = dt || 1 / 60;
      if (it.playing) it.scene.time += dt;
      if (it.scene.render(w, h, it.playing)) {
        it.ctx.drawImage(this.canvas, 0, this.canvas.height - h, w, h, 0, 0, w, h);
        if (it.playing) it.scene.frame++;
      }
    }
  }
}

SF.GLC = GLC; SF.Scene = Scene; SF.Engine = Engine; SF.Previewer = Previewer;

/* ───────── Audio: built-in beat, a track, or the microphone ───────── */
SF.audio = (function () {
  let ctx = null, analyser = null, master = null, timer = 0, src = null, micStream = null, micNode = null, micAnalyser = null;
  let mode = 'demo';
  const fft = new Uint8Array(512), wave = new Uint8Array(1024);
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(mode));
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available.');
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    return ctx;
  }
  function fill(out, t) {
    const an = mode === 'mic' ? micAnalyser : analyser;
    if (mode !== 'demo' && an) {
      an.getByteFrequencyData(fft);
      an.getByteTimeDomainData(wave);
      out.set(fft, 0);
      for (let i = 0; i < 512; i++) out[512 + i] = wave[i * 2];
      return;
    }
    const beat = (t * 2) % 1, kick = Math.exp(-beat * 7);
    for (let i = 0; i < 512; i++) {
      const slope = Math.exp(-i / 110);
      const shimmer = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 0.09) * Math.sin(t * 0.7 + i * 0.023);
      const v = 0.5 * slope * (0.55 + 0.45 * shimmer) + (i < 14 ? 0.45 * kick * (1 - i / 16) : 0) + (i > 260 && i < 420 ? 0.12 * Math.pow(Math.max(0, Math.sin(t * 8)), 6) : 0);
      out[i] = Math.max(0, Math.min(255, v * 255));
    }
    for (let i = 0; i < 512; i++) { const x = i / 512; out[512 + i] = 128 + 70 * kick * Math.sin(x * 40 + t * 3) * Math.exp(-x * 1.5) + 14 * Math.sin(x * 140 + t * 9); }
  }
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.45);
  }
  function clap(t) {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + 0.22);
  }
  function hat(t, vol) {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + 0.07);
  }
  function bass(t, freq, dur) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function pad(t, notes, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.5); g.gain.setValueAtTime(0.045, t + dur - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
    f.connect(g).connect(master);
    notes.forEach(n => [-7, 7].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }));
  }
  function stopAll() {
    if (timer) { clearInterval(timer); timer = 0; }
    if (src) { try { src.stop(); } catch (_) {} src = null; }
    if (micNode) { try { micNode.disconnect(); } catch (_) {} micNode = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  }
  function playBeat() {
    ensure(); ctx.resume(); stopAll();
    mode = 'beat'; emit();
    const step = 60 / 118 / 4;
    const P = { kick: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,1], clap: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0], bass: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,1,0] };
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]], roots = [33, 29, 36, 31];
    let next = ctx.currentTime + 0.06, idx = 0;
    timer = setInterval(() => {
      while (next < ctx.currentTime + 0.12) {
        const s = idx % 16, bar = Math.floor(idx / 16) % 4;
        if (P.kick[s]) kick(next);
        if (P.clap[s]) clap(next);
        if (P.hat[s]) hat(next, s % 4 === 2 ? 0.16 : 0.07);
        if (P.bass[s]) bass(next, midi(roots[bar] + (s === 6 || s === 14 ? 12 : 0)), step * 1.7);
        if (s === 0) pad(next, chords[bar], step * 16);
        next += step; idx++;
      }
    }, 25);
  }
  async function playFile(file) {
    ensure(); await ctx.resume();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    stopAll();
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(master); src.start();
    mode = 'file'; emit();
  }
  async function useMic() {
    ensure(); await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    stopAll();
    micStream = stream;
    if (!micAnalyser) { micAnalyser = ctx.createAnalyser(); micAnalyser.fftSize = 1024; micAnalyser.smoothingTimeConstant = 0.75; }
    micNode = ctx.createMediaStreamSource(stream);
    micNode.connect(micAnalyser);       // its own analyser, never connected to the speakers (no feedback)
    mode = 'mic'; emit();
  }
  function stop() { stopAll(); mode = 'demo'; emit(); }
  return { fill, playBeat, playFile, useMic, stop, onChange: f => { listeners.add(f); return () => listeners.delete(f); }, get mode() { return mode; } };
})();
})();
