import * as THREE from "three";

export function createGrassTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#5c9e49";
  ctx.fillRect(0, 0, size, size);

  // Organic dappled grass patches
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 24;
    ctx.fillStyle =
      i % 3 === 0
        ? "rgba(116, 182, 76, 0.24)"
        : i % 3 === 1
        ? "rgba(68, 128, 52, 0.22)"
        : "rgba(138, 198, 92, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp grass blade strokes & tiny clover dots
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.strokeStyle = i % 2 === 0 ? "rgba(155, 212, 102, 0.35)" : "rgba(52, 105, 42, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 5 - Math.random() * 6);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createSandTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext("2d")!;

  cctx.fillStyle = "#e8c987";
  cctx.fillRect(0, 0, size, size);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.5;
    cctx.fillStyle = i % 2 === 0 ? "rgba(255, 236, 185, 0.4)" : "rgba(196, 158, 92, 0.35)";
    cctx.beginPath();
    cctx.arc(x, y, r, 0, Math.PI * 2);
    cctx.fill();

    const g = Math.floor(105 + Math.random() * 60);
    bctx.fillStyle = `rgb(${g},${g},${g})`;
    bctx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

export function createWoodTexture(
  maxAniso: number,
  baseHex = "#8c5b38",
  streakHex = "#6b4124"
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = streakHex;
  for (let y = 0; y < size; y += 6) {
    ctx.lineWidth = 1 + Math.random() * 2.2;
    ctx.globalAlpha = 0.25 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.33,
      y + (Math.random() - 0.5) * 8,
      size * 0.66,
      y + (Math.random() - 0.5) * 8,
      size,
      y
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0, "rgba(15, 22, 18, 0.52)");
  grad.addColorStop(0.55, "rgba(15, 22, 18, 0.22)");
  grad.addColorStop(1, "rgba(15, 22, 18, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStoneTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#8a929a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 8;
    ctx.fillStyle = i % 2 === 0 ? "rgba(210,218,224,0.2)" : "rgba(55,62,70,0.22)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}
