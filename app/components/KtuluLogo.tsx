"use client";

import { useEffect, useRef } from "react";

// Full-page ASCII/halftone background. Pure WebGL, no libraries. Takes an
// image, splits the screen into character cells, and turns each cell's
// brightness into a glyph from a density-sorted atlas, tinted with the
// image's own colour and given a soft glow — so highlights burn into a
// grid of glowing characters while the dark areas stay black, the look of
// ascii-magic style renders. The characters never sit still: every cell
// drifts along the density ramp a few times a second and now and then
// flips to a random glyph. Honours prefers-reduced-motion (static frame).

const GLYPHS = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const CELL = 6;

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform vec2 u_img;      // image size in px
uniform float u_t;
uniform sampler2D u_atlas;
uniform sampler2D u_src;
uniform float u_glyphs;
uniform float u_cell;
uniform float u_gamma;   // >1 darkens midtones so the background stays black
uniform float u_gain;
uniform float u_fit;     // 1 = cover (crop), 0 = contain (letterbox)

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// cover-fit: image fills the canvas, centred, cropped
vec2 coverUv(vec2 px){
  float sc = u_fit > 0.5 ? max(u_res.x / u_img.x, u_res.y / u_img.y) : min(u_res.x / u_img.x, u_res.y / u_img.y);
  vec2 size = u_img * sc;
  vec2 off = (u_res - size) * 0.5;
  vec2 uv = (px - off) / size;
  return uv; // FLIP_Y on upload already puts row 0 at the bottom
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy / u_cell);
  vec2 centre = (cell + 0.5) * u_cell;
  vec2 uv = coverUv(centre);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // average a little neighbourhood so the cell reads the area, not a pixel
  vec2 texel = 1.0 / u_img;
  vec3 c = texture2D(u_src, uv).rgb * 0.4
         + texture2D(u_src, uv + texel * vec2( 2.0, 0.0)).rgb * 0.15
         + texture2D(u_src, uv + texel * vec2(-2.0, 0.0)).rgb * 0.15
         + texture2D(u_src, uv + texel * vec2(0.0,  2.0)).rgb * 0.15
         + texture2D(u_src, uv + texel * vec2(0.0, -2.0)).rgb * 0.15;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  lum = pow(clamp(lum * u_gain, 0.0, 1.0), u_gamma);

  // slow shimmer so the picture breathes even where nothing flips
  lum *= 0.9 + 0.1 * sin(u_t * 1.3 + cell.y * 0.35 + cell.x * 0.11);

  // changing characters
  float tick = floor(u_t * 7.0);
  float j = hash(cell + tick * 0.37) - 0.5;
  float flip = step(0.985, hash(cell * 1.7 + tick * 0.11));
  float base = clamp(lum, 0.0, 0.999) * u_glyphs;
  float idx = floor(clamp(base + j * 3.0 * step(0.03, lum), 0.0, u_glyphs - 1.0));
  idx = mix(idx, floor(hash(cell + tick) * u_glyphs), flip * step(0.03, lum));

  vec2 inCell = fract(gl_FragCoord.xy / u_cell);
  vec2 auv = vec2((idx + inCell.x) / u_glyphs, inCell.y);
  float ink = texture2D(u_atlas, auv).r;

  // tint: the image's own hue, pushed toward white in the brightest cells
  vec3 tint = lum > 0.0 ? normalize(c + 0.02) * 1.2 : vec3(1.0);
  tint = mix(tint, vec3(1.0), smoothstep(0.75, 1.0, lum) * 0.6);
  // glow: a faint halo of the cell colour under the glyph
  float halo = lum * lum * 0.35;
  vec3 col = tint * (ink * clamp(lum * 1.3 + 0.25, 0.0, 1.0) + halo);
  gl_FragColor = vec4(col, 1.0);
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

export type AsciiSource = { src: string; gamma?: number; gain?: number; fit?: "cover" | "contain" };

export default function KtuluLogo({
  source,
  height = 300,
  background = false,
  opacity = 0.6,
}: {
  source: AsciiSource;
  height?: number;
  background?: boolean;
  opacity?: number;
}) {
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
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
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

    const setTex = (unit: number, image: TexImageSource, linear: boolean) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    setTex(0, makeAtlas(), true);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(u("u_atlas"), 0);
    gl.uniform1i(u("u_src"), 1);
    gl.uniform1f(u("u_glyphs"), GLYPHS.length);
    gl.uniform1f(u("u_cell"), CELL);
    gl.uniform1f(u("u_gamma"), source.gamma ?? 1.4);
    gl.uniform1f(u("u_gain"), source.gain ?? 1.0);
    gl.uniform1f(u("u_fit"), source.fit === "contain" ? 0 : 1);

    let raf = 0;
    let ready = false;
    const start = performance.now();
    const prefersStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const frame = () => {
      if (!ready) return;
      resize();
      gl.uniform1f(u("u_t"), prefersStill ? 0 : (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!prefersStill) raf = requestAnimationFrame(frame);
    };

    const img = new Image();
    img.onload = () => {
      setTex(1, img, true);
      gl.uniform2f(u("u_img"), img.naturalWidth, img.naturalHeight);
      ready = true;
      frame();
    };
    img.src = source.src;

    return () => cancelAnimationFrame(raf);
  }, [source.src, source.gamma, source.gain, source.fit]);

  if (background) {
    return (
      <canvas
        ref={ref}
        aria-hidden
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", opacity, pointerEvents: "none", zIndex: 0, background: "#000" }}
      />
    );
  }
  return (
    <canvas
      ref={ref}
      aria-label="Ktulu ASCII mark"
      style={{ width: "100%", height, display: "block", background: "#000", borderRadius: 8 }}
    />
  );
}
