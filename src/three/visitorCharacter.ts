import * as THREE from "three";

export interface VisitorRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  armLPivot: THREE.Group;
  armRPivot: THREE.Group;
  legLPivot: THREE.Group;
  legRPivot: THREE.Group;
  tailPivot: THREE.Group;
  tailTipPivot: THREE.Group;
  dispose: () => void;
}

/**
 * Remaps [0..1] UVs of a BufferGeometry into a sub-rectangle of chr092a01_14409219.png.
 * Coordinates (x0, y0, x1, y1) are top-down normalized image coordinates (y=0 at top, y=1 at bottom).
 */
function remapUvRect(
  geo: THREE.BufferGeometry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  swapAxes = false
): void {
  const uvAttr = geo.attributes.uv;
  if (!uvAttr) return;
  const vBottom = 1 - y1;
  const vSpan = y1 - y0;
  const uSpan = x1 - x0;

  for (let i = 0; i < uvAttr.count; i++) {
    const rawU = uvAttr.getX(i);
    const rawV = uvAttr.getY(i);
    const u = swapAxes ? rawV : rawU;
    const v = swapAxes ? rawU : rawV;
    uvAttr.setXY(i, x0 + u * uSpan, vBottom + v * vSpan);
  }
  uvAttr.needsUpdate = true;
}

function tagInteract(obj: THREE.Object3D): void {
  obj.userData.interact = "visitor";
}

export function createVisitorCharacter(
  maxAniso: number,
  shadowTex: THREE.CanvasTexture
): VisitorRig {
  const loader = new THREE.TextureLoader();
  const atlasTex = loader.load("/assets/aistudio/chr092a01_14409219.png");
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = maxAniso;
  atlasTex.wrapS = THREE.ClampToEdgeWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;

  const disposables: Array<{ dispose: () => void }> = [atlasTex];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // Distinct PBR materials sampling chr092a01_14409219.png with varied roughness & metalness
  const furMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.78,
      metalness: 0.0,
    })
  );
  const purpleMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.85,
      metalness: 0.02,
    })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.22,
      metalness: 0.85,
    })
  );
  const eyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.16,
      metalness: 0.05,
    })
  );
  const clawMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.34,
      metalness: 0.42,
    })
  );
  const bootMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: atlasTex,
      roughness: 0.56,
      metalness: 0.08,
    })
  );

  const group = new THREE.Group();
  tagInteract(group);

  // 1. Grounded contact shadow at y = 0.015
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.15, 1.15));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    })
  );
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.015;
  shadow.renderOrder = 1;
  group.add(shadow);

  // Body assembly (bounces smoothly while walking)
  const bodyGroup = new THREE.Group();
  tagInteract(bodyGroup);
  group.add(bodyGroup);

  // 2. Primary Silhouette: Sculpted Feline Torso (LatheGeometry mapped to creamy white fur)
  const torsoPts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.21, 0.06),
    new THREE.Vector2(0.24, 0.22),
    new THREE.Vector2(0.19, 0.42),
    new THREE.Vector2(0.14, 0.52),
    new THREE.Vector2(0.01, 0.55),
  ];
  const torsoGeo = trackGeo(new THREE.LatheGeometry(torsoPts, 18));
  remapUvRect(torsoGeo, 0.49, 0.06, 0.71, 0.22);
  const torso = new THREE.Mesh(torsoGeo, furMat);
  torso.position.y = 0.22;
  torso.castShadow = true;
  torso.receiveShadow = true;
  tagInteract(torso);
  bodyGroup.add(torso);

  // Belly/chest fur patch (olive-amber markings from texture)
  const chestGeo = trackGeo(new THREE.SphereGeometry(0.16, 16, 12));
  chestGeo.scale(1.0, 1.2, 0.55);
  remapUvRect(chestGeo, 0.03, 0.52, 0.28, 0.68);
  const chestPatch = new THREE.Mesh(chestGeo, furMat);
  chestPatch.position.set(0, 0.46, 0.14);
  tagInteract(chestPatch);
  bodyGroup.add(chestPatch);

  // 3. Head Group (round white fur head, giant blue anime eyes, ears, nose, smile)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.94, 0.02);
  tagInteract(headGroup);
  bodyGroup.add(headGroup);

  const headGeo = trackGeo(new THREE.SphereGeometry(0.3, 24, 18));
  headGeo.scale(1.08, 0.95, 0.96);
  remapUvRect(headGeo, 0.49, 0.06, 0.71, 0.22);
  const head = new THREE.Mesh(headGeo, furMat);
  head.castShadow = true;
  head.receiveShadow = true;
  tagInteract(head);
  headGroup.add(head);

  // Giant sky-blue eyes mapped directly from bottom-center of texture
  const eyeGeoL = trackGeo(new THREE.CircleGeometry(0.105, 24));
  remapUvRect(eyeGeoL, 0.458, 0.858, 0.632, 0.99);
  const eyeL = new THREE.Mesh(eyeGeoL, eyeMat);
  eyeL.position.set(-0.112, 0.03, 0.278);
  eyeL.rotation.y = -0.32;
  tagInteract(eyeL);
  headGroup.add(eyeL);

  const eyeGeoR = trackGeo(new THREE.CircleGeometry(0.105, 24));
  remapUvRect(eyeGeoR, 0.65, 0.858, 0.824, 0.99);
  const eyeR = new THREE.Mesh(eyeGeoR, eyeMat);
  eyeR.position.set(0.112, 0.03, 0.278);
  eyeR.rotation.y = 0.32;
  tagInteract(eyeR);
  headGroup.add(eyeR);

  // Dark cat nose
  const noseGeo = trackGeo(new THREE.SphereGeometry(0.026, 10, 8));
  noseGeo.scale(1.25, 0.8, 0.7);
  remapUvRect(noseGeo, 0.02, 0.015, 0.07, 0.045);
  const nose = new THREE.Mesh(noseGeo, furMat);
  nose.position.set(0, -0.025, 0.305);
  tagInteract(nose);
  headGroup.add(nose);

  // Cheerful pink smile
  const mouthGeo = trackGeo(new THREE.CircleGeometry(0.052, 16, Math.PI, Math.PI));
  remapUvRect(mouthGeo, 0.57, 0.56, 0.65, 0.62);
  const mouth = new THREE.Mesh(mouthGeo, furMat);
  mouth.position.set(0, -0.085, 0.288);
  tagInteract(mouth);
  headGroup.add(mouth);

  // Pointed cat ears with violet-purple inner tips
  const makeEar = (side: -1 | 1) => {
    const earHolder = new THREE.Group();
    earHolder.position.set(side * 0.19, 0.24, -0.01);
    earHolder.rotation.z = -side * 0.34;
    earHolder.rotation.x = 0.08;

    const outerGeo = trackGeo(new THREE.ConeGeometry(0.098, 0.3, 14));
    remapUvRect(outerGeo, 0.49, 0.06, 0.71, 0.22);
    const outer = new THREE.Mesh(outerGeo, furMat);
    outer.position.y = 0.13;
    outer.castShadow = true;
    tagInteract(outer);
    earHolder.add(outer);

    const innerGeo = trackGeo(new THREE.ConeGeometry(0.055, 0.2, 12));
    remapUvRect(innerGeo, 0.8, 0.36, 0.95, 0.58);
    const inner = new THREE.Mesh(innerGeo, purpleMat);
    inner.position.set(0, 0.13, 0.04);
    tagInteract(inner);
    earHolder.add(inner);

    return earHolder;
  };
  headGroup.add(makeEar(-1));
  headGroup.add(makeEar(1));

  // 4. Secondary Read: Articulated Arms + Oversized Purple-Cuff Clawed Gloves
  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.22, 0.64, 0.02);

    const upperGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.068, 0.22, 12));
    remapUvRect(upperGeo, 0.49, 0.06, 0.71, 0.22);
    const upper = new THREE.Mesh(upperGeo, furMat);
    upper.position.set(side * 0.05, -0.1, 0.02);
    upper.rotation.z = side * 0.28;
    upper.castShadow = true;
    tagInteract(upper);
    pivot.add(upper);

    // Purple ruffled glove cuff
    const cuffGeo = trackGeo(new THREE.CylinderGeometry(0.088, 0.072, 0.11, 14));
    remapUvRect(cuffGeo, 0.79, 0.35, 0.96, 0.58);
    const cuff = new THREE.Mesh(cuffGeo, purpleMat);
    cuff.position.set(side * 0.09, -0.22, 0.05);
    cuff.rotation.z = side * 0.24;
    cuff.castShadow = true;
    tagInteract(cuff);
    pivot.add(cuff);

    // Oversized white cat paw mitten
    const pawGeo = trackGeo(new THREE.SphereGeometry(0.105, 16, 14));
    pawGeo.scale(0.95, 1.1, 0.88);
    remapUvRect(pawGeo, 0.35, 0.48, 0.49, 0.65);
    const paw = new THREE.Mesh(pawGeo, furMat);
    paw.position.set(side * 0.11, -0.32, 0.07);
    paw.castShadow = true;
    tagInteract(paw);
    pivot.add(paw);

    // Three sharp claws on each paw
    for (let c = -1; c <= 1; c++) {
      const clawGeo = trackGeo(new THREE.ConeGeometry(0.018, 0.075, 8));
      remapUvRect(clawGeo, 0.9, 0.91, 0.97, 0.98);
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * 0.11 + c * 0.04, -0.42, 0.09);
      claw.rotation.x = Math.PI - 0.22;
      tagInteract(claw);
      pivot.add(claw);
    }

    return pivot;
  };

  const armLPivot = makeArm(-1);
  const armRPivot = makeArm(1);
  bodyGroup.add(armLPivot);
  bodyGroup.add(armRPivot);

  // 5. Legs & Warm Leather Paw Boots (bottom at y = 0)
  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.26, 0);

    const thighGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.058, 0.2, 12));
    remapUvRect(thighGeo, 0.49, 0.06, 0.71, 0.22);
    const thigh = new THREE.Mesh(thighGeo, furMat);
    thigh.position.y = -0.1;
    thigh.castShadow = true;
    tagInteract(thigh);
    pivot.add(thigh);

    const footGeo = trackGeo(new THREE.SphereGeometry(0.085, 14, 12));
    footGeo.scale(0.95, 0.68, 1.32);
    remapUvRect(footGeo, 0.03, 0.87, 0.2, 0.98);
    const foot = new THREE.Mesh(footGeo, bootMat);
    foot.position.set(0, -0.205, 0.035);
    foot.castShadow = true;
    tagInteract(foot);
    pivot.add(foot);

    return pivot;
  };

  const legLPivot = makeLeg(-1);
  const legRPivot = makeLeg(1);
  bodyGroup.add(legLPivot);
  bodyGroup.add(legRPivot);

  // 6. Iconic Striped Tail + Digicode Golden Holy Ring + Fluffy Violet Tail Tip
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.28, -0.18);
  tailPivot.rotation.x = 0.55;
  bodyGroup.add(tailPivot);

  // Golden Holy Ring around the tail base (high metalness gleaming gold!)
  const ringGeo = trackGeo(new THREE.TorusGeometry(0.095, 0.026, 12, 24));
  remapUvRect(ringGeo, 0.018, 0.738, 0.152, 0.832);
  const holyRing = new THREE.Mesh(ringGeo, goldMat);
  holyRing.rotation.x = Math.PI * 0.5;
  holyRing.position.set(0, 0.09, -0.02);
  holyRing.castShadow = true;
  tagInteract(holyRing);
  tailPivot.add(holyRing);

  // Purple-chevron striped tail stem (swapAxes = true maps horizontal atlas strip vertically!)
  const tailStemGeo = trackGeo(new THREE.CylinderGeometry(0.062, 0.052, 0.52, 14));
  remapUvRect(tailStemGeo, 0.2, 0.725, 0.8, 0.785, true);
  const tailStem = new THREE.Mesh(tailStemGeo, furMat);
  tailStem.position.set(0, 0.28, -0.05);
  tailStem.rotation.x = -0.22;
  tailStem.castShadow = true;
  tagInteract(tailStem);
  tailPivot.add(tailStem);

  // Fluffy purple tail tip pivot
  const tailTipPivot = new THREE.Group();
  tailTipPivot.position.set(0, 0.53, -0.11);
  tailPivot.add(tailTipPivot);

  const tipCoreGeo = trackGeo(new THREE.SphereGeometry(0.115, 14, 12));
  tipCoreGeo.scale(1.0, 1.25, 1.0);
  remapUvRect(tipCoreGeo, 0.85, 0.71, 0.97, 0.82);
  const tipCore = new THREE.Mesh(tipCoreGeo, purpleMat);
  tipCore.position.y = 0.06;
  tipCore.castShadow = true;
  tagInteract(tipCore);
  tailTipPivot.add(tipCore);

  return {
    group,
    bodyGroup,
    headGroup,
    armLPivot,
    armRPivot,
    legLPivot,
    legRPivot,
    tailPivot,
    tailTipPivot,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
