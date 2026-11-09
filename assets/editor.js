/* Shader Fragments · a small GLSL editor
   textarea + highlight overlay, line numbers, error bands,
   a context bar (number slider, or the meaning of the word under the cursor),
   and hover help for every GLSL word that has a reference entry. */
(function () {
'use strict';
const SF = (window.SF = window.SF || {});

const KW = new Set('void float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D const in out inout uniform if else for while do return break continue discard struct true false highp mediump lowp precision define'.split(' '));
const FN = new Set('sin cos tan asin acos atan pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil round trunc fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture texelFetch textureSize radians degrees transpose inverse determinant dFdx dFdy fwidth lessThan greaterThan isnan isinf equal notEqual any all sinh cosh tanh'.split(' '));
const UN = new Set('iTime iResolution iMouse iFrame iTimeDelta iChannel0 iChannel1 iDate fragCoord fragColor mainImage'.split(' '));
const TOK = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(#[^\n]*)|([A-Za-z_]\w*)|(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|([\s\S])/g;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = s => s.replace(/[&<>]/g, c => ESC[c]);
const ref = w => (window.SF_REF && Object.prototype.hasOwnProperty.call(window.SF_REF, w)) ? window.SF_REF[w] : null;

function highlight(src) {
  let out = '';
  TOK.lastIndex = 0;
  let m;
  while ((m = TOK.exec(src))) {
    if (m[1]) out += '<span class="t-c">' + esc(m[1]) + '</span>';
    else if (m[2]) out += '<span class="t-p">' + esc(m[2]) + '</span>';
    else if (m[3]) {
      const w = m[3];
      out += KW.has(w) ? '<span class="t-k">' + w + '</span>' : FN.has(w) ? '<span class="t-f">' + w + '</span>' : UN.has(w) ? '<span class="t-u">' + w + '</span>' : w;
    } else if (m[4]) out += '<span class="t-n">' + m[4] + '</span>';
    else out += esc(m[5]);
  }
  return out;
}

/* word under a character index in a string */
function wordAt(text, i) {
  if (i < 0 || i > text.length) return null;
  let a = i, b = i;
  while (a > 0 && /\w/.test(text[a - 1])) a--;
  while (b < text.length && /\w/.test(text[b])) b++;
  if (a === b) return null;
  const w = text.slice(a, b);
  return /^[A-Za-z_]/.test(w) ? { word: w, start: a, end: b } : null;
}

let tip = null;
function tooltip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'sf-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  return tip;
}
function tipHtml(word, r) {
  return '<b>' + esc(r.sig || word) + '</b><span>' + r.short + '</span>';
}
SF.showTip = function (x, y, word, r) {
  const t = tooltip();
  t.innerHTML = tipHtml(word, r);
  t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = Math.min(x + 12, window.innerWidth - w - 10), top = y + 18;
  if (top + h > window.innerHeight - 8) top = y - h - 12;
  t.style.left = Math.max(8, left) + 'px';
  t.style.top = Math.max(8, top) + 'px';
};
SF.hideTip = function () { if (tip) tip.hidden = true; };
SF.refLink = function (word) {
  const root = document.body.dataset.root || '.';
  return root + '/reference.html#' + encodeURIComponent(word);
};

class Editor {
  constructor(root, opts) {
    this.opts = opts || {};
    root.classList.add('ed-host');
    root.innerHTML =
      '<div class="ed-bar" aria-live="polite"><span class="ed-bar-hint">Click a number to get a slider. Hover or click a word to see what it means.</span>' +
      '<span class="ed-num" hidden><output class="ed-num-val"></output><input class="ed-num-range" type="range" aria-label="Change the selected number"></span>' +
      '<span class="ed-word" hidden></span></div>' +
      '<div class="ed-body"><div class="ed-gutter" aria-hidden="true"><div class="ed-ln"></div></div>' +
      '<div class="ed-main"><div class="ed-bands" aria-hidden="true"></div><pre class="ed-hl" aria-hidden="true"><code></code></pre>' +
      '<textarea class="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Shader code"></textarea></div></div>';
    this.root = root;
    this.ta = root.querySelector('.ed-ta');
    this.hl = root.querySelector('.ed-hl code');
    this.pre = root.querySelector('.ed-hl');
    this.ln = root.querySelector('.ed-ln');
    this.bands = root.querySelector('.ed-bands');
    this.hint = root.querySelector('.ed-bar-hint');
    this.numBox = root.querySelector('.ed-num');
    this.numVal = root.querySelector('.ed-num-val');
    this.range = root.querySelector('.ed-num-range');
    this.wordBox = root.querySelector('.ed-word');
    this.errLines = [];
    this.num = null;
    this._escTab = false;

    this.ta.addEventListener('input', () => { this._refresh(); this._caret(); this._changed(); });
    this.ta.addEventListener('scroll', () => { this._sync(); SF.hideTip(); });
    ['click', 'keyup', 'focus'].forEach(ev => this.ta.addEventListener(ev, () => this._caret()));
    this.ta.addEventListener('keydown', e => this._key(e));
    this.ta.addEventListener('mousemove', e => this._hover(e));
    this.ta.addEventListener('mouseleave', () => SF.hideTip());
    this.range.addEventListener('input', () => this._scrubTo(parseFloat(this.range.value)));
    this.range.addEventListener('change', () => { this._recenter(); this._changed(true); });
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.num = null; this._showBar(null); this._refresh(); this.ta.scrollTop = 0; this.ta.scrollLeft = 0; this._sync(); }

  setErrors(lines) { this.errLines = lines || []; this._bands(); }

  focusLine(n) {
    const lines = this.ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos);
    this.ta.scrollTop = Math.max(0, (n - 4) * this._lh());
    this._sync();
  }

  _lh() { return parseFloat(getComputedStyle(this.ta).lineHeight) || 20; }
  _cw() {
    if (this._charW) return this._charW;
    const s = document.createElement('span');
    s.textContent = 'MMMMMMMMMMMMMMMMMMMM';
    s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + getComputedStyle(this.ta).font;
    document.body.appendChild(s);
    this._charW = s.getBoundingClientRect().width / 20 || 7.8;
    s.remove();
    return this._charW;
  }
  _changed(final) { if (this.opts.onChange) this.opts.onChange(this.ta.value, !!final); }

  _refresh() {
    const v = this.ta.value;
    this.hl.innerHTML = highlight(v) + '\n ';
    const n = v.split('\n').length;
    if (n !== this._lines) {
      this._lines = n;
      let s = '';
      for (let i = 1; i <= n; i++) s += i + '\n';
      this.ln.textContent = s;
    }
    this._bands();
    this._sync();
  }
  _bands() {
    const lh = this._lh();
    const pad = parseFloat(getComputedStyle(this.ta).paddingTop) || 0;
    this.bands.innerHTML = this.errLines.filter(l => l > 0).map(l => '<div class="ed-band" style="top:' + (pad + (l - 1) * lh) + 'px;height:' + lh + 'px"></div>').join('');
  }
  _sync() {
    const x = this.ta.scrollLeft, y = this.ta.scrollTop;
    this.pre.style.transform = 'translate(' + (-x) + 'px,' + (-y) + 'px)';
    this.bands.style.transform = 'translateY(' + (-y) + 'px)';
    this.ln.style.transform = 'translateY(' + (-y) + 'px)';
  }

  _insert(text) {
    this.ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) {
      this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end');
      this._refresh();
      this._changed();
    }
  }

  _key(e) {
    const ta = this.ta;
    if (e.key === 'Escape') { this._escTab = true; return; }
    if (e.key === 'Tab' && !this._escTab && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (!e.shiftKey) this._insert('    ');
      return;
    }
    if (e.key !== 'Tab') this._escTab = false;
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      let indent = (line.match(/^\s*/) || [''])[0];
      if (/[{(]\s*$/.test(line)) indent += '    ';
      e.preventDefault();
      this._insert('\n' + indent);
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      this._caret();
      if (!this.num) return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const step = this.num.isInt ? 1 : Math.pow(10, -this.num.dec);
      this._scrubTo(this.num.value + dir * step * (e.shiftKey ? 10 : 1));
      this._recenter();
    }
  }

  _hover(e) {
    if (e.buttons) { SF.hideTip(); return; }
    const r = this.ta.getBoundingClientRect(), cs = getComputedStyle(this.ta);
    const x = e.clientX - r.left - parseFloat(cs.paddingLeft) + this.ta.scrollLeft;
    const y = e.clientY - r.top - parseFloat(cs.paddingTop) + this.ta.scrollTop;
    const row = Math.floor(y / this._lh()), col = Math.floor(x / this._cw());
    const lines = this.ta.value.split('\n');
    if (row < 0 || row >= lines.length || col < 0 || col >= lines[row].length) { SF.hideTip(); return; }
    const w = wordAt(lines[row], col + (/\w/.test(lines[row][col]) ? 0 : -1));
    const info = w && ref(w.word);
    if (!info || !/\w/.test(lines[row][col])) { SF.hideTip(); return; }
    SF.showTip(e.clientX, e.clientY, w.word, info);
  }

  _showBar(kind, payload) {
    this.hint.hidden = !!kind;
    this.numBox.hidden = kind !== 'num';
    this.wordBox.hidden = kind !== 'word';
    if (kind === 'word') {
      const { word, info } = payload;
      this.wordBox.innerHTML = '<b>' + esc(info.sig || word) + '</b> <span>' + info.short + '</span> <a href="' + SF.refLink(word) + '" target="_blank" rel="noopener">reference ↗</a>';
    }
  }

  /* number under the caret → slider; otherwise a known word → its meaning */
  _caret() {
    const ta = this.ta, v = ta.value, pos = ta.selectionStart;
    if (ta.selectionEnd !== pos) { this.num = null; this._showBar(null); return; }
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    let le = v.indexOf('\n', pos); if (le < 0) le = v.length;
    const line = v.slice(ls, le);
    const ci = line.indexOf('//');
    const re = /(\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
    let m, found = null;
    while ((m = re.exec(line))) {
      const before = line[m.index - 1] || '', after = line[m.index + m[0].length] || '';
      if (/[\w.]/.test(before) || /[\w.]/.test(after)) continue;
      let s = m.index;
      if (line[s - 1] === '-') {
        let j = s - 2;
        while (j >= 0 && line[j] === ' ') j--;
        if (j < 0 || /[(,=+\-*/<>?:!&|[{]/.test(line[j])) s = s - 1;
      }
      const a = ls + s, b = ls + m.index + m[0].length;
      if (pos >= a && pos <= b) { if (!(ci >= 0 && m.index > ci)) found = { start: a, end: b, text: v.slice(a, b) }; break; }
    }
    if (found) {
      const isInt = !/[.eE]/.test(found.text);
      const dec = isInt ? 0 : Math.min(4, Math.max(2, ((found.text.split('.')[1] || '').replace(/[eE].*/, '')).length));
      this.num = { start: found.start, end: found.end, value: parseFloat(found.text), isInt, dec };
      this._recenter();
      this.numVal.textContent = found.text;
      this._showBar('num');
      return;
    }
    this.num = null;
    const w = wordAt(line, pos - ls) || wordAt(line, pos - ls - 1);
    const info = w && !(ci >= 0 && w.start > ci) && ref(w.word);
    if (info) this._showBar('word', { word: w.word, info });
    else this._showBar(null);
  }
  _recenter() {
    const n = this.num; if (!n) return;
    const span = Math.max(Math.abs(n.value), n.isInt ? 4 : 0.5) * 2;
    this.range.min = String(n.value - span);
    this.range.max = String(n.value + span);
    this.range.step = n.isInt ? '1' : String(Math.pow(10, -n.dec));
    this.range.value = String(n.value);
  }
  _scrubTo(val) {
    const n = this.num; if (!n || !isFinite(val)) return;
    const text = n.isInt ? String(Math.round(val)) : val.toFixed(n.dec);
    const ta = this.ta, keep = [ta.scrollTop, ta.scrollLeft];
    ta.setRangeText(text, n.start, n.end, 'start');
    n.end = n.start + text.length;
    n.value = parseFloat(text);
    ta.setSelectionRange(n.start + 1, n.start + 1);
    ta.scrollTop = keep[0]; ta.scrollLeft = keep[1];
    this.numVal.textContent = text;
    this._refresh();
    this._changed();
  }
}
SF.Editor = Editor;
SF.highlight = highlight;
SF.wordAt = wordAt;
})();
