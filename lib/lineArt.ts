// Browser-only: turns a photo into a colouring-book line drawing.
//
// Pipeline (v2):
//  1. Kuwahara filter: flattens textures (crowds, bokeh, carbon weave) into
//     calm areas while keeping the real edges sharp
//  2. colour-aware gradients (lightness + two colour axes, so a red suit on
//     a dark garage wall still gets its outline)
//  3. Canny: non-maximum suppression gives 1 px lines, hysteresis keeps the
//     long connected contours
//  4. short strokes are dropped (they print as dust), the rest is drawn
//     with an even pen width
// The result reads like an inked colouring page: closed shapes, no grey fog.

type Opts = {
  width: number;
  height: number;
  color: string;
  // share of edge pixels kept by the high threshold; lower = cleaner page
  detail?: number; // 0.5 (sparse) … 1.5 (busy), default 1
  pen?: number; // stroke width in output px at 300 dpi, default 3
  // legacy options from v1, ignored
  coverage?: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// integral images of a channel and its square for O(1) box statistics
function integrals(src: Float32Array, w: number, h: number) {
  const s = new Float64Array((w + 1) * (h + 1));
  const q = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      rs += v;
      rq += v * v;
      s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + rs;
      q[(y + 1) * (w + 1) + x + 1] = q[y * (w + 1) + x + 1] + rq;
    }
  }
  return { s, q };
}

// Kuwahara on 3 channels; the quadrant with the lowest variance (in
// lightness) decides the colour, which removes texture but keeps edges.
function kuwahara(ch: Float32Array[], w: number, h: number, r: number): Float32Array[] {
  const I = ch.map((c) => integrals(c, w, h));
  const out = ch.map(() => new Float32Array(w * h));
  const W1 = w + 1;
  const box = (t: Float64Array, x0: number, y0: number, x1: number, y1: number) => t[y1 * W1 + x1] - t[y0 * W1 + x1] - t[y1 * W1 + x0] + t[y0 * W1 + x0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let bx0 = 0, by0 = 0, bx1 = 0, by1 = 0, bn = 1;
      for (let qd = 0; qd < 4; qd++) {
        const x0 = Math.max(0, qd & 1 ? x : x - r);
        const x1 = Math.min(w, (qd & 1 ? x + r : x) + 1);
        const y0 = Math.max(0, qd & 2 ? y : y - r);
        const y1 = Math.min(h, (qd & 2 ? y + r : y) + 1);
        const n = (x1 - x0) * (y1 - y0);
        const m = box(I[0].s, x0, y0, x1, y1) / n;
        const v = box(I[0].q, x0, y0, x1, y1) / n - m * m;
        if (v < best) {
          best = v;
          bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; bn = n;
        }
      }
      const i = y * w + x;
      for (let c = 0; c < ch.length; c++) out[c][i] = box(I[c].s, bx0, by0, bx1, by1) / bn;
    }
  }
  return out;
}

function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const { s } = integrals(src, w, h);
  const W1 = w + 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      out[y * w + x] = (s[y1 * W1 + x1] - s[y0 * W1 + x1] - s[y1 * W1 + x0] + s[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
    }
  return out;
}

function gauss3(src: Float32Array, w: number, h: number): Float32Array {
  // separable [1 2 1]/4, twice ≈ sigma 1
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        t[i] = (a[i - (x > 0 ? 1 : 0)] + 2 * a[i] + a[i + (x < w - 1 ? 1 : 0)]) / 4;
      }
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        o[i] = (t[i - (y > 0 ? w : 0)] + 2 * t[i] + t[i + (y < h - 1 ? w : 0)]) / 4;
      }
    a = o;
  }
  return a;
}

export function lineArt(img: CanvasImageSource & { width: number; height: number }, opts: Opts): HTMLCanvasElement {
  const { width: W, height: H, color } = opts;
  const detail = opts.detail ?? 1;
  const pen = opts.pen ?? 3;
  // working resolution: ~900 px on the long side is enough for print lines
  const scale = Math.min(1, 900 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * scale));
  const h = Math.max(8, Math.round(H * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wc = work.getContext("2d", { willReadFrequently: true })!;
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k;
  const sh = h / k;
  wc.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  const px = wc.getImageData(0, 0, w, h).data;

  // lightness + two opponent colour axes (rough Lab)
  const L = new Float32Array(w * h);
  const A = new Float32Array(w * h);
  const B = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    A[i] = (r - g) * 0.5;
    B[i] = ((r + g) / 2 - b) * 0.4;
  }
  // focus map: in-focus areas (the subject) carry fine detail, blurred
  // backgrounds and bokeh do not. Edges are weighted by it, so the drawing
  // concentrates on what the photographer focused on.
  const lap = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap[i] = Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]);
    }
  const focus = boxMean(lap, w, h, Math.max(4, Math.round(w / 30)));
  const fs = Float32Array.from(focus).sort();
  const f95 = fs[Math.floor(fs.length * 0.95)] || 1;
  const weight = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const f = Math.min(1, focus[i] / f95);
    const t = Math.min(1, Math.max(0, (f - 0.12) / 0.45));
    weight[i] = 0.2 + 0.8 * t * t * (3 - 2 * t);
  }
  const rad = Math.max(2, Math.round(w / 220));
  let [Ls, As, Bs] = kuwahara([L, A, B], w, h, rad);
  [Ls, As, Bs] = kuwahara([Ls, As, Bs], w, h, Math.max(2, rad - 1));
  Ls = gauss3(Ls, w, h);
  As = gauss3(As, w, h);
  Bs = gauss3(Bs, w, h);

  // Sobel on the channel with the strongest response per pixel
  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h); // 0: horiz, 1: 45°, 2: vert, 3: 135°
  const chans = [Ls, As, Bs];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let bm = 0, bgx = 0, bgy = 0;
      for (const c of chans) {
        const gx = c[i - w + 1] + 2 * c[i + 1] + c[i + w + 1] - c[i - w - 1] - 2 * c[i - 1] - c[i + w - 1];
        const gy = c[i + w - 1] + 2 * c[i + w] + c[i + w + 1] - c[i - w - 1] - 2 * c[i - w] - c[i - w + 1];
        const m = gx * gx + gy * gy;
        if (m > bm) {
          bm = m;
          bgx = gx;
          bgy = gy;
        }
      }
      mag[i] = Math.sqrt(bm) * weight[i];
      const ang = (Math.atan2(bgy, bgx) * 180) / Math.PI;
      const a = ang < 0 ? ang + 180 : ang;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }

  // non-maximum suppression
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (!m) continue;
      let a = 0, b = 0;
      switch (dir[i]) {
        case 0: a = mag[i - 1]; b = mag[i + 1]; break;
        case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break; // 45° in image coords (y down)
        case 2: a = mag[i - w]; b = mag[i + w]; break;
        default: a = mag[i - w + 1]; b = mag[i + w - 1];
      }
      if (m >= a && m >= b) nms[i] = m;
    }

  // thresholds from the distribution of candidate edges
  const cand: number[] = [];
  for (let i = 0; i < w * h; i++) if (nms[i] > 0.01) cand.push(nms[i]);
  cand.sort((p, q) => p - q);
  const pct = (p: number) => cand[Math.min(cand.length - 1, Math.max(0, Math.floor(cand.length * p)))] ?? 1;
  const hi = Math.max(0.05, pct(1 - 0.18 * detail));
  const lo = hi * 0.42;

  // hysteresis + component length filter in one flood fill
  const keep = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const minLen = Math.round(w / (40 * detail));
  const stack: number[] = [];
  const comp: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || nms[i] < hi) continue;
    comp.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && nms[q] >= lo) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    // drop dust, and small shapes floating in out-of-focus areas (bokeh rings)
    let fw = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (const p of comp) {
      fw += weight[p];
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const small = Math.max(x1 - x0, y1 - y0) < w / 12;
    if (comp.length >= minLen && !(small && fw / comp.length < 0.5)) for (const p of comp) keep[p] = 1;
  }

  // draw: every kept pixel becomes a round pen dot at output resolution
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const oc = out.getContext("2d")!;
  const [r, g, b] = hexToRgb(color);
  oc.fillStyle = `rgb(${r},${g},${b})`;
  const sx = W / w, sy = H / h;
  const rr = pen / 2;
  oc.beginPath();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!keep[y * w + x]) continue;
      const cx = (x + 0.5) * sx, cy = (y + 0.5) * sy;
      oc.moveTo(cx + rr, cy);
      oc.arc(cx, cy, rr, 0, Math.PI * 2);
    }
  oc.fill();
  return out;
}
