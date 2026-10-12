"use client";

import { useEffect, useRef } from "react";

// Animated ASCII "Ktulu" mark for the dashboard. Pure WebGL, no libraries:
// a fragment shader draws a procedural Cthulhu-ish figure (dome, glowing
// eyes, swaying tentacles, wings) as signed distance fields, then
// ASCII-fies it the classic way — the screen is split into character
// cells, each cell's brightness picks a glyph from an atlas sorted by ink
// density (" .:-=+*#%@"), and the glyph is drawn in the cell. Same idea
// as three.js's AsciiEffect / the usual Shadertoy ASCII post-process,
// just self-contained. Original figure, not a copy of any existing art.

const GLYPHS = " .:-=+*#%@";
const CELL = 8; // px per character cell (atlas glyph size)

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

// A tentacle: a chain of short segments hanging from (x0, y0), swaying.
float tentacle(vec2 p, float x0, float y0, float len, float phase, float t){
  float d = 1e9;
  vec2 a = vec2(x0, y0);
  float w = 0.075;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sway = sin(t*1.3 + phase + fi*0.9) * 0.07 * (fi+1.0) / 6.0 * len * 10.0;
    vec2 b = vec2(x0 + sway, y0 - len * (fi+1.0) / 6.0);
    d = min(d, sdSeg(p, a, b, w));
    a = b; w *= 0.82;
  }
  return d;
}

// Scene brightness 0..1 for a point in centred, aspect-corrected space.
vec3 scene(vec2 p, float t){
  // breathing
  p.y -= sin(t*0.8) * 0.012;

  // wings (behind everything)
  float wl = sdTri(p, vec2(-0.05, 0.05), vec2(-0.95, 0.55), vec2(-0.62, -0.25));
  float wr = sdTri(p, vec2( 0.05, 0.05), vec2( 0.95, 0.55), vec2( 0.62, -0.25));
  float wings = min(wl, wr);
  // membrane ribs
  float ribs = 0.5 + 0.5*sin(atan(p.y-0.05, abs(p.x)-0.05)*14.0);

  // head dome + cheeks
  float head = sdEllipse(p - vec2(0.0, 0.22), vec2(0.36, 0.34));
  head = smin(head, sdEllipse(p - vec2(0.0, 0.02), vec2(0.42, 0.2)), 0.12);
  // body
  float body = sdEllipse(p - vec2(0.0, -0.5), vec2(0.26, 0.22));
  float fig = smin(head, body, 0.2);

  // tentacles from the lower face
  float ten = 1e9;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float x0 = -0.28 + fi * 0.14;
    ten = min(ten, tentacle(p, x0, -0.02 - abs(x0)*0.35, 0.55 + 0.1*sin(fi*2.1), fi*1.7, t));
  }
  fig = smin(fig, ten, 0.05);

  // eyes
  float el = sdCircle(p - vec2(-0.15, 0.27), 0.06);
  float er = sdCircle(p - vec2( 0.15, 0.27), 0.06);
  float eyes = min(el, er);

  // shading: soft edge + surface noise so the ASCII has texture
  float n = noise(p*9.0 + vec2(0.0, -t*0.25)) * 0.35 + noise(p*23.0 + t*0.1) * 0.15;
  float figA = 1.0 - smoothstep(-0.02, 0.02, fig);
  float wingA = (1.0 - smoothstep(-0.01, 0.02, wings)) * (0.35 + 0.4*ribs);
  float light = clamp(0.8 + 0.3*(p.y + 0.3) - n*0.8, 0.3, 1.0);

  float b = max(figA * light, wingA * (1.0 - figA));
  // eye glow, pulsing
  float glow = exp(-max(eyes, 0.0) * 34.0) * (0.8 + 0.2*sin(t*2.2));
  vec3 col = u_fg * b;
  col = mix(col, u_eye * 1.3, clamp(glow, 0.0, 1.0));
  return col;
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy / u_cell);
  vec2 cellCentre = (cell + 0.5) * u_cell;
  vec2 p = (cellCentre - 0.5*u_res) / min(u_res.x, u_res.y) * 1.55;

  vec3 col = scene(p, u_t);
  float lum = max(dot(col, vec3(0.299, 0.587, 0.114)), col.r * 0.9);

  // pick glyph by brightness, draw it from the atlas
  float idx = floor(clamp(lum, 0.0, 0.999) * u_glyphs);
  vec2 inCell = fract(gl_FragCoord.xy / u_cell);
  vec2 uv = vec2((idx + inCell.x) / u_glyphs, inCell.y);
  float ink = texture2D(u_atlas, uv).r;

  vec3 tint = lum > 0.0 ? col / max(lum, 1e-3) : u_fg;
  gl_FragColor = vec4(tint * ink * clamp(lum*1.4 + 0.35, 0.0, 1.0), 1.0);
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
  ctx.font = `${CELL}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (let i = 0; i < GLYPHS.length; i++) {
    ctx.fillText(GLYPHS[i], i * CELL + CELL / 2, CELL / 2 + 1);
  }
  return c;
}

export default function KtuluLogo({ height = 260 }: { height?: number }) {
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
    gl.uniform3f(u("u_fg"), 0.78, 0.8, 0.76); // ash grey, reads as "paper" ASCII
    gl.uniform3f(u("u_eye"), 1.0, 0.27, 0.1); // the accent red

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Render 1:1 in CSS pixels so a cell stays a crisp CELL×CELL block.
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
