// Browser-only: turns a photo into a clean single-colour line drawing
// (difference-of-Gaussians edges, ink coverage normalised by percentile,
// speckles removed). Used for the GP Mini-Zine cover so fans can colour
// and decorate it, while it still looks finished when left as it is.

type Opts = { width: number; height: number; color: string; coverage?: number; detail?: number };

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / d;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// three box passes ≈ gaussian
function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Returns a transparent canvas of the requested size with the drawing on it.
export function lineArt(img: CanvasImageSource & { width: number; height: number }, opts: Opts): HTMLCanvasElement {
  const { width: W, height: H, color } = opts;
  const coverage = opts.coverage ?? 0.075; // share of pixels that become ink
  const detail = opts.detail ?? 1; // >1 = finer lines / more detail
  // analyse at a working size, crop like object-fit: cover
  const scale = Math.min(1, 900 / Math.max(W, H));
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wc = work.getContext("2d", { willReadFrequently: true })!;
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k;
  const sh = h / k;
  wc.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  const px = wc.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;

  const s1 = (1.3 / detail) * (w / 600);
  const g1 = gauss(L, w, h, s1);
  const g2 = gauss(L, w, h, s1 * 1.6);
  const dog = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dog[i] = g2[i] - g1[i]; // >0 on the dark side of an edge
  // threshold at the (1 - coverage) percentile so every photo gets a similar amount of ink
  const sorted = Float32Array.from(dog).sort();
  const t = Math.max(0.004, sorted[Math.floor(sorted.length * (1 - coverage))]);
  const soft = t * 0.6;
  const ink = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = Math.min(1, Math.max(0, (dog[i] - t + soft) / soft));

  // drop specks: connected components smaller than minArea
  const minArea = Math.round((w * h) / 9000);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || ink[i] < 0.35) continue;
    comp.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && ink[q] >= 0.35) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    if (comp.length < minArea) for (const p of comp) ink[p] = 0;
  }
  // faint pixels survive only as the anti-aliased rim of a kept line;
  // on their own they print as grey fog
  const strong = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) strong[i] = ink[i] >= 0.35 ? 1 : 0;
  for (let i = 0; i < w * h; i++) {
    if (strong[i] || ink[i] === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++)
      for (let dx = -1; dx <= 1 && !near; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && strong[ny * w + nx]) near = true;
      }
    if (!near) ink[i] = 0;
  }

  const [r, g, b] = hexToRgb(color);
  const outData = wc.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    outData.data[i * 4] = r;
    outData.data[i * 4 + 1] = g;
    outData.data[i * 4 + 2] = b;
    outData.data[i * 4 + 3] = Math.round(ink[i] * 255);
  }
  wc.clearRect(0, 0, w, h);
  wc.putImageData(outData, 0, 0);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const oc = out.getContext("2d")!;
  oc.imageSmoothingEnabled = true;
  oc.imageSmoothingQuality = "high";
  oc.drawImage(work, 0, 0, W, H);
  return out;
}
