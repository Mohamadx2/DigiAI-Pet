const canvasCache = new Map<string, Promise<HTMLCanvasElement>>();
const dataUrlCache = new Map<string, Promise<string>>();

function isCheckerboardBgPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 20) return true;
  // Dark slate / cool gray checkerboard squares baked around pixel-art sprites
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC - minC;
  const lum = (r + g + b) / 3;
  // Match dark neutral gray or slate-blue checker squares (avoiding bright cyan outlines or warm oranges/greens)
  if (lum <= 135 && sat <= 34 && b >= r - 4) {
    return true;
  }
  return false;
}

function cleanSpriteCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || img.width || 128;
  const h = img.naturalHeight || img.height || 128;

  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = w;
  rawCanvas.height = h;
  const rawCtx = rawCanvas.getContext("2d");
  if (!rawCtx) return rawCanvas;

  rawCtx.drawImage(img, 0, 0, w, h);
  const imgData = rawCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Border-seeded BFS flood fill so internal dark eyes/mouth/cloak are never erased
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const trySeed = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (isCheckerboardBgPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const p = idx * 4;
    data[p + 3] = 0;

    const x = idx % w;
    const y = (idx - x) / w;

    if (x > 0) trySeed(x - 1, y);
    if (x < w - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < h - 1) trySeed(x, y + 1);
  }

  // Softly trim isolated 1px dark halo fringes adjacent to newly cleared transparent pixels
  const alphaCopy = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alphaCopy[i] = data[i * 4 + 3];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (alphaCopy[idx] === 0) continue;
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 75 && sat < 28) {
        const transNeighbors =
          (alphaCopy[idx - 1] === 0 ? 1 : 0) +
          (alphaCopy[idx + 1] === 0 ? 1 : 0) +
          (alphaCopy[idx - w] === 0 ? 1 : 0) +
          (alphaCopy[idx + w] === 0 ? 1 : 0);
        if (transNeighbors >= 2) {
          data[p + 3] = 0;
        }
      }
    }
  }

  rawCtx.putImageData(imgData, 0, 0);

  // Compute tight bounding box of visible pixels
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const outSize = 256;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return rawCanvas;

  if (maxX >= minX && maxY >= minY) {
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const pad = 16;
    const scale = Math.min((outSize - pad * 2) / bw, (outSize - pad * 2) / bh);
    const dw = Math.round(bw * scale);
    const dh = Math.round(bh * scale);
    const dx = Math.round((outSize - dw) / 2);
    // Align bottom edge near bottom of sprite plane so pet sits flush on ground
    const dy = outSize - pad - dh;
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(rawCanvas, minX, minY, bw, bh, dx, dy, dw, dh);
  }

  return outCanvas;
}

function createFallbackCanvas(label: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(128, 148, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(104, 138, 9, 0, Math.PI * 2);
    ctx.arc(152, 138, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 128, 236);
  }
  return c;
}

export function loadCleanedSpriteCanvas(url: string): Promise<HTMLCanvasElement> {
  const existing = canvasCache.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLCanvasElement>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(cleanSpriteCanvas(img));
      } catch {
        resolve(createFallbackCanvas("Digimon"));
      }
    };
    img.onerror = () => resolve(createFallbackCanvas("Digimon"));
    img.src = url;
  });

  canvasCache.set(url, promise);
  return promise;
}

export function loadCleanedSpriteDataUrl(url: string): Promise<string> {
  const existing = dataUrlCache.get(url);
  if (existing) return existing;

  const promise = loadCleanedSpriteCanvas(url).then((canvas) => canvas.toDataURL("image/png"));
  dataUrlCache.set(url, promise);
  return promise;
}
