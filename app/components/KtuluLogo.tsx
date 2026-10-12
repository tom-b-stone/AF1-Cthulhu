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
const CELL = 7; // px per character cell

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

// Tentacle: a chain of segments hanging from (x0,y0), swaying with two
// frequencies, tapering, with a sucker channel returned via suck.
float tentacle(vec2 p, float x0, float y0, float len, float phase, float t, out float suck){
  float d = 1e9; suck = 1e9;
  vec2 a = vec2(x0, y0);
  float w = 0.07;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float k = (fi+1.0) / 8.0;
    float sway = (sin(t*1.1 + phase + fi*0.7) * 0.06 + sin(t*2.3 + phase*1.7 + fi*1.3) * 0.02) * k * k * 9.0 * len;
    vec2 b = vec2(x0 + sway, y0 - len * k);
    d = min(d, sdSeg(p, a, b, w));
    // suckers: small discs along the inner side
    vec2 m = mix(a, b, 0.5);
    suck = min(suck, sdCircle(p - m - vec2(w*0.55, 0.0), w*0.3));
    a = b; w *= 0.84;
  }
  return d;
}

vec3 scene(vec2 p, float t){
  p.y -= sin(t*0.8) * 0.012; // breathing

  // --- wings: membrane + finger bones ---
  vec2 q = vec2(abs(p.x), p.y);
  float mem = sdTri(q, vec2(0.08, 0.1), vec2(1.15, 0.72), vec2(0.78, -0.3));
  float bone = 1e9;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 tip = mix(vec2(1.15, 0.72), vec2(0.78, -0.3), fi / 3.0);
    bone = min(bone, sdSeg(q, vec2(0.08, 0.1), tip, 0.012));
  }
  float veins = 0.5 + 0.5*sin(atan(q.y-0.1, q.x-0.08)*26.0 + fbm(q*6.0)*4.0);
  float memA = 1.0 - smoothstep(-0.005, 0.02, mem);
  float wingTex = 0.22 + 0.25*veins + 0.2*fbm(q*5.0 + t*0.05);
  float boneA = 1.0 - smoothstep(-0.005, 0.01, bone);
  float wings = max(memA * wingTex, boneA * 0.9);

  // --- head: dome with ridges, brow, cheeks ---
  float ridge = fbm(vec2(p.x*7.0, p.y*3.0 + t*0.03)) * 0.05;
  float head = sdEllipse(p - vec2(0.0, 0.27), vec2(0.38, 0.36)) + ridge;
  head = smin(head, sdEllipse(p - vec2(0.0, 0.05), vec2(0.46, 0.2)), 0.12);
  float brow = sdSeg(p, vec2(-0.28, 0.36), vec2(0.28, 0.36), 0.035);
  head = smin(head, brow, 0.06);

  // --- body, shoulders, arms with claws ---
  float body = sdEllipse(p - vec2(0.0, -0.55), vec2(0.3, 0.28));
  float shoulders = sdEllipse(p - vec2(0.0, -0.25), vec2(0.55, 0.12));
  float arms = 1e9;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec2 sh = vec2(sx*0.5, -0.25);
    vec2 el = vec2(sx*0.72, -0.55 + 0.02*sin(t*1.5 + sx));
    vec2 ha = vec2(sx*0.62, -0.85 + 0.02*sin(t*1.2));
    arms = min(arms, sdSeg(p, sh, el, 0.07));
    arms = min(arms, sdSeg(p, el, ha, 0.055));
    for (int c = 0; c < 3; c++) {
      float fc = float(c) - 1.0;
      vec2 tip = ha + vec2(sx*(0.1 + 0.06*fc), -0.14 + 0.04*abs(fc));
      arms = min(arms, sdSeg(p, ha, tip, 0.016));
    }
  }
  float fig = smin(head, shoulders, 0.15);
  fig = smin(fig, body, 0.2);
  fig = min(fig, arms);

  // --- nine tentacles from the lower face ---
  float ten = 1e9, suckAll = 1e9;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float x0 = -0.32 + fi * 0.08;
    float s;
    ten = min(ten, tentacle(p, x0, 0.0 - abs(x0)*0.4, 0.62 + 0.12*sin(fi*2.1), fi*1.7, t, s));
    suckAll = min(suckAll, s);
  }
  fig = smin(fig, ten, 0.04);

  // --- eyes: lid shape, iris glow, dark pupil ---
  vec2 pe = vec2(abs(p.x) - 0.15, p.y - 0.28);
  float eye = sdEllipse(pe, vec2(0.075, 0.05));
  float pupil = sdEllipse(pe - vec2(0.0, -0.005), vec2(0.018, 0.04));

  // --- shading ---
  float skin = fbm(p*14.0 + vec2(0.0, -t*0.2)) * 0.45 + noise(p*40.0) * 0.12;
  float figA = 1.0 - smoothstep(-0.015, 0.015, fig);
  float lightDir = clamp(0.95 + 0.25*(p.y + 0.2) - 0.25*p.x - skin*0.9, 0.18, 1.0);
  // rim light along the silhouette
  float rim = (1.0 - smoothstep(0.0, 0.05, abs(fig))) * 0.35;
  float suckA = 1.0 - smoothstep(-0.002, 0.006, suckAll);
  float b = figA * lightDir + rim;
  b = mix(b, b*0.35, suckA * figA);
  b = max(b, wings * (1.0 - figA));

  // faint fog behind everything
  float fog = fbm(p*2.5 + vec2(t*0.04, 0.0)) * 0.035 * (1.0 - figA) * (1.0 - memA);
  b = max(b, fog);

  vec3 col = u_fg * b;
  float glow = exp(-max(eye, 0.0) * 40.0) * (0.85 + 0.15*sin(t*2.2));
  col = mix(col, u_eye * 1.35, clamp(glow, 0.0, 1.0));
  col *= 1.0 - 0.85 * (1.0 - smoothstep(-0.002, 0.006, pupil));
  return col;
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy / u_cell);
  vec2 cellCentre = (cell + 0.5) * u_cell;
  vec2 p = (cellCentre - 0.5*u_res) / min(u_res.x, u_res.y) * 2.15 + vec2(0.0, 0.12);

  vec3 col = scene(p, u_t);
  float lum = max(dot(col, vec3(0.299, 0.587, 0.114)), col.r * 0.9);

  float idx = floor(clamp(lum, 0.0, 0.999) * u_glyphs);
  vec2 inCell = fract(gl_FragCoord.xy / u_cell);
  vec2 uv = vec2((idx + inCell.x) / u_glyphs, inCell.y);
  float ink = texture2D(u_atlas, uv).r;

  vec3 tint = lum > 0.0 ? col / max(lum, 1e-3) : u_fg;
  gl_FragColor = vec4(tint * ink * clamp(lum*1.3 + 0.4, 0.0, 1.0), 1.0);
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

export default function KtuluLogo({ height = 300 }: { height?: number }) {
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
    gl.uniform3f(u("u_fg"), 0.8, 0.82, 0.78);
    gl.uniform3f(u("u_eye"), 1.0, 0.27, 0.1);

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

  return (
    <canvas
      ref={ref}
      aria-label="Ktulu ASCII mark"
      style={{ width: "100%", height, display: "block", background: "#0b0b0c", borderRadius: 8 }}
    />
  );
}
