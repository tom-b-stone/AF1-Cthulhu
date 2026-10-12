"use client";

import { useEffect, useRef } from "react";

// Animated ASCII "Ktulu" mark for the dashboard. Pure WebGL, no libraries:
// a fragment shader draws a procedural Cthulhu-ish figure (ridged dome,
// glowing eyes with pupils, nine swaying suckered tentacles, veined wings,
// clawed arms) as signed distance fields with noise shading, then
// ASCII-fies it the classic way — the screen is split into character
// cells, each cell's brightness picks a glyph from an atlas sorted by ink
// density, and the glyph is drawn in the cell. Same idea as three.js's
// AsciiEffect / the usual Shadertoy ASCII post-process, self-contained.
// Original figure, not a copy of any existing art.

// 70-step density ramp (the classic one), light → dark.
const GLYPHS = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const CELL = 6; // px per character cell

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform sampler2D u_atlas;
uniform float u_glyphs;
uniform float u_cell;
uniform vec3 u_fg;
uniform vec3 u_eye;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 17.0; a *= 0.5; }
  return v;
}
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdEllipse(vec2 p, vec2 r){ return (length(p / r) - 1.0) * min(r.x, r.y); }
float sdSeg(vec2 p, vec2 a, vec2 b, float w){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - w;
}
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0=b-a, e1=c-b, e2=a-c, v0=p-a, v1=p-b, v2=p-c;
  vec2 pq0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.0,1.0);
  vec2 pq1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.0,1.0);
  vec2 pq2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.0,1.0);
  float s=sign(e0.x*e2.y-e0.y*e2.x);
  vec2 d=min(min(vec2(dot(pq0,pq0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(pq1,pq1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(pq2,pq2),s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }

// Tentacle: a chain of segments hanging from (x0,y0), swaying, tapering,
// curling at the tip. Returns distance; sucker channel via suck.
float tentacle(vec2 p, float x0, float y0, float len, float w0, float phase, float t, out float suck){
  float d = 1e9; suck = 1e9;
  vec2 a = vec2(x0, y0);
  float w = w0;
  float dir = sign(x0 + 0.001);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float k = (fi+1.0) / 8.0;
    float sway = (sin(t*0.9 + phase + fi*0.6) * 0.05 + sin(t*2.1 + phase*1.7 + fi*1.1) * 0.015) * k * k * 8.0 * len;
    float curl = dir * k*k*k * 0.3 * len;
    vec2 b = vec2(x0 + sway + curl, y0 - len * k);
    d = min(d, sdSeg(p, a, b, w));
    vec2 m = mix(a, b, 0.5);
    suck = min(suck, sdCircle(p - m - vec2(-dir*w*0.5, 0.0), w*0.3));
    a = b; w *= 0.85;
  }
  return d;
}

// Line-art renderer: a shape contributes its outline (a thin band around
// the zero level) plus sparse hatching inside, like an ink sketch.
float stroke(float d, float w){ return 1.0 - smoothstep(0.0, w, abs(d)); }
float inside(float d){ return 1.0 - smoothstep(-0.004, 0.004, d); }

vec3 scene(vec2 p, float t){
  p.y -= sin(t*0.8) * 0.01; // breathing
  vec2 q = vec2(abs(p.x), p.y);
  float sx = sign(p.x + 0.0001);

  // --- wings: three fingers from a root behind the shoulder, membrane between ---
  vec2 root = vec2(0.22, 0.45);
  vec2 f0 = vec2(1.15, 1.35), f1 = vec2(1.45, 0.75), f2 = vec2(1.35, 0.05);
  f0.x += 0.02*sin(t*0.7); f1.y += 0.02*sin(t*0.9 + 1.0);
  float bones = min(sdSeg(q, root, f0, 0.012), min(sdSeg(q, root, f1, 0.012), sdSeg(q, root, f2, 0.012)));
  float mem = min(sdTri(q, root, f0, f1), sdTri(q, root, f1, f2));
  // scalloped trailing edge: bite circles out of the membrane
  mem = max(mem, -sdCircle(q - mix(f0, f1, 0.5), 0.2));
  mem = max(mem, -sdCircle(q - mix(f1, f2, 0.5), 0.18));
  float veins = sdSeg(q, root, mix(f0, f1, 0.5), 0.004);
  veins = min(veins, sdSeg(q, root, mix(f1, f2, 0.5), 0.004));

  // --- head: tall dome, brow, sockets ---
  float lump = fbm(vec2(p.x*6.0, p.y*5.0 + t*0.02)) * 0.05;
  float head = sdEllipse(p - vec2(0.0, 0.95), vec2(0.27, 0.3)) + lump;
  head = smin(head, sdEllipse(p - vec2(0.0, 0.72), vec2(0.3, 0.2)), 0.1);
  float brow = sdSeg(p, vec2(-0.2, 0.98), vec2(0.2, 0.98), 0.03);
  head = smin(head, brow, 0.05);
  vec2 pe = vec2(q.x - 0.11, p.y - 0.92);
  float socket = sdEllipse(pe, vec2(0.07, 0.045));
  float eye = sdEllipse(pe, vec2(0.03, 0.02));

  // --- torso, hunched ---
  float torso = sdEllipse(p - vec2(0.0, 0.3), vec2(0.34, 0.42));
  torso = smin(torso, sdEllipse(p - vec2(0.0, 0.55), vec2(0.42, 0.16)), 0.12); // shoulders
  float fig = smin(head, torso, 0.12);

  // --- arms with claws, slightly raised ---
  float arms = 1e9;
  for (int side = 0; side < 2; side++) {
    float sx2 = side == 0 ? -1.0 : 1.0;
    vec2 sh = vec2(sx2*0.36, 0.55);
    vec2 el = vec2(sx2*0.68, 0.25 + 0.02*sin(t*1.3 + sx2));
    vec2 ha = vec2(sx2*0.62, -0.12 + 0.02*sin(t*1.1));
    arms = min(arms, sdSeg(p, sh, el, 0.065));
    arms = min(arms, sdSeg(p, el, ha, 0.05));
    for (int c = 0; c < 3; c++) {
      float fc = float(c) - 1.0;
      vec2 tip = ha + vec2(sx2*(0.06 + 0.07*fc), -0.16 + 0.05*abs(fc));
      arms = min(arms, sdSeg(p, ha, tip, 0.012));
    }
  }
  // --- legs, crouched, clawed feet ---
  float legs = 1e9;
  for (int side = 0; side < 2; side++) {
    float sx2 = side == 0 ? -1.0 : 1.0;
    vec2 hip = vec2(sx2*0.16, -0.05);
    vec2 knee = vec2(sx2*0.42, -0.45);
    vec2 foot = vec2(sx2*0.3, -0.95);
    legs = min(legs, sdSeg(p, hip, knee, 0.09));
    legs = min(legs, sdSeg(p, knee, foot, 0.07));
    for (int c = 0; c < 3; c++) {
      float fc = float(c) - 1.0;
      vec2 tip = foot + vec2(sx2*(0.12 + 0.08*fc), -0.09 + 0.03*abs(fc));
      legs = min(legs, sdSeg(p, foot, tip, 0.012));
    }
  }
  fig = smin(fig, arms, 0.04);
  fig = smin(fig, legs, 0.06);

  // --- face tentacles ---
  float ten = 1e9, suckAll = 1e9;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float x0 = mix(-0.2, 0.2, fi / 6.0);
    float s;
    ten = min(ten, tentacle(p, x0, 0.72 - abs(x0)*0.4, 0.62 - abs(x0)*0.4 + 0.06*sin(fi*2.3), 0.046, fi*1.9, t, s));
    suckAll = min(suckAll, s);
  }
  fig = min(fig, ten);

  // --- ink: outlines + sparse hatching ---
  float hatchN = fbm(p*11.0 + vec2(0.0, -t*0.1));
  float shade = clamp(0.5 - 0.5*(p.y*0.6 - p.x*0.8), 0.0, 1.0); // light from top-right
  float hatch = step(0.58 - shade*0.25, hatchN) * 0.4;

  float ink = stroke(fig, 0.024);
  ink = max(ink, inside(fig) * hatch);
  ink = max(ink, inside(fig) * (1.0 - smoothstep(-0.002, 0.004, suckAll)) * 0.55);
  ink = max(ink, inside(fig) * (1.0 - smoothstep(-0.005, 0.02, socket)) * 0.5);
  float wingInk = stroke(mem, 0.012) * (1.0 - inside(fig));
  wingInk = max(wingInk, stroke(bones, 0.012) * 0.9);
  wingInk = max(wingInk, stroke(veins, 0.008) * 0.5);
  wingInk = max(wingInk, inside(mem) * step(0.74, fbm(q*9.0 + t*0.05)) * 0.25);
  ink = max(ink, wingInk * (1.0 - inside(fig)));

  vec3 col = u_fg * ink;
  float glow = exp(-max(eye, 0.0) * 70.0) * (0.85 + 0.15*sin(t*2.2));
  col = mix(col, u_eye, clamp(glow, 0.0, 1.0));
  return col;
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy / u_cell);
  vec2 cellCentre = (cell + 0.5) * u_cell;
  vec2 p = (cellCentre - 0.5*u_res) / u_res.y * 2.9 + vec2(0.0, 0.18);

  vec3 col = scene(p, u_t);
  float lum = max(dot(col, vec3(0.299, 0.587, 0.114)), col.r * 0.8);

  // The characters never sit still: each cell drifts a step or two along
  // the density ramp a few times a second, and now and then a cell flips
  // to a random glyph — a living, "changing numbers" texture.
  float tick = floor(u_t * 7.0);
  float j = hash(cell + tick * 0.37) - 0.5;
  float flip = step(0.985, hash(cell * 1.7 + tick * 0.11));
  float base = clamp(lum, 0.0, 0.999) * u_glyphs;
  float idx = floor(clamp(base + j * 3.0 * step(0.02, lum), 0.0, u_glyphs - 1.0));
  idx = mix(idx, floor(hash(cell + tick) * u_glyphs), flip * step(0.02, lum));
  vec2 inCell = fract(gl_FragCoord.xy / u_cell);
  vec2 uv = vec2((idx + inCell.x) / u_glyphs, inCell.y);
  float ink = texture2D(u_atlas, uv).r;

  vec3 tint = lum > 0.0 ? col / max(lum, 1e-3) : u_fg;
  gl_FragColor = vec4(tint * ink * clamp(lum*1.1 + 0.3, 0.0, 1.0), 1.0);
}
`;

function makeAtlas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CELL * GLYPHS.length;
  c.height = CELL;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${CELL + 1}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (let i = 0; i < GLYPHS.length; i++) {
    ctx.fillText(GLYPHS[i], i * CELL + CELL / 2, CELL / 2 + 1);
  }
  return c;
}

export default function KtuluLogo({ height = 300, background = false }: { height?: number; background?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(u("u_atlas"), 0);
    gl.uniform1f(u("u_glyphs"), GLYPHS.length);
    gl.uniform1f(u("u_cell"), CELL);
    gl.uniform3f(u("u_fg"), 0.82, 0.83, 0.78);
    gl.uniform3f(u("u_eye"), 0.95, 0.3, 0.12);

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u("u_res"), w, h);
    };

    let raf = 0;
    const start = performance.now();
    const prefersStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = () => {
      resize();
      gl.uniform1f(u("u_t"), prefersStill ? 0 : (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!prefersStill) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (background) {
    // Full-bleed behind the page content, dimmed, never catches clicks.
    return (
      <canvas
        ref={ref}
        aria-hidden
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", opacity: 0.55, pointerEvents: "none", zIndex: 0 }}
      />
    );
  }
  return (
    <canvas
      ref={ref}
      aria-label="Ktulu ASCII mark"
      style={{ width: "100%", height, display: "block", background: "#0b0b0c", borderRadius: 8 }}
    />
  );
}
