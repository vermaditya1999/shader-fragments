# Shader Fragments

A course in GLSL shaders from first principles: 20 long chapters, every idea explained from zero, every example running live in the page, and a full-size workbench next to the text.

It's a plain static website. There's no server, no build step needed to view it, no accounts and no storage: nothing you do on it is saved or sent anywhere.

## Read it

- **Online:** publish it with GitHub Pages (below), then open `https://YOUR-USERNAME.github.io/shader-fragments/`.
- **On your computer:** open `index.html` in a browser. Everything works from disk; the fonts load from Google Fonts when you're online and fall back to system fonts when you're not.

## Publish it on GitHub Pages

1. Create a new **public** repository on GitHub called `shader-fragments` (no README, no license, so it starts empty).
2. In a terminal:

   ```sh
   cd ~/Desktop/learning/shader-fragments
   git init -b main
   git add -A
   git commit -m "Shader Fragments"
   git remote add origin https://github.com/YOUR-USERNAME/shader-fragments.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose **main** and **/ (root)**, and save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/shader-fragments/`.

The empty `.nojekyll` file tells GitHub Pages to serve the files exactly as they are.

## What's inside

```
index.html          home page and table of contents
chapters/           the 20 chapters
reference.html      GLSL reference: every type, operator and built-in used in the course
playground.html     a full-size workbench
files/runner.html   the minimal shader runner built in Chapter 18
assets/             styles, scripts (engine, editor, widgets), thumbnails
source/             the sources the site is built from
```

## Change it

The pages are generated from `source/` by a small Python script (Python 3, no packages needed):

```sh
python3 source/build.py
```

- Chapters are in `source/chapters/NN-slug.html`: plain HTML with a few conventions documented at the top of `source/build.py` (live examples are `<script type="text/x-glsl" data-ex="id">` blocks).
- The reference entries are in `source/reference_data.py`.
- The workbench engine is `source/assets/engine.js`, the editor `source/assets/editor.js`, the interactive diagrams `source/assets/widgets.js`.

Edit, run the script, refresh the browser. To publish changes: `git add -A && git commit -m "..." && git push`.

## Credits

- Shader conventions (`mainImage`, `iTime`, `iResolution`, the audio texture layout) follow [Shadertoy](https://www.shadertoy.com/), so every example runs there unchanged.
- The piece built in Chapter 12 follows kishimisu's [An introduction to Shader Art Coding](https://www.youtube.com/watch?v=f4s1h2YETNY).
- Many techniques (cosine palettes, smooth minimum, soft shadows, domain warping, SDF formulas) were developed or popularized by [Inigo Quilez](https://iquilezles.org/articles/).
