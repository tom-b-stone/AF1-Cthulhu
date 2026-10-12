// Browser-side image compression: decode → resize to a longest-edge preset →
// encode WebP. Nothing leaves the browser here. Safari can decode WebP but
// not encode it; detect that once and tell the user (fallback: JPEG).

export const EDGE_PRESETS = [2560, 1920, 1600, 0] as const; // 0 = original size
export type EdgePreset = (typeof EDGE_PRESETS)[number];
export const DEFAULT_QUALITY = 0.8;

let webpSupport: boolean | null = null;
export async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport != null) return webpSupport;
  try {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.8));
    webpSupport = Boolean(blob && blob.type === "image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

export type Compressed = {
  blob: Blob;
  width: number;
  height: number;
  srcWidth: number;
  srcHeight: number;
  mime: "image/webp" | "image/jpeg";
};

export async function compressImage(file: File, longestEdge: EdgePreset, quality = DEFAULT_QUALITY): Promise<Compressed> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;
  let width = srcWidth;
  let height = srcHeight;
  if (longestEdge > 0 && Math.max(srcWidth, srcHeight) > longestEdge) {
    const k = longestEdge / Math.max(srcWidth, srcHeight);
    width = Math.round(srcWidth * k);
    height = Math.round(srcHeight * k);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await canEncodeWebp();
  const mime = webp ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
  if (!blob) throw new Error("Encoding failed");
  return { blob, width, height, srcWidth, srcHeight, mime };
}

export async function thumbnail(blob: Blob, edge = 160): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const k = edge / Math.max(bitmap.width, bitmap.height);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c.toDataURL("image/jpeg", 0.7);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
