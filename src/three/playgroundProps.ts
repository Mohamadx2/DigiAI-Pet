import * as THREE from "three";
import {
  createSandTextures,
  createStoneTexture,
  createWoodTexture,
} from "./proceduralTextures";

function makeContactShadow(
  shadowTex: THREE.CanvasTexture,
  radiusX: number,
  radiusZ: number,
  opacity = 0.44
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  return mesh;
}

export interface SwingRig {
  group: THREE.Group;
  swingPivot: THREE.Group;
  seatWorldHelper: THREE.Object3D;
}

export interface TreeRig {
  group: THREE.Group;
  lanternLight: THREE.PointLight;
  lanternBulbMat: THREE.MeshStandardMaterial;
}

export interface BushRig {
  group: THREE.Group;
  bushes: THREE.Group[];
}

export function createGardenTree(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): TreeRig {
  const group = new THREE.Group();
  group.userData.interact = "tree";

  const barkTex = createWoodTexture(maxAniso, "#6e472b", "#452916");
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    roughness: 0.92,
    metalness: 0.02,
  });
  const foliageDark = new THREE.MeshStandardMaterial({
    color: 0x38843f,
    roughness: 0.82,
    metalness: 0.0,
  });
  const foliageLight = new THREE.MeshStandardMaterial({
    color: 0x52a84c,
    roughness: 0.76,
    metalness: 0.0,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a44a,
    roughness: 0.28,
    metalness: 0.82,
  });

  // 1. Contact shadow
  group.add(makeContactShadow(shadowTex, 2.2, 2.2, 0.45));

  // 2. Flared root collar (LatheGeometry)
  const rootPts = [
    new THREE.Vector2(0.82, 0.0),
    new THREE.Vector2(0.62, 0.25),
    new THREE.Vector2(0.45, 0.75),
    new THREE.Vector2(0.38, 1.5),
    new THREE.Vector2(0.32, 2.35),
  ];
  const trunkGeo = new THREE.LatheGeometry(rootPts, 14);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.userData.interact = "tree";
  group.add(trunk);

  // 3. Curved main limb (TubeGeometry)
  const limbCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 1.9, 0.0),
    new THREE.Vector3(0.65, 2.35, 0.2),
    new THREE.Vector3(1.25, 2.48, 0.3),
  ]);
  const limb = new THREE.Mesh(new THREE.TubeGeometry(limbCurve, 12, 0.14, 8, false), barkMat);
  limb.castShadow = true;
  limb.userData.interact = "tree";
  group.add(limb);

  const leftLimbCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 1.75, 0.0),
    new THREE.Vector3(-0.7, 2.2, -0.15),
    new THREE.Vector3(-1.1, 2.55, -0.2),
  ]);
  const leftLimb = new THREE.Mesh(
    new THREE.TubeGeometry(leftLimbCurve, 10, 0.12, 8, false),
    barkMat
  );
  leftLimb.castShadow = true;
  leftLimb.userData.interact = "tree";
  group.add(leftLimb);

  // 4. Layered canopy clusters (5 parts)
  const canopySpecs: Array<[number, number, number, number, boolean]> = [
    [0.0, 3.35, 0.0, 1.38, false],
    [-0.95, 2.85, 0.35, 0.95, true],
    [0.95, 2.95, -0.25, 0.92, false],
    [0.15, 2.8, 0.85, 0.88, true],
    [-0.2, 3.95, -0.15, 0.9, true],
  ];
  canopySpecs.forEach(([x, y, z, r, light]) => {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 2),
      light ? foliageLight : foliageDark
    );
    puff.position.set(x, y, z);
    puff.scale.set(1.08, 0.86, 1.05);
    puff.castShadow = true;
    puff.receiveShadow = true;
    puff.userData.interact = "tree";
    group.add(puff);
  });

  // 5. Hanging lantern on right branch
  const lanternGroup = new THREE.Group();
  lanternGroup.position.set(1.2, 2.42, 0.3);

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), brassMat);
  cord.position.y = -0.14;
  lanternGroup.add(cord);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 8), brassMat);
  cap.position.y = -0.3;
  lanternGroup.add(cap);

  const lanternBulbMat = new THREE.MeshStandardMaterial({
    color: 0xffdf90,
    emissive: 0xffaa33,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.1,
  });
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 8), lanternBulbMat);
  bulb.position.y = -0.44;
  lanternGroup.add(bulb);

  const lanternLight = new THREE.PointLight(0xffb44c, 0.6, 8, 2);
  lanternLight.position.set(0, -0.45, 0);
  lanternGroup.add(lanternLight);

  group.add(lanternGroup);
  return { group, lanternLight, lanternBulbMat };
}

export function createSwingSet(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): SwingRig {
  const group = new THREE.Group();
  group.userData.interact = "swing";

  const woodTex = createWoodTexture(maxAniso, "#a66d42", "#784927");
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.74,
    metalness: 0.04,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b6e8c,
    roughness: 0.28,
    metalness: 0.78,
  });
  const chainMat = new THREE.MeshStandardMaterial({
    color: 0xc2cbd4,
    roughness: 0.22,
    metalness: 0.9,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0xe68a3e,
    roughness: 0.48,
    metalness: 0.06,
  });

  // 1. Contact shadow
  group.add(makeContactShadow(shadowTex, 1.85, 1.25, 0.42));

  // 2. Four A-frame angled legs + metal ground shoes
  const legHeight = 2.85;
  const spreadZ = 0.92;
  const sideX = 1.22;
  const legGeo = new THREE.CylinderGeometry(0.068, 0.082, legHeight, 10);
  const footGeo = new THREE.CylinderGeometry(0.11, 0.125, 0.12, 10);

  const legPositions: Array<[number, number, number]> = [
    [-sideX, spreadZ, -0.32],
    [-sideX, -spreadZ, 0.32],
    [sideX, spreadZ, -0.32],
    [sideX, -spreadZ, 0.32],
  ];

  legPositions.forEach(([x, z, tiltX]) => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(x, 1.35, z * 0.5);
    leg.rotation.x = tiltX;
    leg.castShadow = true;
    leg.receiveShadow = true;
    leg.userData.interact = "swing";
    group.add(leg);

    const foot = new THREE.Mesh(footGeo, steelMat);
    foot.position.set(x, 0.06, z * 0.95);
    foot.castShadow = true;
    foot.userData.interact = "swing";
    group.add(foot);
  });

  // 3. Side A-frame crossbars
  [-sideX, sideX].forEach((x) => {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8), woodMat);
    brace.rotation.x = Math.PI / 2;
    brace.position.set(x, 1.15, 0);
    brace.castShadow = true;
    brace.userData.interact = "swing";
    group.add(brace);
  });

  // 4. Top crossbar & end collars
  const topY = 2.68;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.75, 12), steelMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = topY;
  bar.castShadow = true;
  bar.userData.interact = "swing";
  group.add(bar);

  [-sideX, sideX].forEach((x) => {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 12), steelMat);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(x, topY, 0);
    collar.userData.interact = "swing";
    group.add(collar);
  });

  // 5. Pivoting Swing Assembly
  const swingPivot = new THREE.Group();
  swingPivot.position.set(0, topY, 0);

  const ropeLen = 2.02;
  const seatOffset = 0.44;
  [-seatOffset, seatOffset].forEach((rx) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 8, 14), chainMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(rx, 0, 0);
    swingPivot.add(ring);

    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, ropeLen, 8),
      chainMat
    );
    chain.position.set(rx, -ropeLen / 2, 0);
    chain.castShadow = true;
    chain.userData.interact = "swing";
    swingPivot.add(chain);
  });

  // Beveled ExtrudeGeometry swing seat
  const seatShape = new THREE.Shape();
  seatShape.moveTo(-0.52, -0.22);
  seatShape.lineTo(0.52, -0.22);
  seatShape.lineTo(0.52, 0.22);
  seatShape.lineTo(-0.52, 0.22);
  seatShape.closePath();
  const seatGeo = new THREE.ExtrudeGeometry(seatShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  seatGeo.rotateX(Math.PI / 2);
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, -ropeLen + 0.04, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  seat.userData.interact = "swing";
  swingPivot.add(seat);

  const seatWorldHelper = new THREE.Object3D();
  seatWorldHelper.position.set(0, -ropeLen + 0.06, 0);
  swingPivot.add(seatWorldHelper);

  group.add(swingPivot);
  return { group, swingPivot, seatWorldHelper };
}

export function createSandbox(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();
  group.userData.interact = "sandbox";

  const woodTex = createWoodTexture(maxAniso, "#b57a49", "#87532a");
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.72,
    metalness: 0.03,
  });
  const benchMat = new THREE.MeshStandardMaterial({
    color: 0xd49456,
    roughness: 0.45,
    metalness: 0.04,
  });
  const { map: sandMap, bumpMap: sandBump } = createSandTextures(maxAniso);
  const sandMat = new THREE.MeshStandardMaterial({
    map: sandMap,
    bumpMap: sandBump,
    bumpScale: 0.04,
    roughness: 0.94,
    metalness: 0.0,
  });
  const bucketMat = new THREE.MeshStandardMaterial({
    color: 0xe84a5f,
    roughness: 0.22,
    metalness: 0.08,
  });
  const shovelMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.24,
    metalness: 0.1,
  });

  // 1. Contact shadow
  group.add(makeContactShadow(shadowTex, 2.0, 1.75, 0.38));

  // 2. Four beveled timber border walls
  const w = 3.0;
  const d = 2.4;
  const h = 0.28;
  const t = 0.16;

  const railSpecs: Array<[number, number, number, number]> = [
    [0, -d / 2, w + t, t],
    [0, d / 2, w + t, t],
    [-w / 2, 0, t, d - t],
    [w / 2, 0, t, d - t],
  ];
  railSpecs.forEach(([x, z, rw, rd]) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, h, rd), woodMat);
    rail.position.set(x, h / 2, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    rail.userData.interact = "sandbox";
    group.add(rail);
  });

  // 3. Corner bench seats
  const cornerPositions: Array<[number, number]> = [
    [-w / 2 + 0.16, -d / 2 + 0.16],
    [w / 2 - 0.16, -d / 2 + 0.16],
    [-w / 2 + 0.16, d / 2 - 0.16],
    [w / 2 - 0.16, d / 2 - 0.16],
  ];
  cornerPositions.forEach(([cx, cz]) => {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), benchMat);
    bench.position.set(cx, h + 0.025, cz);
    bench.castShadow = true;
    bench.userData.interact = "sandbox";
    group.add(bench);
  });

  // 4. Sculpted golden sand bed
  const sandGeo = new THREE.PlaneGeometry(w - t, d - t, 18, 14);
  sandGeo.rotateX(-Math.PI / 2);
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sz = pos.getZ(i);
    const wave = Math.sin(sx * 2.2) * Math.cos(sz * 2.2) * 0.035;
    pos.setY(i, 0.16 + wave);
  }
  sandGeo.computeVertexNormals();
  const sandBed = new THREE.Mesh(sandGeo, sandMat);
  sandBed.receiveShadow = true;
  sandBed.userData.interact = "sandbox";
  group.add(sandBed);

  // 5. Sandcastle (3-part turret)
  const castle = new THREE.Group();
  castle.position.set(-0.68, 0.16, -0.35);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.18, 10), sandMat);
  base.position.y = 0.09;
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.26, 10), sandMat);
  keep.position.y = 0.28;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.22, 10), sandMat);
  roof.position.y = 0.5;
  [base, keep, roof].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.interact = "sandbox";
    castle.add(m);
  });
  group.add(castle);

  // 6. Toy bucket (LatheGeometry) & Shovel
  const bucketPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.11, 0.0),
    new THREE.Vector2(0.15, 0.24),
    new THREE.Vector2(0.165, 0.25),
    new THREE.Vector2(0.135, 0.24),
    new THREE.Vector2(0.1, 0.03),
    new THREE.Vector2(0.0, 0.03),
  ];
  const bucket = new THREE.Mesh(new THREE.LatheGeometry(bucketPts, 14), bucketMat);
  bucket.position.set(0.75, 0.15, 0.36);
  bucket.castShadow = true;
  bucket.userData.interact = "sandbox";
  group.add(bucket);

  const shovel = new THREE.Group();
  shovel.position.set(0.42, 0.2, 0.45);
  shovel.rotation.set(0.2, 0.5, -0.55);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8), shovelMat);
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.14), shovelMat);
  scoop.position.y = -0.21;
  shovel.add(handle, scoop);
  group.add(shovel);

  return group;
}

export function createGardenBushes(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): BushRig {
  const group = new THREE.Group();
  group.userData.interact = "bushes";
  const bushes: THREE.Group[] = [];

  const stoneTex = createStoneTexture(maxAniso);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.88,
    metalness: 0.04,
  });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x3b8e43, roughness: 0.8, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x4eab50, roughness: 0.76, metalness: 0.0 }),
  ];
  const flowerColors = [0xff7eb6, 0xffd166, 0x72efdd, 0xff9f68];

  const clusterPositions: Array<[number, number, number]> = [
    [0, 0, 1.0],
    [-0.95, 0.35, 0.82],
    [0.95, -0.35, 0.88],
  ];

  clusterPositions.forEach(([bx, bz, scale], idx) => {
    const bush = new THREE.Group();
    bush.position.set(bx, 0, bz);
    bush.scale.setScalar(scale);
    bush.userData.interact = "bushes";
    bush.userData.baseScale = scale;

    bush.add(makeContactShadow(shadowTex, 0.9, 0.9, 0.36));

    // Stone border pebbles around bush base
    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * Math.PI * 2;
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), stoneMat);
      pebble.position.set(Math.cos(ang) * 0.65, 0.07, Math.sin(ang) * 0.65);
      pebble.scale.set(1.2, 0.7, 1.0);
      pebble.castShadow = true;
      pebble.userData.interact = "bushes";
      bush.add(pebble);
    }

    // Layered foliage puffs
    const lobes: Array<[number, number, number, number]> = [
      [0, 0.45, 0, 0.56],
      [-0.36, 0.36, 0.2, 0.42],
      [0.36, 0.38, -0.18, 0.44],
      [0.05, 0.68, 0.12, 0.36],
    ];
    lobes.forEach(([lx, ly, lz, lr], lIdx) => {
      const puff = new THREE.Mesh(
        new THREE.IcosahedronGeometry(lr, 1),
        leafMats[(idx + lIdx) % 2]
      );
      puff.position.set(lx, ly, lz);
      puff.castShadow = true;
      puff.receiveShadow = true;
      puff.userData.interact = "bushes";
      bush.add(puff);
    });

    // Blossoming flowers
    const blossomMat = new THREE.MeshStandardMaterial({
      color: flowerColors[idx % flowerColors.length],
      roughness: 0.42,
      metalness: 0.04,
    });
    for (let f = 0; f < 5; f++) {
      const a = (f / 5) * Math.PI * 2 + idx;
      const flower = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), blossomMat);
      flower.position.set(Math.cos(a) * 0.46, 0.56 + (f % 2) * 0.16, Math.sin(a) * 0.46);
      flower.userData.interact = "bushes";
      bush.add(flower);
    }

    bushes.push(bush);
    group.add(bush);
  });

  return { group, bushes };
}

export function createEggNest(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();
  const woodTex = createWoodTexture(maxAniso, "#8e6239", "#5c3d1e");
  const strawMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.9,
    metalness: 0.0,
  });
  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x5ca34b,
    roughness: 0.85,
    metalness: 0.0,
  });

  group.add(makeContactShadow(shadowTex, 0.9, 0.9, 0.45));

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.16, 10, 22), strawMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);

  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 0.12, 16), mossMat);
  cushion.position.y = 0.07;
  cushion.receiveShadow = true;
  group.add(cushion);

  return group;
}

export function createPerimeterGarden(maxAniso: number): THREE.Group {
  const group = new THREE.Group();
  const woodTex = createWoodTexture(maxAniso, "#c79e72", "#9e754c");
  const fenceMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.78,
    metalness: 0.02,
  });
  const stoneTex = createStoneTexture(maxAniso);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.88,
    metalness: 0.02,
  });

  // Natural curving picket fence along the back arc
  const postGeo = new THREE.BoxGeometry(0.16, 0.95, 0.14);
  const railGeo = new THREE.BoxGeometry(1.5, 0.1, 0.08);
  const arcCount = 13;
  for (let i = 0; i < arcCount; i++) {
    const t = -0.78 + (i / (arcCount - 1)) * 1.56;
    const x = Math.sin(t) * 10.5;
    const z = -Math.cos(t) * 8.2;
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(x, 0.47, z);
    post.rotation.y = -t;
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    if (i < arcCount - 1) {
      const nextT = -0.78 + ((i + 1) / (arcCount - 1)) * 1.56;
      const nx = Math.sin(nextT) * 10.5;
      const nz = -Math.cos(nextT) * 8.2;
      const rail = new THREE.Mesh(railGeo, fenceMat);
      rail.position.set((x + nx) / 2, 0.62, (z + nz) / 2);
      rail.rotation.y = -((t + nextT) / 2);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  // Stepping stone path toward center nest
  const stones: Array<[number, number, number]> = [
    [-2.4, 1.5, 0.42],
    [-1.4, 1.1, 0.36],
    [-0.4, 1.7, 0.38],
    [1.1, 1.6, 0.4],
    [2.3, 1.9, 0.35],
    [3.2, 2.4, 0.38],
  ];
  stones.forEach(([sx, sz, sr]) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr * 1.08, 0.07, 9), stoneMat);
    stone.position.set(sx, 0.035, sz);
    stone.receiveShadow = true;
    group.add(stone);
  });

  // Instanced grass tufts around the meadow perimeter (> 20 items -> InstancedMesh)
  const tuftGeo = new THREE.ConeGeometry(0.08, 0.32, 5);
  tuftGeo.translate(0, 0.16, 0);
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
  });
  const count = 90;
  const inst = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 5.5 + Math.random() * 11.5;
    dummy.position.set(Math.cos(angle) * rad, 0, Math.sin(angle) * rad);
    const s = 0.85 + Math.random() * 0.3;
    dummy.scale.set(s, s, s);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + (Math.random() - 0.5) * 0.05, 0.52, 0.38 + Math.random() * 0.14);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  group.add(inst);

  // Distant perimeter trees framing the horizon
  const bgTreeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3e26, roughness: 0.92 });
  const bgTreeLeafMat = new THREE.MeshStandardMaterial({ color: 0x3b7a3d, roughness: 0.84 });
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + 0.25;
    const dist = 13.5 + (i % 3) * 2.2;
    const bgTree = new THREE.Group();
    bgTree.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 2.2, 8), bgTreeTrunkMat);
    tr.position.y = 1.1;
    const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), bgTreeLeafMat);
    cr.position.y = 2.65;
    const cr2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), bgTreeLeafMat);
    cr2.position.set(0.55, 2.25, 0.3);
    bgTree.add(tr, cr, cr2);
    group.add(bgTree);
  }

  return group;
}
