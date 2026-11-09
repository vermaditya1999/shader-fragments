"""GLSL reference for Shader Fragments.

Each entry: key (anchor + tooltip trigger), sig (how it is written), short (one line),
long (paragraphs, HTML allowed), example (optional GLSL).
Keys starting with g- or e- are glossary / error entries and never trigger code tooltips.
"""

GROUPS = [
{
 "id": "inputs", "title": "What the runner gives you (Shadertoy inputs)",
 "intro": "These names are not part of GLSL itself. They are a convention from Shadertoy that this site follows: the program that runs your shader (the runner, built from scratch in Chapter 18) declares them and fills them in before every frame.",
 "entries": [
  {"key": "mainImage", "sig": "void mainImage(out vec4 fragColor, in vec2 fragCoord)", "short": "The function the runner calls once for every pixel. You write it; you never call it.",
   "long": ["Its job is to read <code>fragCoord</code> (where this pixel is) and write <code>fragColor</code> (what color it should be). The runner wraps it in GLSL's real entry point, <code>main()</code>, which calls <code>mainImage</code> for the pixel being drawn."],
   "example": "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    fragColor = vec4(1.0, 0.5, 0.0, 1.0);   // every pixel: orange\n}"},
  {"key": "fragCoord", "sig": "in vec2 fragCoord", "short": "This pixel's position, in pixels. (0, 0) is the bottom-left corner; pixel centers sit at .5.",
   "long": ["x grows to the right and y grows upward, which is the opposite of p5.js, where y grows downward. The bottom-left pixel's center is (0.5, 0.5). On high-density screens these are device pixels, so there can be twice as many as CSS pixels.", "Chapter 3 is all about turning fragCoord into nicer coordinates."]},
  {"key": "fragColor", "sig": "out vec4 fragColor", "short": "Where you write this pixel's color: (red, green, blue, alpha), each from 0.0 to 1.0.",
   "long": ["Values above 1.0 show as 1.0 and values below 0.0 show as 0.0. Alpha is ignored on this site's canvases, so write 1.0."]},
  {"key": "iResolution", "sig": "uniform vec3 iResolution", "short": "The canvas size in pixels: iResolution.x is the width, iResolution.y the height.",
   "long": ["The z component is the pixel aspect ratio, which is always 1.0 in practice. Divide by iResolution to make your shader independent of the canvas size: <code>fragCoord / iResolution.xy</code> runs from 0 to 1 across the canvas."]},
  {"key": "iTime", "sig": "uniform float iTime", "short": "Seconds since the shader started. The heart of every animation.",
   "long": ["It is the same for every pixel in a frame and grows every frame. Pausing the workbench freezes it; restart sets it back to 0."]},
  {"key": "iTimeDelta", "sig": "uniform float iTimeDelta", "short": "How many seconds the previous frame took (about 0.0167 at 60 frames per second)."},
  {"key": "iFrame", "sig": "uniform int iFrame", "short": "The frame number: 0 on the first frame, then 1, 2, 3…",
   "long": ["Simulations use <code>if (iFrame == 0)</code> to set up their starting state."]},
  {"key": "iMouse", "sig": "uniform vec4 iMouse", "short": "The mouse, in pixels: xy is where you are dragging, zw is where the drag started.",
   "long": ["z and w are positive while the button is held and turn negative when you let go, so <code>iMouse.z &gt; 0.0</code> means \"the mouse is pressed\". Before any click, iMouse is all zeros. Convert it to centered coordinates the same way as fragCoord."]},
  {"key": "iChannel0", "sig": "uniform sampler2D iChannel0", "short": "An input image. On this site: a buffer's previous frame, or the sound texture.",
   "long": ["In a Buffer A pass, iChannel0 is Buffer A's own previous frame (Chapter 15). In the Image pass of a simulation, it is Buffer A's newest frame. In music examples, it is a 512×2 texture of the sound (Chapter 16). Read it with <code>texture()</code> or <code>texelFetch()</code>."]},
  {"key": "iChannel1", "sig": "uniform sampler2D iChannel1", "short": "A second input image. On this site it carries the sound texture in music examples."},
  {"key": "iDate", "sig": "uniform vec4 iDate", "short": "Today's date: (year, month starting at 0, day, seconds since midnight)."}
 ]
},
{
 "id": "types", "title": "Types",
 "intro": "Every value in GLSL has a type, and GLSL never converts between types silently. Most errors beginners meet are type errors, so this section is worth reading slowly.",
 "entries": [
  {"key": "float", "sig": "float", "short": "A number with a fractional part, like 0.5, 3.0 or -2.25. Most shader math uses floats.",
   "long": ["Always write the decimal point: <code>1.0</code>, not <code>1</code>. Without it the number is an int, and GLSL refuses to mix the two. Floats have about 7 significant digits of precision (Chapter 17)."], "example": "float r = 0.5;\nfloat big = 2.0 * r;   // 1.0"},
  {"key": "int", "sig": "int", "short": "A whole number, like 0, 7 or -3. Used for counters and indexes.",
   "long": ["Integer division drops the fraction: <code>7 / 2</code> is 3. Convert with <code>float(i)</code> when you need it in float math."], "example": "for (int i = 0; i < 4; i++) {\n    float f = float(i) * 0.25;\n}"},
  {"key": "bool", "sig": "bool", "short": "true or false. The result of comparisons like a < b.",
   "long": ["Use bools in <code>if</code> conditions and with <code>? :</code>. To turn a comparison into 0.0 or 1.0 for math, <code>step()</code> is usually neater."]},
  {"key": "vec2", "sig": "vec2", "short": "Two floats bundled together: a 2D position, a direction, or any pair.",
   "long": ["Read the parts with .x and .y. Math on vec2s works part by part: <code>vec2(1.0, 2.0) + vec2(3.0, 4.0)</code> is <code>vec2(4.0, 6.0)</code>."], "example": "vec2 p = vec2(0.5, -0.25);\nfloat d = length(p);"},
  {"key": "vec3", "sig": "vec3", "short": "Three floats: a color (r, g, b), a 3D position, or a 3D direction.",
   "long": [".x .y .z and .r .g .b name the same three slots. <code>vec3(0.5)</code> fills all three with 0.5."]},
  {"key": "vec4", "sig": "vec4", "short": "Four floats. fragColor is a vec4: red, green, blue, alpha.",
   "long": ["Build one from a color and an alpha: <code>vec4(col, 1.0)</code>, where col is a vec3."]},
  {"key": "ivec2", "sig": "ivec2", "short": "Two ints. Used for exact pixel positions, for example with texelFetch.",
   "long": ["Convert from a vec2 with <code>ivec2(fragCoord)</code>, which drops the fractions."]},
  {"key": "mat2", "sig": "mat2", "short": "A 2×2 matrix: four numbers that transform 2D vectors, most often a rotation.",
   "long": ["GLSL fills matrices column by column: <code>mat2(a, b, c, d)</code> has first column (a, b) and second column (c, d). <code>m * v</code> transforms v; <code>v * m</code> uses the transposed matrix, which for a rotation means rotating the other way. Chapter 9 builds rotation matrices from scratch."], "example": "mat2 rot(float a) {\n    float c = cos(a), s = sin(a);\n    return mat2(c, -s, s, c);\n}"},
  {"key": "mat3", "sig": "mat3", "short": "A 3×3 matrix, for 3D transforms such as rotating a camera."},
  {"key": "sampler2D", "sig": "sampler2D", "short": "A handle to an image (a texture) that you read with texture() or texelFetch().",
   "long": ["You cannot make one yourself; the runner provides them as iChannel0 and iChannel1."]},
  {"key": "void", "sig": "void", "short": "\"Nothing\": a function marked void returns no value.",
   "long": ["mainImage is void because its answer leaves through the <code>out</code> parameter fragColor, not through return."]}
 ]
},
{
 "id": "vectors", "title": "Building and reading vectors",
 "intro": "Vectors are the core of GLSL. These rules cover nearly everything you will do with them.",
 "entries": [
  {"key": "constructor", "sig": "vec3(1.0, 0.5, 0.0) · vec3(0.5) · vec4(col, 1.0)", "short": "Make a vector by listing its parts. The count must add up exactly.",
   "long": ["One number fills every slot. Smaller vectors can be combined: a vec2 and a float make a vec3, a vec3 and a float make a vec4. Too few or too many values is an error."], "example": "vec3 grey = vec3(0.5);              // (0.5, 0.5, 0.5)\nvec4 c = vec4(grey, 1.0);           // (0.5, 0.5, 0.5, 1.0)\nvec3 p = vec3(uv, 0.0);             // uv is a vec2"},
  {"key": "swizzle", "sig": "v.x  v.yx  c.rgb  c.bgr  v.xxy", "short": "Pick, reorder or repeat a vector's parts by naming them after a dot.",
   "long": ["Three naming sets mean the same slots: x y z w, r g b a, s t p q. Use one set per swizzle (<code>v.xg</code> is an error). You can also assign through a swizzle: <code>col.rg = vec2(1.0);</code>."], "example": "vec3 col = vec3(1.0, 0.5, 0.0);\nvec3 swapped = col.bgr;    // (0.0, 0.5, 1.0)\nvec2 p = col.xy;           // (1.0, 0.5)"},
  {"key": "componentwise", "sig": "a + b · a * b · v * 2.0", "short": "Math on vectors happens part by part. A vector times a number scales every part.",
   "long": ["<code>vec2(1.0, 2.0) * vec2(3.0, 4.0)</code> is <code>vec2(3.0, 8.0)</code>, not a dot product. For the dot product use <code>dot()</code>. Most built-in functions also work part by part: <code>abs(vec2(-1.0, 2.0))</code> is <code>vec2(1.0, 2.0)</code>."]}
 ]
},
{
 "id": "operators", "title": "Operators",
 "intro": "The usual arithmetic, with two GLSL twists: both sides must have matching types, and it all works on vectors.",
 "entries": [
  {"key": "arithmetic", "sig": "+  -  *  /", "short": "Add, subtract, multiply, divide. * and / happen before + and -.",
   "long": ["Use parentheses when in doubt. Dividing a float by 0.0 gives infinity or NaN (Chapter 19). For the remainder of a float division use <code>mod()</code>."]},
  {"key": "assignment", "sig": "=  +=  -=  *=  /=", "short": "Store a value. x += 2.0 is short for x = x + 2.0."},
  {"key": "increment", "sig": "i++  i--", "short": "Add or subtract 1. Mostly used on loop counters."},
  {"key": "comparison", "sig": "<  <=  >  >=  ==  !=", "short": "Compare two numbers and get a bool.",
   "long": ["Comparing whole vectors with == is allowed (true only if every part matches), but < and > only work on single numbers."]},
  {"key": "logic", "sig": "&&  ||  !", "short": "And, or, not, for bools."},
  {"key": "ternary", "sig": "condition ? a : b", "short": "Choose a value: if the condition is true, a; otherwise b.",
   "example": "vec3 col = d < 0.0 ? vec3(1.0) : vec3(0.0);"},
  {"key": "matrix-multiply", "sig": "m * v  ·  v * m", "short": "Multiplying a matrix and a vector transforms the vector (Chapter 9)."}
 ]
},
{
 "id": "keywords", "title": "Keywords and qualifiers",
 "intro": "Words that control how variables behave and how the code flows.",
 "entries": [
  {"key": "const", "sig": "const float PI = 3.14159;", "short": "A value that never changes. Good for names you reuse."},
  {"key": "in", "sig": "in", "short": "A function input. The function gets a copy and can't change the caller's value. Parameters are in by default."},
  {"key": "out", "sig": "out", "short": "A function output. The function must write it; the caller receives the value.",
   "long": ["fragColor is an out parameter: you write the color, the runner receives it."]},
  {"key": "inout", "sig": "inout", "short": "Both: the function receives the value, may change it, and the caller sees the change."},
  {"key": "uniform", "sig": "uniform", "short": "A value set from outside the shader, the same for every pixel in a frame, like iTime.",
   "long": ["\"Uniform\" means it is uniform across all pixels. You can read uniforms but never assign to them."]},
  {"key": "precision", "sig": "precision highp float;", "short": "Sets how precise floats are. The runner adds this line for you.",
   "long": ["highp is 32-bit floats; mediump and lowp are cheaper but much less precise. Chapter 17 explains why precision matters."]},
  {"key": "highp", "sig": "highp · mediump · lowp", "short": "Precision levels for floats and ints, from most to least precise."},
  {"key": "return", "sig": "return value;", "short": "Leave a function, handing back a value (or nothing, in a void function)."},
  {"key": "if", "sig": "if (condition) { … } else { … }", "short": "Run code only when a condition is true.",
   "long": ["Branches are allowed but every pixel in a group runs both sides when neighbours disagree, so heavy branches can be slow (Chapter 17)."]},
  {"key": "else", "sig": "else", "short": "The alternative branch of an if."},
  {"key": "for", "sig": "for (int i = 0; i < 8; i++) { … }", "short": "Repeat code a number of times, with a counter.",
   "long": ["Keep loops simple: a counter, a limit and a step. Every pixel runs its own copy of the loop, so a loop of 100 steps costs 100 times as much per pixel."]},
  {"key": "while", "sig": "while (condition) { … }", "short": "Repeat while a condition holds. Rare in shaders; a for loop with a limit is safer."},
  {"key": "break", "sig": "break;", "short": "Leave the loop right now. Raymarching uses it when a ray hits something."},
  {"key": "continue", "sig": "continue;", "short": "Skip to the next round of the loop."},
  {"key": "discard", "sig": "discard;", "short": "Throw this pixel away without writing a color. Not needed in this course."},
  {"key": "true", "sig": "true · false", "short": "The two bool values."},
  {"key": "define", "sig": "#define NAME value", "short": "A text substitution done before compiling: every NAME becomes value.",
   "example": "#define PI 3.14159265\n#define TAU 6.28318530"}
 ]
},
{
 "id": "trig", "title": "Built-ins: angles and waves",
 "intro": "All angles are in radians: a full turn is 2π ≈ 6.28318. Chapter 5 builds these from the unit circle.",
 "entries": [
  {"key": "radians", "sig": "radians(degrees)", "short": "Convert degrees to radians: degrees × π / 180."},
  {"key": "degrees", "sig": "degrees(radians)", "short": "Convert radians to degrees: radians × 180 / π."},
  {"key": "sin", "sig": "sin(angle)", "short": "The y of a point on the unit circle at this angle. Swings between -1 and 1 forever.",
   "long": ["Feed it a growing number (like iTime) and you get a smooth, endless back-and-forth. <code>0.5 + 0.5 * sin(x)</code> squeezes it into 0 to 1."], "example": "float pulse = 0.5 + 0.5 * sin(iTime);"},
  {"key": "cos", "sig": "cos(angle)", "short": "The x of a point on the unit circle at this angle. Like sin, shifted a quarter turn."},
  {"key": "tan", "sig": "tan(angle)", "short": "sin / cos. Shoots to infinity at quarter turns, so it is rarely used for visuals."},
  {"key": "asin", "sig": "asin(x)", "short": "The angle whose sine is x. Input -1 to 1, output -π/2 to π/2."},
  {"key": "acos", "sig": "acos(x)", "short": "The angle whose cosine is x. Input -1 to 1, output 0 to π.",
   "long": ["Combined with dot(): the angle between two unit vectors is <code>acos(dot(a, b))</code>."]},
  {"key": "atan", "sig": "atan(y, x)  ·  atan(y_over_x)", "short": "The angle of the point (x, y) around the origin, from -π to π. Note: y comes first.",
   "long": ["The two-argument version knows which quarter of the plane the point is in, so it covers the full circle. It is undefined at (0, 0). The one-argument version only returns -π/2 to π/2. Chapter 10 uses atan to build polar coordinates."], "example": "float angle = atan(uv.y, uv.x);   // -3.14 .. 3.14"}
 ]
},
{
 "id": "exponential", "title": "Built-ins: powers and roots",
 "intro": "Curves that bend: easing, falloff, glow.",
 "entries": [
  {"key": "pow", "sig": "pow(x, y)", "short": "x to the power y. Undefined when x is negative, or when x is 0 and y ≤ 0.",
   "long": ["<code>pow(x, 2.0)</code> curves a 0..1 ramp down (slow start), <code>pow(x, 0.5)</code> curves it up. Use <code>x * x</code> for squares: it's exact and works for negative x."]},
  {"key": "exp", "sig": "exp(x)", "short": "e to the power x. exp(-x) is a smooth falloff from 1 toward 0, great for glows and fog."},
  {"key": "log", "sig": "log(x)", "short": "The natural logarithm, the inverse of exp. Undefined for x ≤ 0."},
  {"key": "exp2", "sig": "exp2(x)", "short": "2 to the power x."},
  {"key": "log2", "sig": "log2(x)", "short": "The power of 2 that gives x. Undefined for x ≤ 0."},
  {"key": "sqrt", "sig": "sqrt(x)", "short": "Square root. Undefined for negative x.", "long": ["length() is a square root of a sum of squares (Pythagoras)."]},
  {"key": "inversesqrt", "sig": "inversesqrt(x)", "short": "1 / sqrt(x), often faster. Undefined for x ≤ 0."}
 ]
},
{
 "id": "common", "title": "Built-ins: shaping and rounding",
 "intro": "The everyday toolbox. Chapter 4 plots every one of these. They all work part by part on vectors too.",
 "entries": [
  {"key": "abs", "sig": "abs(x)", "short": "Drop the minus sign: abs(-3.0) is 3.0. Folds negative values onto positive ones.",
   "long": ["On coordinates, <code>abs(p)</code> mirrors space (Chapter 10). On a distance, <code>abs(d)</code> turns a filled shape into an outline (Chapter 8)."]},
  {"key": "sign", "sig": "sign(x)", "short": "-1.0 for negative x, 0.0 for zero, 1.0 for positive x."},
  {"key": "floor", "sig": "floor(x)", "short": "Round down to a whole number: floor(2.7) is 2.0, floor(-0.5) is -1.0.",
   "long": ["<code>floor(uv * 10.0)</code> tells each pixel which tile of a 10×10 grid it is in (Chapter 10)."]},
  {"key": "ceil", "sig": "ceil(x)", "short": "Round up: ceil(2.1) is 3.0."},
  {"key": "round", "sig": "round(x)", "short": "Round to the nearest whole number. Which way 0.5 goes is up to the GPU."},
  {"key": "trunc", "sig": "trunc(x)", "short": "Drop the fraction, toward zero: trunc(-2.7) is -2.0."},
  {"key": "isnan", "sig": "isnan(x)", "short": "True if x is NaN, \"not a number\", the result of math with no answer, like sqrt(-1.0).",
   "long": ["NaN spreads through every calculation it touches and fails every comparison, so a single one can blacken a picture. Use isnan to find and flag it while debugging (Chapters 17 and 19). Some drivers assume NaN never happens and optimize this check away, so treat a false answer with a little suspicion."],
   "example": "if (isnan(v)) col = vec3(1.0, 0.0, 1.0);   // show NaN in magenta"},
  {"key": "isinf", "sig": "isinf(x)", "short": "True if x is positive or negative infinity, for example after dividing by zero.",
   "long": ["Infinity turns into NaN as soon as it meets 0.0 * inf or inf - inf. Chapter 19 shows how to guard against both."]},
  {"key": "fract", "sig": "fract(x)", "short": "Keep only the part after the decimal point: fract(3.25) is 0.25. Equals x - floor(x).",
   "long": ["Because it repeats from 0 to 1 over and over, <code>fract</code> is the engine of repetition: <code>fract(uv * 5.0)</code> makes a 5×5 grid of copies."]},
  {"key": "mod", "sig": "mod(x, y)", "short": "The remainder after dividing by y: x - y × floor(x / y). Repeats every y.",
   "long": ["Unlike % in many languages, the result always has the sign of y, so mod(-1.0, 3.0) is 2.0. For ints, use %."]},
  {"key": "min", "sig": "min(a, b)", "short": "The smaller of two values. On distances, min joins two shapes into one (a union)."},
  {"key": "max", "sig": "max(a, b)", "short": "The larger of two values. On distances, max keeps only the overlap (an intersection)."},
  {"key": "clamp", "sig": "clamp(x, lo, hi)", "short": "Keep x between lo and hi: below lo becomes lo, above hi becomes hi.",
   "example": "float t = clamp(x, 0.0, 1.0);   // a safe 0..1 value"},
  {"key": "mix", "sig": "mix(a, b, t)", "short": "Slide from a to b: a + (b - a) × t. At t = 0 you get a, at t = 1 you get b.",
   "long": ["Works on numbers, colors and positions. t can be outside 0..1, which goes past a or b. Chapter 4 derives it."], "example": "vec3 col = mix(vec3(0.1, 0.2, 0.6), vec3(1.0, 0.6, 0.2), uv.x);"},
  {"key": "step", "sig": "step(edge, x)", "short": "A hard switch: 0.0 when x is below edge, 1.0 when x reaches it.",
   "long": ["Note the order: the edge comes first. <code>step(0.5, uv.x)</code> is black on the left half and white on the right."]},
  {"key": "smoothstep", "sig": "smoothstep(edge0, edge1, x)", "short": "A soft switch: 0.0 below edge0, 1.0 above edge1, and a smooth S-curve in between.",
   "long": ["The curve is t·t·(3 − 2t), where t is x rescaled to 0..1 between the edges. It starts and ends flat. The edges must satisfy edge0 &lt; edge1; to go the other way, use <code>1.0 - smoothstep(...)</code>. Used for soft edges and anti-aliasing (Chapters 4 and 8)."], "example": "float circle = 1.0 - smoothstep(0.49, 0.5, length(uv));"}
 ]
},
{
 "id": "geometric", "title": "Built-ins: vectors and geometry",
 "intro": "Lengths, directions and angles. Chapter 7 derives all of these.",
 "entries": [
  {"key": "length", "sig": "length(v)", "short": "How long a vector is: sqrt(x² + y²) in 2D. length(p) is p's distance from the origin.",
   "example": "float d = length(uv);   // distance from the center"},
  {"key": "distance", "sig": "distance(a, b)", "short": "The distance between two points. The same as length(b - a)."},
  {"key": "dot", "sig": "dot(a, b)", "short": "Multiply matching parts and add them up: a.x·b.x + a.y·b.y. Measures how much two directions agree.",
   "long": ["For two unit vectors, dot is the cosine of the angle between them: 1 when they point the same way, 0 at right angles, -1 when opposite. It drives lighting (Chapter 13) and projections (Chapter 8)."]},
  {"key": "cross", "sig": "cross(a, b)", "short": "For two 3D vectors, a new vector at right angles to both. Used to build cameras."},
  {"key": "normalize", "sig": "normalize(v)", "short": "The same direction, made exactly 1 long: v / length(v). Undefined for a zero vector.",
   "long": ["Use it whenever only the direction matters, like a ray direction or a surface normal."]},
  {"key": "reflect", "sig": "reflect(I, N)", "short": "Bounce direction I off a surface with normal N, like a mirror: I - 2·dot(N, I)·N."},
  {"key": "refract", "sig": "refract(I, N, eta)", "short": "Bend direction I as it passes into glass or water. eta is the ratio of refractive indices."}
 ]
},
{
 "id": "textures", "title": "Built-ins: reading images",
 "intro": "Chapter 15 explains textures, filtering and buffers from scratch.",
 "entries": [
  {"key": "texture", "sig": "texture(sampler, uv)", "short": "Read a color from an image at uv, where (0, 0) is one corner and (1, 1) the other.",
   "long": ["Between pixels the GPU blends neighbours (linear filtering) unless the image is set to nearest. Outside 0..1 the image repeats or clamps, depending on its settings."], "example": "vec3 last = texture(iChannel0, fragCoord / iResolution.xy).rgb;"},
  {"key": "texelFetch", "sig": "texelFetch(sampler, ivec2 pixel, 0)", "short": "Read one exact pixel of an image by its integer position. No blending.",
   "long": ["The last argument is the mipmap level; always 0 here. Used by the Game of Life (Chapter 15)."]},
  {"key": "textureSize", "sig": "textureSize(sampler, 0)", "short": "An image's size in pixels, as an ivec2."}
 ]
},
{
 "id": "derivatives", "title": "Built-ins: how fast things change",
 "intro": "Pixels are computed in little 2×2 groups, which lets the GPU compare a value with the neighbouring pixel.",
 "entries": [
  {"key": "dFdx", "sig": "dFdx(v)", "short": "How much v changes from this pixel to the next one to the right."},
  {"key": "dFdy", "sig": "dFdy(v)", "short": "How much v changes from this pixel to the next one up."},
  {"key": "fwidth", "sig": "fwidth(v)", "short": "abs(dFdx(v)) + abs(dFdy(v)): roughly how much v changes across one pixel.",
   "long": ["Perfect for anti-aliasing: <code>smoothstep(-w, w, d)</code> with <code>w = fwidth(d)</code> blurs an edge over exactly one pixel, at any zoom level (Chapter 8)."]}
 ]
},
{
 "id": "errors", "title": "Error messages, decoded",
 "intro": "Compilers speak in a terse dialect. These are the messages you will see most, translated. The line number in the message is the line in your editor.",
 "entries": [
  {"key": "e-int-float", "sig": "cannot convert from 'const int' to 'highp float'", "short": "You wrote a whole number where a float was needed. Write 1.0 instead of 1.",
   "example": "float x = 1;     // error\nfloat x = 1.0;   // fine"},
  {"key": "e-undeclared", "sig": "'name' : undeclared identifier", "short": "That name doesn't exist yet: a typo, a capital letter, or a variable used before (or outside) where it is declared."},
  {"key": "e-syntax", "sig": "syntax error", "short": "Punctuation. Usually a missing ; on this line or the one above, or a bracket that never closes."},
  {"key": "e-operands", "sig": "wrong operand types – no operation '*' exists that takes…", "short": "You combined two types that don't go together, such as vec2 * vec3 or float + int."},
  {"key": "e-overload", "sig": "no matching overloaded function found", "short": "A function got the wrong number or kinds of arguments, such as mix(vec3, float, float)."},
  {"key": "e-constructor", "sig": "constructor : not enough data provided for construction", "short": "A vector was given too few (or too many) values: vec3 needs three, vec4 needs four."},
  {"key": "e-reserved", "sig": "'smooth' : Illegal use of reserved word", "short": "Some ordinary-looking words are reserved in GLSL: smooth, flat, sample, filter, input, output, half, active, common. Rename the variable."},
  {"key": "e-redefinition", "sig": "'d' : redefinition", "short": "The same name was declared twice in one block. Write d = … the second time, without float in front."},
  {"key": "e-lvalue", "sig": "l-value required", "short": "You tried to change something read-only, such as iTime or a const."},
  {"key": "e-mainimage", "sig": "mainImage is missing or misspelled", "short": "The runner looks for exactly mainImage(out vec4 fragColor, in vec2 fragCoord). Check its spelling and parameters."}
 ]
},
{
 "id": "glossary", "title": "Glossary",
 "intro": "The words around the code.",
 "entries": [
  {"key": "g-pixel", "sig": "pixel", "short": "One dot of the screen, made of a red, a green and a blue light. Its color is three numbers."},
  {"key": "g-shader", "sig": "shader", "short": "A small program that runs on the GPU. A fragment shader decides the color of each pixel."},
  {"key": "g-gpu", "sig": "GPU", "short": "The graphics processor: thousands of simple cores that run the same program on many pixels at once."},
  {"key": "g-fragment", "sig": "fragment", "short": "The GPU's word for one pixel-sized piece of a shape being drawn. In this course, a fragment is a pixel."},
  {"key": "g-glsl", "sig": "GLSL", "short": "The OpenGL Shading Language. This site uses GLSL ES 3.00, the version in WebGL 2."},
  {"key": "g-uv", "sig": "uv", "short": "The usual name for normalized coordinates, typically 0 to 1 across the canvas. The letters come from texture coordinates."},
  {"key": "g-vertex-shader", "sig": "vertex shader", "short": "The program that positions the corners of shapes. Here it only draws one triangle that covers the screen."},
  {"key": "g-rasterization", "sig": "rasterization", "short": "The GPU step that works out which pixels a triangle covers, so the fragment shader can run on each."},
  {"key": "g-varying", "sig": "varying (in/out between stages)", "short": "A value the vertex shader passes to the fragment shader, blended smoothly across the triangle."},
  {"key": "g-sdf", "sig": "SDF (signed distance function)", "short": "A function that returns the distance from a point to a shape: negative inside, zero on the edge, positive outside."},
  {"key": "g-normal", "sig": "normal", "short": "The direction a surface faces, as a unit vector pointing straight out of it."},
  {"key": "g-unit-vector", "sig": "unit vector", "short": "A vector whose length is exactly 1, so it describes a direction only."},
  {"key": "g-radian", "sig": "radian", "short": "The angle at which the arc on a circle is as long as its radius. A full turn is 2π radians."},
  {"key": "g-interpolation", "sig": "interpolation", "short": "Filling in values between known ones, for example sliding linearly from a to b with mix()."},
  {"key": "g-aliasing", "sig": "aliasing / anti-aliasing", "short": "Jagged edges caused by each pixel being entirely in or out. Anti-aliasing blends the edge over about one pixel."},
  {"key": "g-hash", "sig": "hash", "short": "A function that scrambles its input into a random-looking number. Same input, same output."},
  {"key": "g-noise", "sig": "noise", "short": "Smooth randomness: random values on a grid, blended so there are no hard edges."},
  {"key": "g-octave", "sig": "octave", "short": "One layer of noise in fBm. Each octave has double the detail and half the strength of the last."},
  {"key": "g-texture", "sig": "texture / texel", "short": "An image the GPU can read. A texel is one pixel of a texture."},
  {"key": "g-framebuffer", "sig": "framebuffer", "short": "Something the GPU can draw into: the screen, or a texture that a later pass reads."},
  {"key": "g-ping-pong", "sig": "ping-pong", "short": "Using two textures in turns: read last frame from one while writing this frame into the other, then swap."},
  {"key": "g-raymarching", "sig": "raymarching / sphere tracing", "short": "Rendering 3D by walking along a ray in steps, each as long as the distance to the nearest surface."},
  {"key": "g-fft", "sig": "FFT", "short": "Fast Fourier Transform: turns a stretch of sound into the amounts of each frequency in it."},
  {"key": "g-nan", "sig": "NaN / Inf", "short": "\"Not a number\" and infinity: what you get from 0.0 / 0.0, sqrt(-1.0) or 1.0 / 0.0. They spread through any math they touch."},
  {"key": "g-epsilon", "sig": "epsilon", "short": "A tiny number used as \"close enough\", because floats are rarely exactly equal."},
  {"key": "g-gamma", "sig": "gamma", "short": "Screens don't show brightness linearly. Gamma correction converts linear light math into values that look right."}
 ]
}
]
