#!/usr/bin/env python3
"""Build the Shader Fragments static site.

Usage:  python3 source/build.py            (from the repo root)
Reads   source/chapters/*.html, source/reference_data.py, source/assets/*
Writes  index.html, chapters/*.html, reference.html, playground.html, assets/*

Chapter source markup (plain HTML plus a few conventions):
  <!--meta {...json...} -->                          first line: num, slug, part, title, summary, hero, start
  <p class="lede">...</p>                            becomes the chapter intro
  <h2 id="slug">Title</h2>                           numbered section, listed in the table of contents
  <script type="text/x-glsl" data-ex="id" data-title="..." [data-pass="buffer"] [data-cfg='{}']>
      ... GLSL ...
  </script>                                          a live example (same data-ex = one example, two passes)
  <script type="text/x-glsl-snippet">...</script>   a code snippet (not run)
  <script type="text/x-js-snippet">...</script>     a JavaScript snippet
  <aside class="math|note|warn|aha" title="...">     a boxed note
  <div class="try" title="...">                      an exercise box (use <details> for hints/solutions)
  <div data-widget="unit-circle"></div>              an interactive diagram (see assets/widgets.js)
  <div data-file="runner.html"></div>                a complete file from source/files, shown with Open and Download links
"""
import html, json, os, re, shutil, sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent if (SRC.parent / 'source').exists() else SRC.parent
OUT = Path(os.environ.get('SF_OUT', ROOT))
sys.path.insert(0, str(SRC))
import reference_data  # noqa: E402

PARTS = {
    1: ('Part I', 'Foundations', 'How a shader thinks, and all the math it needs, from zero.'),
    2: ('Part II', 'Make things', 'Generative art, 3D worlds, living simulations and music visuals.'),
    3: ('Part III', 'Under the hood', 'How the GPU runs your code, a runner built from scratch, and debugging.'),
    4: ('Part IV', 'Share it', 'Shadertoy, p5.js, Genuary and where to go next.'),
}
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=JetBrains+Mono:wght@400;600&display=swap">'
PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>'
BOX_TITLES = {'math': 'Math from zero', 'note': 'Note', 'warn': 'Watch out', 'aha': '// AHA'}


def attrs(s):
    return {m.group(1): html.unescape(m.group(3) if m.group(3) is not None else m.group(4)) for m in re.finditer(r'([\w-]+)=("([^"]*)"|\'([^\']*)\')', s)}


def esc(s):
    return html.escape(s, quote=False)


def page(title, body, root, page_type, desc, extra_head='', scripts=True, current=''):
    def cur(name):
        return ' aria-current="page"' if current == name else ''
    js = ''
    if scripts:
        js = ''.join(f'<script src="{root}/assets/{f}"></script>' for f in ['reference.js', 'engine.js', 'editor.js', 'widgets.js'])
        if page_type == 'playground':
            js += f'<script src="{root}/assets/examples.js"></script>'
        js += f'<script src="{root}/assets/site.js"></script>'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="{root}/assets/icon.svg" type="image/svg+xml">
{FONTS}
<link rel="stylesheet" href="{root}/assets/style.css">
{extra_head}
</head>
<body data-page="{page_type}" data-root="{root}">
<header class="top"><div class="top-in">
  <a class="logo" href="{root}/index.html"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="word">Shader Fragments</span></a>
  <nav class="nav" aria-label="Main"><a href="{root}/index.html#contents"{cur('contents')}>Contents</a><a href="{root}/reference.html"{cur('reference')}>Reference</a><a href="{root}/playground.html"{cur('playground')}>Playground</a></nav>
</div></header>
<main>
{body}
</main>
<div id="toast" role="status" aria-live="polite"></div>
{js}
</body>
</html>
'''


def load_chapters():
    chapters = []
    for f in sorted((SRC / 'chapters').glob('*.html')):
        raw = f.read_text()
        m = re.match(r'\s*<!--meta\s*(\{.*?\})\s*-->', raw, re.S)
        if not m:
            raise SystemExit(f'{f.name}: missing <!--meta {{...}} --> header')
        meta = json.loads(m.group(1))
        meta['body_src'] = raw[m.end():]
        meta['file'] = f'{meta["num"]:02d}-{meta["slug"]}.html'
        chapters.append(meta)
    chapters.sort(key=lambda c: c['num'])
    return chapters


def render_chapter(ch, all_examples):
    src = ch['body_src']
    num = ch['num']
    lede = ''
    m = re.search(r'<p class="lede">(.*?)</p>', src, re.S)
    if m:
        lede = m.group(1).strip()
        src = src[:m.start()] + src[m.end():]

    # live examples: group consecutive scripts that share data-ex
    examples = []
    counter = [0]

    def ex_block(match_list):
        a0 = match_list[-1][0]
        ex_id = a0['data-ex']
        counter[0] += 1
        label = f'Example {num}.{counter[0]}'
        title = a0.get('data-title', '')
        cfg = {}
        passes = {'image': None, 'buffer': None}
        for a, code in match_list:
            p = a.get('data-pass', 'image')
            passes[p] = code.strip('\n').rstrip()
            if a.get('data-cfg'):
                cfg.update(json.loads(a['data-cfg']))
        lines = sum(len((passes[k] or '').split('\n')) for k in passes if passes[k])
        long_cls = ' long' if lines > 28 else ''
        examples.append({'id': ex_id, 'label': label, 'title': title, 'chapter': num, 'passes': passes, 'cfg': cfg})
        code_html = ''
        if passes['buffer'] is not None:
            code_html += '<p class="ex-pass">Buffer A</p><pre class="ex-code"><code>' + esc(passes['buffer']) + '</code></pre><p class="ex-pass">Image</p>'
        code_html += '<pre class="ex-code"><code>' + esc(passes['image']) + '</code></pre>'
        more = f'<button class="sbtn ex-more" type="button" data-label="Show all {lines} lines">Show all {lines} lines</button>' if long_cls else ''
        raw = ''.join(f'<script type="text/x-glsl" data-pass="{k}">\n{passes[k]}\n</script>' for k in ('buffer', 'image') if passes[k] is not None)
        return (f'<figure class="ex{long_cls}" id="ex-{ex_id}" data-ex="{ex_id}" data-label="{label}" data-title="{html.escape(title)}" data-cfg=\'{json.dumps(cfg)}\'>'
                f'<figcaption><span class="ex-n">{label}</span><span>{esc(title)}</span></figcaption>'
                f'<div class="ex-view"></div>{code_html}'
                f'<div class="ex-actions"><button class="sbtn icon" type="button" data-act="pp" aria-label="Pause preview">{PAUSE}</button><span class="grow"></span>{more}'
                f'<button class="sbtn" type="button" data-act="copy">Copy</button><button class="sbtn hot" type="button" data-act="edit">Edit in workbench</button></div>{raw}</figure>')

    pattern = re.compile(r'<script type="text/x-glsl"([^>]*)>(.*?)</script>', re.S)
    out, pos, group = [], 0, []
    matches = list(pattern.finditer(src))
    i = 0
    while i < len(matches):
        mm = matches[i]
        a = attrs(mm.group(1))
        grp = [(a, mm.group(2))]
        j = i + 1
        while j < len(matches) and attrs(matches[j].group(1)).get('data-ex') == a.get('data-ex') and not src[matches[j - 1].end():matches[j].start()].strip():
            grp.append((attrs(matches[j].group(1)), matches[j].group(2)))
            j += 1
        out.append(src[pos:mm.start()])
        out.append(ex_block(grp))
        pos = matches[j - 1].end()
        i = j
    out.append(src[pos:])
    src = ''.join(out)

    src = re.sub(r'<script type="text/x-glsl-snippet"([^>]*)>(.*?)</script>', lambda m: '<pre class="snip"><code>' + esc(m.group(2).strip('\n').rstrip()) + '</code></pre>', src, flags=re.S)
    # inside a JS snippet, write <\/script> for a literal closing script tag
    src = re.sub(r'<script type="text/x-js-snippet"([^>]*)>(.*?)</script>', lambda m: '<pre class="snip js"><code>' + esc(m.group(2).strip('\n').rstrip()).replace('&lt;\\/script&gt;', '&lt;/script&gt;') + '</code></pre>', src, flags=re.S)

    def file_block(m):          # <div data-file="name"></div>: a complete file from source/files, shown and downloadable
        name = m.group(1)
        text = (SRC / 'files' / name).read_text()
        return (f'<div class="file-block"><div class="file-bar"><span class="file-name">{esc(name)}</span><span class="grow"></span>'
                f'<a class="sbtn" href="../files/{name}" target="_blank" rel="noopener">Open in a new tab</a>'
                f'<a class="sbtn hot" href="../files/{name}" download>Download</a></div>'
                f'<pre class="snip js file"><code>{esc(text.rstrip())}</code></pre></div>')
    src = re.sub(r'<div data-file="([\w.-]+)"></div>', file_block, src)

    def box(m):
        cls, a = m.group(1), attrs(m.group(2))
        t = a.get('title', BOX_TITLES.get(cls, ''))
        return f'<aside class="box {cls}"><span class="box-t">{esc(t)}</span>'
    src = re.sub(r'<aside class="(math|note|warn|aha)"([^>]*)>', box, src)
    src = re.sub(r'<div class="try"([^>]*)>', lambda m: f'<div class="try"><span class="box-t">{esc(attrs(m.group(1)).get("title", "Try it"))}</span>', src)
    src = re.sub(r'<table>', '<div class="table-wrap"><table>', src)
    src = src.replace('</table>', '</table></div>')

    toc = []
    sec = [0]

    def h2(m):
        a = attrs(m.group(1))
        sec[0] += 1
        toc.append((a['id'], re.sub(r'<[^>]+>', '', m.group(2))))
        return f'<h2 id="{a["id"]}"><span class="sec-n">{num}.{sec[0]}</span>{m.group(2)}</h2>'
    src = re.sub(r'<h2( id="[^"]+")>(.*?)</h2>', h2, src)
    all_examples.extend(examples)
    return src, lede, toc, examples


def build():
    chapters = load_chapters()
    for d in ['chapters', 'assets', 'assets/thumbs', 'files']:
        (OUT / d).mkdir(parents=True, exist_ok=True)
    for sub in ['assets', 'files', 'assets/thumbs']:
        if (SRC / sub).exists():
            for f in (SRC / sub).iterdir():
                if f.is_file():
                    shutil.copy(f, OUT / sub / f.name)

    all_examples = []
    rendered = []
    for ch in chapters:
        body, lede, toc, examples = render_chapter(ch, all_examples)
        rendered.append((ch, body, lede, toc, examples))

    # reference data (for tooltips) and where each word is used
    used = {}
    for ch, body, lede, toc, examples in rendered:
        words = set()
        for ex in examples:
            for k in ('image', 'buffer'):
                if ex['passes'][k]:
                    words |= set(re.findall(r'[A-Za-z_]\w*', ex['passes'][k]))
        for w in words:
            used.setdefault(w, []).append(ch['num'])
    ref_js = {e['key']: {'sig': e.get('sig', e['key']), 'short': e['short']} for g in reference_data.GROUPS for e in g['entries']}
    (OUT / 'assets' / 'reference.js').write_text('window.SF_REF = ' + json.dumps(ref_js, ensure_ascii=False) + ';\n')
    (OUT / 'assets' / 'examples.js').write_text('window.SF_EXAMPLES = ' + json.dumps(all_examples, ensure_ascii=False) + ';\n')

    by_num = {c['num']: c for c in chapters}
    for idx, (ch, body, lede, toc, examples) in enumerate(rendered):
        part = PARTS[ch['part']]
        prev_ch = rendered[idx - 1][0] if idx > 0 else None
        next_ch = rendered[idx + 1][0] if idx + 1 < len(rendered) else None
        nav = '<nav class="ch-nav" aria-label="Chapters">'
        nav += f'<a href="{prev_ch["file"]}"><small>← Chapter {prev_ch["num"]}</small><b>{esc(prev_ch["title"])}</b></a>' if prev_ch else '<a href="../index.html#contents"><small>←</small><b>Contents</b></a>'
        nav += f'<a class="next" href="{next_ch["file"]}"><small>Chapter {next_ch["num"]} →</small><b>{esc(next_ch["title"])}</b></a>' if next_ch else '<a class="next" href="../playground.html"><small>→</small><b>Open the playground</b></a>'
        nav += '</nav>'
        toc_html = ''.join(f'<li><a href="#{i}">{esc(t)}</a></li>' for i, t in toc)
        start = ch.get('start') or (examples[0]['id'] if examples else '')
        stage = f'<aside class="stage" id="workbench" data-start="{start}" aria-label="Workbench: live shader and code"></aside>' if examples else ''
        content = f'''<div class="wrap"><div class="chapter">
<header class="ch-head">
  <p class="eyebrow"><b>{part[0]} · {esc(part[1])}</b> · Chapter {ch["num"]}</p>
  <h1>{esc(ch["title"])}</h1>
  <p class="lede">{lede}</p>
  <details class="ch-toc" open><summary>In this chapter</summary><ol>{toc_html}</ol></details>
</header>
{stage}
<article class="ch-body">
{body}
{nav}
</article>
</div></div>'''
        (OUT / 'chapters' / ch['file']).write_text(page(f'{ch["num"]}. {ch["title"]} · Shader Fragments', content, '..', 'chapter', ch['summary']))

    # reference page
    groups_html, side = [], []
    for g in reference_data.GROUPS:
        side.append(f'<a href="#g-{g["id"]}">{esc(g["title"])}</a>')
        entries = []
        for e in g['entries']:
            seen = used.get(e['key'], [])
            seen_html = ''
            if seen and g['id'] not in ('glossary', 'errors'):
                seen_html = '<p class="seen">Used in chapter' + ('s ' if len(seen) > 1 else ' ') + ', '.join(f'<a href="chapters/{by_num[n]["file"]}">{n}</a>' for n in seen[:10]) + '</p>'
            long_html = ''.join(f'<p>{p}</p>' for p in e.get('long', [])) if isinstance(e.get('long'), list) else (f'<p>{e["long"]}</p>' if e.get('long') else '')
            ex_html = f'<pre class="snip"><code>{esc(e["example"])}</code></pre>' if e.get('example') else ''
            entries.append(f'<div class="ref-entry" id="{html.escape(e["key"])}"><h3>{esc(e.get("sig", e["key"]))}</h3><p class="short">{e["short"]}</p><div class="long">{long_html}</div>{ex_html}{seen_html}</div>')
        groups_html.append(f'<section class="ref-group" id="g-{g["id"]}"><h2>{esc(g["title"])}</h2><p>{g.get("intro", "")}</p>{"".join(entries)}</section>')
    ref_body = f'''<div class="wrap"><div class="ref-page">
<aside class="ref-side"><label class="sr" for="ref-search">Search the reference</label><input id="ref-search" type="search" placeholder="Search: mix, swizzle, NaN…" autocomplete="off"><nav aria-label="Reference sections">{"".join(side)}</nav></aside>
<div class="ref-main"><div><p class="eyebrow">// look anything up</p><h1>GLSL reference</h1><p class="lede" style="color:var(--ink-2);margin-top:10px">Every type, operator, built-in function and Shadertoy input used in this course, in plain words. In the workbench, hover any of these words to see this explanation.</p></div>
{"".join(groups_html)}</div></div></div>'''
    (OUT / 'reference.html').write_text(page('GLSL reference · Shader Fragments', ref_body, '.', 'reference', 'Every GLSL type, operator and built-in used in Shader Fragments, explained in plain words.', current='reference'))

    # playground
    opts = []
    for ch in chapters:
        exs = [e for e in all_examples if e['chapter'] == ch['num']]
        if exs:
            opts.append(f'<optgroup label="{ch["num"]}. {html.escape(ch["title"])}">' + ''.join(f'<option value="{e["id"]}">{e["label"]} · {html.escape(e["title"])}</option>' for e in exs) + '</optgroup>')
    play_body = f'''<div class="wrap"><div class="play">
<div class="play-side"><p class="eyebrow">// make anything</p><h1>Playground</h1>
<p style="color:var(--ink-2)">A full-size workbench. Start from your toolkit or from any example in the course. Nothing is saved: copy or export what you want to keep.</p>
<label class="eyebrow" for="start-from">Start from</label><select id="start-from">{"".join(opts)}</select>
<aside class="box note"><span class="box-t">Shortcuts</span><p style="font-size:15px">Click a number, then drag the slider. Hover a word for its meaning. Hover the canvas to inspect a pixel. <code>Ctrl/⌘ + Enter</code> restarts time.</p></aside></div>
<aside class="stage" id="workbench" data-start="toolkit" aria-label="Workbench"></aside>
</div></div>'''
    (OUT / 'playground.html').write_text(page('Playground · Shader Fragments', play_body, '.', 'playground', 'A full-size GLSL workbench.', current='playground'))

    # home
    hero_code = next((e['passes']['image'] for e in all_examples if e['id'] == 'first-piece'), all_examples[0]['passes']['image'])
    parts_html = []
    for pn, (pl, pname, pdesc) in PARTS.items():
        cards = []
        for ch in [c for c in chapters if c['part'] == pn]:
            thumb = f'assets/thumbs/{ch["num"]:02d}.jpg'
            img = f'<img src="{thumb}" alt="" loading="lazy">' if (OUT / thumb).exists() else ''
            cards.append(f'<a class="card" href="chapters/{ch["file"]}"><div class="thumb">{img}</div><span class="n">Chapter {ch["num"]}</span><span class="t">{esc(ch["title"])}</span><span class="s">{esc(ch["summary"])}</span></a>')
        parts_html.append(f'<section class="part"><div class="part-head"><h3>{pl} · {esc(pname)}</h3><p>{esc(pdesc)}</p></div><div class="cards">{"".join(cards)}</div></section>')
    first = chapters[0]
    home_body = f'''<div class="wrap"><div class="home">
<section class="hero">
  <div>
    <p class="eyebrow">// a course in GLSL shaders</p>
    <h1>Shader Fragments</h1>
    <p class="lede">Learn to make images, 3D worlds, simulations and music visuals out of math, starting from what a pixel is. Every idea is explained from zero, every example runs live, and every word in the code explains itself.</p>
    <div class="actions"><a class="btn primary big" href="chapters/{first["file"]}">Start with Chapter 1</a><a class="btn big" href="#contents">See all {len(chapters)} chapters</a></div>
  </div>
  <div class="hero-stage"><canvas id="hero-canvas" aria-label="A live shader: the piece you build in Chapter 12"></canvas><span class="hero-cap">running live · you build this in Chapter 12</span></div>
</section>
<script type="text/x-glsl" id="hero-code">
{hero_code}
</script>
<section class="how" aria-label="How to use this site">
  <div><b>Read on the left</b><span>Each chapter is one long page. Examples run live inside the text.</span></div>
  <div><b>Play on the right</b><span>“Edit in workbench” loads any example into the editor next to the text.</span></div>
  <div><b>Poke the numbers</b><span>Click a number in the code and drag the slider. Hover a word to see what it means.</span></div>
  <div><b>Inspect any pixel</b><span>Hover the workbench canvas to read a pixel’s coordinates and color.</span></div>
</section>
<section id="contents" aria-labelledby="contents-h">
  <div class="section-head"><div><p class="eyebrow">// the course</p><h2 id="contents-h">Contents</h2></div><a class="btn" href="reference.html">GLSL reference</a></div>
  {"".join(parts_html)}
</section>
<section aria-labelledby="shelf-h">
  <div class="section-head"><div><p class="eyebrow">// the wider world</p><h2 id="shelf-h">The shelf</h2></div></div>
  <div class="links">
    <a href="https://thebookofshaders.com/" target="_blank" rel="noopener"><b>The Book of Shaders</b><span>The classic free book by Patricio Gonzalez Vivo and Jen Lowe.</span></a>
    <a href="https://iquilezles.org/articles/" target="_blank" rel="noopener"><b>Inigo Quilez: articles</b><span>Distance functions, noise, lighting. The reference shelf.</span></a>
    <a href="https://www.shadertoy.com/" target="_blank" rel="noopener"><b>Shadertoy</b><span>Where shader people share. Every example here runs there unchanged.</span></a>
    <a href="https://www.youtube.com/watch?v=f4s1h2YETNY" target="_blank" rel="noopener"><b>kishimisu: Intro to Shader Art Coding</b><span>Twenty minutes; pairs with Chapter 12.</span></a>
    <a href="https://graphtoy.com/" target="_blank" rel="noopener"><b>Graphtoy</b><span>See the shape of any function.</span></a>
    <a href="https://genuary.art/" target="_blank" rel="noopener"><b>Genuary</b><span>31 prompts for code art every January.</span></a>
  </div>
</section>
<footer class="site-foot"><span>A static site: nothing you do here is stored or sent anywhere.</span><span>Code examples follow Shadertoy’s conventions.</span></footer>
</div></div>'''
    (OUT / 'index.html').write_text(page('Shader Fragments · learn GLSL shaders from first principles', home_body, '.', 'home', 'A course in GLSL shaders from first principles: every idea explained from zero, every example live.', current='contents'))
    (OUT / '.nojekyll').write_text('')
    print(f'built {len(chapters)} chapters, {len(all_examples)} examples, {sum(len(g["entries"]) for g in reference_data.GROUPS)} reference entries -> {OUT}')


if __name__ == '__main__':
    build()
