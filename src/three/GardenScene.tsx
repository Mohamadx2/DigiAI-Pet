import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { getEvolutionLine } from "../digipet/config";
import { Pet, PLAYGROUND_SPOTS } from "../digipet/pet";
import { loadCleanedSpriteCanvas } from "../digipet/spriteCleaner";
import type { VisitorController } from "../digipet/visitor";
import type { WeatherState } from "../digipet/weather";
import { createVisitorCharacter } from "./visitorCharacter";
import {
  createContactShadowTexture,
  createGrassTexture,
} from "./proceduralTextures";
import {
  createEggNest,
  createGardenBushes,
  createGardenTree,
  createPerimeterGarden,
  createSandbox,
  createSwingSet,
} from "./playgroundProps";

export interface BurstFx {
  kind: "food" | "hearts" | "sand" | "leaves" | "hatch";
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface SceneController {
  spawnBurst: (burst: BurstFx) => void;
  resetCamera: () => void;
}

interface GardenSceneProps {
  petRef: React.MutableRefObject<Pet>;
  thoughtTextRef: React.MutableRefObject<string>;
  thoughtVisibleRef: React.MutableRefObject<boolean>;
  menuOpenRef: React.MutableRefObject<boolean>;
  timeModeRef: React.MutableRefObject<"auto" | "day" | "night">;
  weatherRef: React.MutableRefObject<WeatherState>;
  pettingModeRef: React.MutableRefObject<boolean>;
  visitorRef: React.MutableRefObject<VisitorController>;
  controllerRef: React.MutableRefObject<SceneController | null>;
  onInteractPet: () => void;
  onPettingStroke: (isRough: boolean) => void;
  onInteractPlayground: (spot: "swing" | "sandbox" | "bushes" | "tree") => void;
  onInteractVisitor: () => void;
}

interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: "food" | "heart" | "sand" | "leaf" | "star";
  color: string;
  rot: number;
  vrot: number;
}

// Module-scope scratch helpers (zero GC inside animation loop)
const _projVec = new THREE.Vector3();
const _seatPos = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _dummy = new THREE.Object3D();

const _daySky = new THREE.Color(0x9ad8ff);
const _nightSky = new THREE.Color(0x16223d);
const _rainDaySky = new THREE.Color(0x647892);
const _rainNightSky = new THREE.Color(0x111a2c);
const _snowDaySky = new THREE.Color(0xc5d8eb);
const _snowNightSky = new THREE.Color(0x1e2c46);
const _targetSky = new THREE.Color();

const _sunnyGround = new THREE.Color(0xffffff);
const _rainGround = new THREE.Color(0xb6c8de);
const _snowGround = new THREE.Color(0xdeecff);
const _targetGround = new THREE.Color();

const RAIN_COUNT = 180;
const SNOW_COUNT = 160;

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function GardenScene({
  petRef,
  thoughtTextRef,
  thoughtVisibleRef,
  menuOpenRef,
  timeModeRef,
  weatherRef,
  pettingModeRef,
  visitorRef,
  controllerRef,
  onInteractPet,
  onPettingStroke,
  onInteractPlayground,
  onInteractVisitor,
}: GardenSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const callbacksRef = useRef({
    onInteractPet,
    onPettingStroke,
    onInteractPlayground,
    onInteractVisitor,
  });
  callbacksRef.current = {
    onInteractPet,
    onPettingStroke,
    onInteractPlayground,
    onInteractVisitor,
  };

  useEffect(() => {
    const container = mountRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!container || !fxCanvas) return;

    const fxCtx = fxCanvas.getContext("2d");
    const isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    fxCanvas.width = width;
    fxCanvas.height = height;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const activeSky = _daySky.clone();
    scene.background = activeSky;
    scene.fog = new THREE.FogExp2(activeSky.getHex(), 0.022);

    // Mandatory studio environment reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const defaultCamPos = new THREE.Vector3(0, 6.2, 12.2);
    const defaultTarget = new THREE.Vector3(0, 1.1, 0);
    camera.position.copy(defaultCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5.5;
    controls.maxDistance = 19.5;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI * 0.455;
    controls.enablePan = false;
    controls.update();

    let resettingCamera = false;
    controls.addEventListener("start", () => {
      resettingCamera = false;
    });

    // Warm/cool studio outdoor lighting rig
    const hemiLight = new THREE.HemisphereLight(0xbbe4ff, 0x3b6136, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.65);
    keyLight.position.set(8, 13, 7);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.camera.left = -11;
    keyLight.shadow.camera.right = 11;
    keyLight.shadow.camera.top = 11;
    keyLight.shadow.camera.bottom = -11;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9ac6ff, 0.42);
    rimLight.position.set(-7, 5, -8);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();
    const grassTex = createGrassTexture(maxAniso);

    // Meadow ground
    const groundGeo = new THREE.CircleGeometry(42, 48);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Composite 3D Playground Props
    const treeRig = createGardenTree(maxAniso, shadowTex);
    treeRig.group.position.set(PLAYGROUND_SPOTS.tree.x, 0, PLAYGROUND_SPOTS.tree.z);
    scene.add(treeRig.group);

    const swingRig = createSwingSet(maxAniso, shadowTex);
    swingRig.group.position.set(PLAYGROUND_SPOTS.swing.x, 0, PLAYGROUND_SPOTS.swing.z);
    swingRig.group.rotation.y = -0.35;
    scene.add(swingRig.group);

    const sandboxGroup = createSandbox(maxAniso, shadowTex);
    sandboxGroup.position.set(PLAYGROUND_SPOTS.sandbox.x, 0, PLAYGROUND_SPOTS.sandbox.z);
    sandboxGroup.rotation.y = 0.18;
    scene.add(sandboxGroup);

    const bushRig = createGardenBushes(maxAniso, shadowTex);
    bushRig.group.position.set(PLAYGROUND_SPOTS.bushes.x, 0, PLAYGROUND_SPOTS.bushes.z);
    scene.add(bushRig.group);

    const eggNest = createEggNest(maxAniso, shadowTex);
    eggNest.position.set(0, 0, 0.6);
    scene.add(eggNest);

    const perimeter = createPerimeterGarden(maxAniso);
    scene.add(perimeter);

    // ------------------------------------------------------------------
    // 3D Instanced Weather Systems (Rain & Snow, Zero-GC)
    // ------------------------------------------------------------------
    const rainGeo = new THREE.BoxGeometry(0.025, 0.52, 0.025);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xaad4ff,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    scene.add(rainMesh);

    const rainX = new Float32Array(RAIN_COUNT);
    const rainY = new Float32Array(RAIN_COUNT);
    const rainZ = new Float32Array(RAIN_COUNT);
    const rainSpeed = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainX[i] = (Math.random() - 0.5) * 20;
      rainY[i] = Math.random() * 12;
      rainZ[i] = (Math.random() - 0.5) * 18;
      rainSpeed[i] = 11 + Math.random() * 5;
    }

    const snowGeo = new THREE.OctahedronGeometry(0.075, 0);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xf8fbff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, SNOW_COUNT);
    snowMesh.frustumCulled = false;
    snowMesh.visible = false;
    scene.add(snowMesh);

    const snowX = new Float32Array(SNOW_COUNT);
    const snowY = new Float32Array(SNOW_COUNT);
    const snowZ = new Float32Array(SNOW_COUNT);
    const snowSpeed = new Float32Array(SNOW_COUNT);
    const snowPhase = new Float32Array(SNOW_COUNT);
    for (let i = 0; i < SNOW_COUNT; i++) {
      snowX[i] = (Math.random() - 0.5) * 20;
      snowY[i] = Math.random() * 11;
      snowZ[i] = (Math.random() - 0.5) * 18;
      snowSpeed[i] = 1.2 + Math.random() * 1.1;
      snowPhase[i] = Math.random() * Math.PI * 2;
    }

    // Grounded 2D Digimon Sprite Actor in 3D Space
    const petGroup = new THREE.Group();
    const petShadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    petShadowGeo.rotateX(-Math.PI / 2);
    const petShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    const petShadow = new THREE.Mesh(petShadowGeo, petShadowMat);
    petShadow.position.y = 0.02;
    petGroup.add(petShadow);

    const spriteGeo = new THREE.PlaneGeometry(1.75, 1.75);
    const spriteMat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.22,
      side: THREE.DoubleSide,
    });
    const petSpriteMesh = new THREE.Mesh(spriteGeo, spriteMat);
    petSpriteMesh.position.y = 0.88;
    petSpriteMesh.userData.interact = "pet";
    petGroup.add(petSpriteMesh);
    scene.add(petGroup);

    // Preload all cleaned Digimon sprite textures from /assets
    const spriteTextures = new Map<string, THREE.CanvasTexture>();
    const allUrls = new Set<string>();
    getEvolutionLine("pumpkin").forEach((s) => allUrls.add(s.sprite));
    getEvolutionLine("luminamon").forEach((s) => allUrls.add(s.sprite));

    allUrls.forEach((url) => {
      loadCleanedSpriteCanvas(url).then((canvas) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        spriteTextures.set(url, tex);
      });
    });

    const visitorRig = createVisitorCharacter(maxAniso, shadowTex);
    visitorRig.group.visible = false;
    scene.add(visitorRig.group);

    const interactiveRoots: THREE.Object3D[] = [
      petSpriteMesh,
      visitorRig.group,
      swingRig.group,
      sandboxGroup,
      bushRig.group,
      treeRig.group,
    ];

    // 2D Particle FX System
    const particles: Particle2D[] = [];
    let ambientFxTimer = 0;

    const projectWorldToScreen = (wx: number, wy: number, wz: number): [number, number, boolean] => {
      _projVec.set(wx, wy, wz);
      _projVec.project(camera);
      const visible = _projVec.z < 1.0;
      const sx = (_projVec.x + 1) * 0.5 * fxCanvas.width;
      const sy = (-_projVec.y + 1) * 0.5 * fxCanvas.height;
      return [sx, sy, visible];
    };

    const spawnBurst2D = (burst: BurstFx) => {
      const [sx, sy, visible] = projectWorldToScreen(burst.worldX, burst.worldY, burst.worldZ);
      if (!visible) return;
      const count = burst.kind === "hatch" ? 22 : 10;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = burst.kind === "food" ? 130 + Math.random() * 90 : 75 + Math.random() * 110;
        let kind: Particle2D["kind"] = "star";
        let color = "#fde047";
        if (burst.kind === "food") {
          kind = "food";
          color = ["#fb923c", "#facc15", "#f97316"][i % 3];
        } else if (burst.kind === "hearts") {
          kind = "heart";
          color = "#fb7185";
        } else if (burst.kind === "sand") {
          kind = "sand";
          color = "#e8c476";
        } else if (burst.kind === "leaves") {
          kind = "leaf";
          color = i % 2 === 0 ? "#4ade80" : "#f472b6";
        }
        particles.push({
          x: sx + (burst.kind === "food" ? (Math.random() - 0.5) * 260 : (Math.random() - 0.5) * 28),
          y: sy + (burst.kind === "food" ? -180 - Math.random() * 60 : (Math.random() - 0.5) * 24),
          vx: burst.kind === "food" ? 0 : Math.cos(angle) * speed,
          vy: burst.kind === "food" ? 140 : Math.sin(angle) * speed - 40,
          life: burst.kind === "food" ? 0.75 : 0.95 + Math.random() * 0.45,
          maxLife: 1.1,
          size: 7 + Math.random() * 6,
          kind,
          color,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 6,
        });
      }
    };

    controllerRef.current = {
      spawnBurst: spawnBurst2D,
      resetCamera: () => {
        resettingCamera = true;
      },
    };

    // ------------------------------------------------------------------
    // Petting Hand & Raycast Pointer Tracking
    // ------------------------------------------------------------------
    let pointerDownPos = { x: 0, y: 0 };
    let lastMovePos = { x: 0, y: 0 };
    let isPointerDownOnPet = false;
    let hoveringPet = false;
    let handScreenX = -100;
    let handScreenY = -100;
    let handVisible = false;
    let handRubAnim = 0;
    let strokeAccum = 0;
    let lastStrokeMs = 0;
    let pokeTimestamps: number[] = [];

    const hitTestInteractive = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      return _raycaster.intersectObjects(interactiveRoots, true);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      lastMovePos = { x: e.clientX, y: e.clientY };
      if (menuOpenRef.current) return;

      const hits = hitTestInteractive(e.clientX, e.clientY);
      const hitPet = hits.length > 0 && hits[0].object.userData.interact === "pet";
      hoveringPet = hitPet;

      if (hitPet) {
        isPointerDownOnPet = true;
        // Disable camera orbit while stroking directly on the pet
        controls.enabled = false;

        const nowMs = performance.now();
        pokeTimestamps.push(nowMs);
        pokeTimestamps = pokeTimestamps.filter((ts) => nowMs - ts < 1200);
        if (pokeTimestamps.length >= 3) {
          pokeTimestamps = [];
          handRubAnim = 1.0;
          lastStrokeMs = nowMs;
          callbacksRef.current.onPettingStroke(true);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      handScreenX = e.clientX - rect.left;
      handScreenY = e.clientY - rect.top;
      handVisible = true;

      if (menuOpenRef.current) return;

      const dx = e.clientX - lastMovePos.x;
      const dy = e.clientY - lastMovePos.y;
      lastMovePos = { x: e.clientX, y: e.clientY };
      const stepDist = Math.hypot(dx, dy);

      const hits = hitTestInteractive(e.clientX, e.clientY);
      hoveringPet = hits.length > 0 && hits[0].object.userData.interact === "pet";

      const canStroke =
        hoveringPet && (isPointerDownOnPet || (pettingModeRef.current && stepDist > 1.5));

      if (canStroke) {
        handRubAnim = 1.0;
        const nowMs = performance.now();
        if (stepDist > 42 && nowMs - lastStrokeMs >= 500) {
          // Very abrupt fast swipe triggers rough poke reaction
          strokeAccum = 0;
          lastStrokeMs = nowMs;
          callbacksRef.current.onPettingStroke(true);
        } else {
          strokeAccum += stepDist;
          if (strokeAccum >= 46 && nowMs - lastStrokeMs >= 680) {
            strokeAccum = 0;
            lastStrokeMs = nowMs;
            callbacksRef.current.onPettingStroke(false);
          }
        }
      }

      if (pettingModeRef.current && !menuOpenRef.current) {
        renderer.domElement.style.cursor = "none";
      } else {
        renderer.domElement.style.cursor = hits.length > 0 ? "pointer" : "grab";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDownOnPet = isPointerDownOnPet;
      isPointerDownOnPet = false;
      controls.enabled = true;
      strokeAccum = 0;

      if (menuOpenRef.current) return;
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 8) return;

      const hits = hitTestInteractive(e.clientX, e.clientY);
      if (hits.length > 0) {
        const tag = hits[0].object.userData.interact as string | undefined;
        if (tag === "pet") {
          if (pettingModeRef.current || wasDownOnPet) {
            if (pettingModeRef.current) {
              handRubAnim = 1.0;
              callbacksRef.current.onPettingStroke(false);
            } else {
              callbacksRef.current.onInteractPet();
            }
          }
        } else if (tag === "visitor") {
          callbacksRef.current.onInteractVisitor();
        } else if (tag === "swing" || tag === "sandbox" || tag === "bushes" || tag === "tree") {
          callbacksRef.current.onInteractPlayground(tag);
        }
      }
    };

    const onPointerLeave = () => {
      handVisible = false;
      isPointerDownOnPet = false;
      controls.enabled = true;
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      fxCanvas.width = w;
      fxCanvas.height = h;
    };
    window.addEventListener("resize", onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ------------------------------------------------------------------
    // 2D FX Overlay Renderer (Eye FX, Emotions, Thought Bubbles, Petting Hand)
    // ------------------------------------------------------------------
    const draw2DEyeAndMoodFx = (dt: number) => {
      if (!fxCtx) return;
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

      const pet = petRef.current;
      const info = pet.getEvolutionInfo();
      const scaleFactor =
        pet.state.evolution_stage >= 4 ? 1.35 : pet.state.evolution_stage === 3 ? 1.15 : 1.0;

      // Subtle lightning flash screen tint during rain thunder
      const flash = weatherRef.current.lightningFlash;
      if (flash > 0.04) {
        fxCtx.save();
        fxCtx.fillStyle = `rgba(224, 242, 254, ${Math.min(0.28, flash * 0.28)})`;
        fxCtx.fillRect(0, 0, fxCanvas.width, fxCanvas.height);
        fxCtx.restore();
      }

      const [petScreenX, petScreenY, petVisible] = projectWorldToScreen(
        petGroup.position.x,
        petGroup.position.y + 0.95 * scaleFactor,
        petGroup.position.z
      );

      // Update & draw 2D particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        if (p.kind === "food" && petVisible) {
          p.x += (petScreenX - p.x) * Math.min(1, dt * 5.2);
          p.y += (petScreenY - p.y) * Math.min(1, dt * 5.2);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 120 * dt;
          p.rot += p.vrot * dt;
        }

        const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        fxCtx.save();
        fxCtx.globalAlpha = alpha;
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot);
        fxCtx.fillStyle = p.color;

        if (p.kind === "heart") {
          fxCtx.font = `bold ${Math.round(p.size * 2)}px sans-serif`;
          fxCtx.textAlign = "center";
          fxCtx.textBaseline = "middle";
          fxCtx.fillText("♥", 0, 0);
        } else if (p.kind === "star") {
          fxCtx.font = `bold ${Math.round(p.size * 2)}px sans-serif`;
          fxCtx.textAlign = "center";
          fxCtx.textBaseline = "middle";
          fxCtx.fillText("✦", 0, 0);
        } else if (p.kind === "leaf") {
          fxCtx.beginPath();
          fxCtx.ellipse(0, 0, p.size * 0.9, p.size * 0.45, 0, 0, Math.PI * 2);
          fxCtx.fill();
        } else {
          fxCtx.beginPath();
          fxCtx.arc(0, 0, p.size * 0.65, 0, Math.PI * 2);
          fxCtx.fill();
        }
        fxCtx.restore();
      }

      if (petVisible) {
        // 2D Egg crack & warmth FX
        if (pet.state.life_phase === "egg") {
          const warmth = pet.state.egg_warmth;
          if (warmth > 45) {
            fxCtx.save();
            fxCtx.strokeStyle = "rgba(255, 245, 210, 0.92)";
            fxCtx.lineWidth = 2.5;
            fxCtx.beginPath();
            fxCtx.moveTo(petScreenX - 10, petScreenY - 12);
            fxCtx.lineTo(petScreenX - 2, petScreenY - 2);
            fxCtx.lineTo(petScreenX + 8, petScreenY - 8);
            if (warmth > 75) {
              fxCtx.lineTo(petScreenX + 14, petScreenY + 4);
            }
            fxCtx.stroke();
            fxCtx.restore();
          }
        }

        // 2D Eye & Emotion FX anchored near the Digimon's face/head
        const headX = petScreenX;
        const headY = petScreenY - 18 * scaleFactor;
        const t = performance.now() / 1000;

        if (pet.eyeFx === "happy_arcs") {
          fxCtx.save();
          fxCtx.strokeStyle = "#fde047";
          fxCtx.lineWidth = 3;
          fxCtx.lineCap = "round";
          [-14, 14].forEach((ox) => {
            fxCtx.beginPath();
            fxCtx.arc(headX + ox, headY + 4, 7, Math.PI * 1.15, Math.PI * 1.85);
            fxCtx.stroke();
          });
          fxCtx.restore();
        } else if (pet.eyeFx === "angry_brows") {
          fxCtx.save();
          fxCtx.strokeStyle = "#f43f5e";
          fxCtx.lineWidth = 3.2;
          fxCtx.lineCap = "round";
          // Sharp inward-angled > < brows
          fxCtx.beginPath();
          fxCtx.moveTo(headX - 20, headY - 6);
          fxCtx.lineTo(headX - 7, headY + 1);
          fxCtx.moveTo(headX + 20, headY - 6);
          fxCtx.lineTo(headX + 7, headY + 1);
          fxCtx.stroke();
          const pulse = 1 + Math.sin(t * 10) * 0.12;
          fxCtx.font = `bold ${Math.round(18 * pulse)}px sans-serif`;
          fxCtx.textAlign = "center";
          fxCtx.fillText("💢", headX + 28, headY - 24);
          fxCtx.restore();
        } else if (pet.eyeFx === "scared_wide") {
          fxCtx.save();
          const jitter = Math.sin(t * 28) * 1.6;
          [-12, 12].forEach((ox) => {
            fxCtx.fillStyle = "#f8fafc";
            fxCtx.strokeStyle = "#0f172a";
            fxCtx.lineWidth = 1.6;
            fxCtx.beginPath();
            fxCtx.arc(headX + ox + jitter, headY, 6.2, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.stroke();
            fxCtx.fillStyle = "#0f172a";
            fxCtx.beginPath();
            fxCtx.arc(headX + ox + jitter * 1.5, headY, 2.1, 0, Math.PI * 2);
            fxCtx.fill();
          });
          fxCtx.fillStyle = "#38bdf8";
          fxCtx.font = "bold 18px sans-serif";
          fxCtx.textAlign = "center";
          fxCtx.fillText("!!", headX - 28, headY - 24);
          fxCtx.restore();
        } else if (pet.eyeFx === "sad_tears") {
          fxCtx.save();
          fxCtx.strokeStyle = "#93c5fd";
          fxCtx.lineWidth = 2.6;
          fxCtx.lineCap = "round";
          // Droopy outward-sloping brows
          fxCtx.beginPath();
          fxCtx.moveTo(headX - 18, headY + 1);
          fxCtx.lineTo(headX - 7, headY - 4);
          fxCtx.moveTo(headX + 18, headY + 1);
          fxCtx.lineTo(headX + 7, headY - 4);
          fxCtx.stroke();

          const tearDrop = (t * 24) % 18;
          fxCtx.fillStyle = "#38bdf8";
          [-12, 12].forEach((ox) => {
            fxCtx.beginPath();
            fxCtx.arc(headX + ox, headY + 6 + tearDrop, 3.3, 0, Math.PI * 2);
            fxCtx.fill();
          });
          fxCtx.restore();
        } else if (pet.eyeFx === "wondering_stars") {
          fxCtx.save();
          const bob = Math.sin(t * 4.5) * 4;
          fxCtx.fillStyle = "#fde047";
          fxCtx.font = "bold 21px sans-serif";
          fxCtx.textAlign = "center";
          fxCtx.fillText("?", headX + 24, headY - 26 + bob);
          fxCtx.fillStyle = "#bae6fd";
          fxCtx.font = "bold 15px sans-serif";
          fxCtx.fillText("✦", headX - 26, headY - 20 - bob);
          fxCtx.restore();
        } else if (pet.eyeFx === "blink") {
          fxCtx.save();
          fxCtx.strokeStyle = "#1e293b";
          fxCtx.lineWidth = 3;
          fxCtx.lineCap = "round";
          [-12, 12].forEach((ox) => {
            fxCtx.beginPath();
            fxCtx.moveTo(headX + ox - 6, headY);
            fxCtx.lineTo(headX + ox + 6, headY);
            fxCtx.stroke();
          });
          fxCtx.restore();
        } else if (pet.eyeFx === "hearts") {
          fxCtx.save();
          fxCtx.fillStyle = "#fb7185";
          fxCtx.font = "bold 20px sans-serif";
          fxCtx.textAlign = "center";
          const floatY = Math.sin(t * 5) * 6;
          fxCtx.fillText("♥", headX - 24, headY - 26 + floatY);
          fxCtx.fillText("♥", headX + 24, headY - 34 - floatY);
          fxCtx.restore();
        } else if (pet.eyeFx === "sparkles") {
          fxCtx.save();
          fxCtx.fillStyle = "#fef08a";
          fxCtx.font = "bold 20px sans-serif";
          fxCtx.textAlign = "center";
          const spin = Math.sin(t * 7) * 5;
          fxCtx.fillText("✦", headX - 28, headY - 24 + spin);
          fxCtx.fillText("✦", headX + 28, headY - 28 - spin);
          fxCtx.restore();
        } else if (pet.eyeFx === "sweat") {
          fxCtx.save();
          fxCtx.fillStyle = "#38bdf8";
          fxCtx.font = "bold 20px sans-serif";
          fxCtx.textAlign = "center";
          fxCtx.fillText("💧", headX + 26, headY - 12 + (t % 0.6) * 14);
          fxCtx.restore();
        } else if (pet.eyeFx === "dizzy") {
          fxCtx.save();
          fxCtx.fillStyle = "#f472b6";
          fxCtx.font = "bold 20px sans-serif";
          fxCtx.textAlign = "center";
          fxCtx.fillText("💫", headX + Math.cos(t * 5) * 20, headY - 32);
          fxCtx.restore();
        } else if (pet.eyeFx === "sleep_z") {
          fxCtx.save();
          fxCtx.fillStyle = "#cbd5ff";
          fxCtx.font = "bold 18px sans-serif";
          fxCtx.textAlign = "center";
          const drift = (t * 18) % 24;
          fxCtx.fillText("Zzz", headX + 26, headY - 24 - drift);
          fxCtx.restore();
        } else if (pet.eyeFx === "curious") {
          fxCtx.save();
          fxCtx.fillStyle = "#fde047";
          fxCtx.font = "bold 22px sans-serif";
          fxCtx.textAlign = "center";
          fxCtx.fillText("!", headX + 24, headY - 28);
          fxCtx.restore();
        }

        // Need Icon above pet
        if (pet.needIcon) {
          const iconMap: Record<string, string> = {
            feed: "🍖",
            clean: "🛁",
            play: "🎾",
            sleep: "💤",
            med: "💊",
            learn: "📚",
            speed: "⚡",
            sick: "🤒",
          };
          const sym = iconMap[pet.needIcon];
          if (sym) {
            fxCtx.font = "26px sans-serif";
            fxCtx.textAlign = "center";
            fxCtx.fillText(sym, petScreenX, headY - 52);
          }
        }

        // Thought Bubble above pet
        const thought = thoughtTextRef.current;
        if (thoughtVisibleRef.current && thought && !menuOpenRef.current) {
          fxCtx.save();
          fxCtx.font = '14px "Plus Jakarta Sans", "Segoe UI", sans-serif';
          const padX = 14;
          const textW = Math.min(240, fxCtx.measureText(thought).width);
          const bw = textW + padX * 2;
          const bh = 34;
          const bx = Math.max(12, Math.min(fxCanvas.width - bw - 12, petScreenX - bw / 2));
          const by = Math.max(76, headY - 96);

          fxCtx.fillStyle = "rgba(248, 250, 252, 0.94)";
          fxCtx.strokeStyle = "rgba(125, 211, 252, 0.95)";
          fxCtx.lineWidth = 2;
          fxCtx.beginPath();
          fxCtx.roundRect(bx, by, bw, bh, 16);
          fxCtx.fill();
          fxCtx.stroke();

          // Tail dot
          fxCtx.beginPath();
          fxCtx.arc(petScreenX, by + bh + 7, 4, 0, Math.PI * 2);
          fxCtx.fill();
          fxCtx.stroke();

          fxCtx.fillStyle = "#1e293b";
          fxCtx.textAlign = "center";
          fxCtx.textBaseline = "middle";
          fxCtx.fillText(thought, bx + bw / 2, by + bh / 2, bw - 16);
          fxCtx.restore();
        }

        // Subtle floating name label under pet
        if (pet.state.life_phase === "pet") {
          fxCtx.save();
          fxCtx.font = '600 13px "Plus Jakarta Sans", "Segoe UI", sans-serif';
          fxCtx.textAlign = "center";
          fxCtx.fillStyle = "rgba(15, 23, 42, 0.72)";
          const label = `${pet.state.name} · ${info.name}`;
          const lw = fxCtx.measureText(label).width + 16;
          const [gx, gy, gVis] = projectWorldToScreen(
            petGroup.position.x,
            0.02,
            petGroup.position.z + 0.65
          );
          if (gVis) {
            fxCtx.beginPath();
            fxCtx.roundRect(gx - lw / 2, gy, lw, 22, 6);
            fxCtx.fill();
            fxCtx.fillStyle = "#f8fafc";
            fxCtx.textBaseline = "middle";
            fxCtx.fillText(label, gx, gy + 11);
          }
          fxCtx.restore();
        }
      }

      // Interactive Petting Hand Cursor Overlay
      handRubAnim = Math.max(0, handRubAnim - dt * 3.5);
      if ((pettingModeRef.current || isPointerDownOnPet) && handVisible && !menuOpenRef.current) {
        const t = performance.now() / 1000;
        const tilt = hoveringPet
          ? Math.sin(t * 14) * (0.14 + handRubAnim * 0.22)
          : Math.sin(t * 3) * 0.05;

        fxCtx.save();
        fxCtx.translate(handScreenX, handScreenY);
        if (hoveringPet) {
          fxCtx.beginPath();
          fxCtx.arc(0, 0, 22 + handRubAnim * 5, 0, Math.PI * 2);
          fxCtx.strokeStyle = "rgba(253, 224, 71, 0.75)";
          fxCtx.lineWidth = 2;
          fxCtx.stroke();
        }
        fxCtx.rotate(tilt - 0.18);
        fxCtx.font = "30px sans-serif";
        fxCtx.textAlign = "center";
        fxCtx.textBaseline = "middle";
        fxCtx.fillText("🤚", 0, 0);
        fxCtx.restore();
      }

      // Wandering 3D Visitor Character Label & Speech Bubble
      const visitor = visitorRef.current;
      if (visitor.isVisible()) {
        const [vx, vy, vVis] = projectWorldToScreen(visitor.worldX, 1.48, visitor.worldZ);
        if (vVis) {
          if (visitor.bubbleText && !menuOpenRef.current) {
            fxCtx.save();
            fxCtx.font = '13px "Plus Jakarta Sans", "Segoe UI", sans-serif';
            const padX = 12;
            const textW = Math.min(200, fxCtx.measureText(visitor.bubbleText).width);
            const bw = textW + padX * 2;
            const bh = 30;
            const bx = Math.max(12, Math.min(fxCanvas.width - bw - 12, vx - bw / 2));
            const by = Math.max(76, vy - 44);

            fxCtx.fillStyle = "rgba(250, 245, 255, 0.94)";
            fxCtx.strokeStyle = "rgba(192, 132, 252, 0.95)";
            fxCtx.lineWidth = 2;
            fxCtx.beginPath();
            fxCtx.roundRect(bx, by, bw, bh, 14);
            fxCtx.fill();
            fxCtx.stroke();

            fxCtx.fillStyle = "#2e1065";
            fxCtx.textAlign = "center";
            fxCtx.textBaseline = "middle";
            fxCtx.fillText(visitor.bubbleText, bx + bw / 2, by + bh / 2, bw - 16);
            fxCtx.restore();
          }

          const [vgx, vgy, vgVis] = projectWorldToScreen(
            visitor.worldX,
            0.02,
            visitor.worldZ + 0.55
          );
          if (vgVis) {
            fxCtx.save();
            fxCtx.font = '600 12px "Plus Jakarta Sans", "Segoe UI", sans-serif';
            fxCtx.textAlign = "center";
            const vLabel = "Tailmon · Visitor";
            const vlw = fxCtx.measureText(vLabel).width + 14;
            fxCtx.fillStyle = "rgba(46, 16, 101, 0.72)";
            fxCtx.beginPath();
            fxCtx.roundRect(vgx - vlw / 2, vgy, vlw, 20, 6);
            fxCtx.fill();
            fxCtx.fillStyle = "#f3e8ff";
            fxCtx.textBaseline = "middle";
            fxCtx.fillText(vLabel, vgx, vgy + 10);
            fxCtx.restore();
          }
        }
      }
    };

    // ------------------------------------------------------------------
    // Main Frame Loop (Software-WebGL safe pacing)
    // ------------------------------------------------------------------
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const pet = petRef.current;
      const wState = weatherRef.current;
      const weather = wState.current;

      // Day / Night + Weather Atmosphere
      const hour = new Date().getHours();
      const wantNight =
        timeModeRef.current === "night" ||
        (timeModeRef.current === "auto" && (hour < 7 || hour >= 19));

      if (weather === "rain") {
        _targetSky.copy(wantNight ? _rainNightSky : _rainDaySky);
        _targetGround.copy(_rainGround);
      } else if (weather === "snow") {
        _targetSky.copy(wantNight ? _snowNightSky : _snowDaySky);
        _targetGround.copy(_snowGround);
      } else {
        _targetSky.copy(wantNight ? _nightSky : _daySky);
        _targetGround.copy(_sunnyGround);
      }

      const dampAlpha = 1 - Math.exp(-3 * dt);
      activeSky.lerp(_targetSky, dampAlpha);
      groundMat.color.lerp(_targetGround, dampAlpha);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(activeSky);
        const targetDensity = weather === "rain" ? 0.036 : weather === "snow" ? 0.03 : 0.022;
        scene.fog.density = THREE.MathUtils.damp(scene.fog.density, targetDensity, 3, dt);
      }

      const baseKey =
        weather === "rain"
          ? wantNight
            ? 0.42
            : 0.95
          : weather === "snow"
          ? wantNight
            ? 0.58
            : 1.32
          : wantNight
          ? 0.55
          : 1.65;
      const lightningBoost = wState.lightningFlash * 1.9;
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, baseKey + lightningBoost, 6, dt);

      const baseHemi =
        weather === "rain"
          ? wantNight
            ? 0.36
            : 0.65
          : weather === "snow"
          ? wantNight
            ? 0.5
            : 0.92
          : wantNight
          ? 0.45
          : 0.85;
      hemiLight.intensity = THREE.MathUtils.damp(hemiLight.intensity, baseHemi, 3, dt);

      const lanternWant = wantNight || weather === "rain" ? 2.4 : 0.4;
      treeRig.lanternLight.intensity = THREE.MathUtils.damp(
        treeRig.lanternLight.intensity,
        lanternWant,
        3,
        dt
      );
      treeRig.lanternBulbMat.emissiveIntensity = wantNight || weather === "rain" ? 1.6 : 0.45;

      // Update 3D Rain InstancedMesh
      rainMesh.visible = weather === "rain";
      if (rainMesh.visible) {
        for (let i = 0; i < RAIN_COUNT; i++) {
          rainY[i] -= rainSpeed[i] * dt;
          rainX[i] -= 1.1 * dt;
          if (rainY[i] < 0) {
            rainY[i] = 10 + Math.random() * 3;
            rainX[i] = (Math.random() - 0.5) * 20;
            rainZ[i] = (Math.random() - 0.5) * 18;
          }
          _dummy.position.set(rainX[i], rainY[i], rainZ[i]);
          _dummy.rotation.set(0, 0, -0.1);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          rainMesh.setMatrixAt(i, _dummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }

      // Update 3D Snow InstancedMesh
      snowMesh.visible = weather === "snow";
      if (snowMesh.visible) {
        const t = now * 0.001;
        for (let i = 0; i < SNOW_COUNT; i++) {
          snowY[i] -= snowSpeed[i] * dt;
          const sway = Math.sin(t * 1.4 + snowPhase[i]) * 0.45 * dt;
          snowX[i] += sway;
          if (snowY[i] < 0) {
            snowY[i] = 9.5 + Math.random() * 2.5;
            snowX[i] = (Math.random() - 0.5) * 20;
            snowZ[i] = (Math.random() - 0.5) * 18;
          }
          _dummy.position.set(snowX[i], snowY[i], snowZ[i]);
          _dummy.rotation.set(t + snowPhase[i], t * 0.8, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          snowMesh.setMatrixAt(i, _dummy.matrix);
        }
        snowMesh.instanceMatrix.needsUpdate = true;
      }

      // Smooth camera reset if requested
      if (resettingCamera) {
        const camAlpha = 1 - Math.exp(-6 * dt);
        camera.position.lerp(defaultCamPos, camAlpha);
        controls.target.lerp(defaultTarget, camAlpha);
        if (camera.position.distanceTo(defaultCamPos) < 0.05) {
          resettingCamera = false;
        }
      }
      controls.update();

      // Sync sprite texture & scale to pet evolution stage
      const stageInfo = pet.getEvolutionInfo();
      const desiredTex = spriteTextures.get(stageInfo.sprite);
      if (desiredTex && spriteMat.map !== desiredTex) {
        spriteMat.map = desiredTex;
        spriteMat.needsUpdate = true;
      }

      const stageScale =
        pet.state.life_phase === "egg"
          ? 0.92
          : pet.state.evolution_stage >= 4
          ? 1.45
          : pet.state.evolution_stage === 3
          ? 1.25
          : 1.05;

      // Egg nest visibility
      eggNest.visible = pet.state.life_phase === "egg";

      // Update 3D Swing & Pet position/activity/mood expression
      if (pet.state.life_phase === "egg") {
        petGroup.position.set(0, 0.08, 0.6);
        const wobble = Math.sin(now * 0.0055) * (0.04 + (pet.state.egg_warmth / 100) * 0.09);
        petSpriteMesh.rotation.z = wobble;
        petSpriteMesh.scale.set(stageScale, stageScale, 1);
      } else {
        if (pet.activity === "swing") {
          const swingAngle = Math.sin(pet.swingPhase) * 0.44;
          swingRig.swingPivot.rotation.x = THREE.MathUtils.damp(
            swingRig.swingPivot.rotation.x,
            swingAngle,
            10,
            dt
          );
          swingRig.seatWorldHelper.getWorldPosition(_seatPos);
          petGroup.position.set(_seatPos.x, _seatPos.y + 0.04, _seatPos.z);
          ambientFxTimer -= dt;
          if (ambientFxTimer <= 0) {
            ambientFxTimer = 0.7;
            spawnBurst2D({
              kind: "hearts",
              worldX: _seatPos.x,
              worldY: _seatPos.y + 1.0,
              worldZ: _seatPos.z,
            });
          }
        } else {
          swingRig.swingPivot.rotation.x = THREE.MathUtils.damp(
            swingRig.swingPivot.rotation.x,
            Math.sin(now * 0.0012) * 0.04,
            4,
            dt
          );

          if (pet.activity === "tree") {
            const climbX = PLAYGROUND_SPOTS.tree.x + 0.75;
            const climbY = 2.48 + Math.sin(now * 0.004) * 0.05;
            const climbZ = PLAYGROUND_SPOTS.tree.z + 0.35;
            petGroup.position.x = THREE.MathUtils.damp(petGroup.position.x, climbX, 6, dt);
            petGroup.position.y = THREE.MathUtils.damp(petGroup.position.y, climbY, 6, dt);
            petGroup.position.z = THREE.MathUtils.damp(petGroup.position.z, climbZ, 6, dt);
          } else {
            const walkBounce =
              Math.abs(pet.vx) > 0.05 || Math.abs(pet.vz) > 0.05
                ? Math.abs(Math.sin(now * 0.014)) * 0.14
                : pet.activity === "sandbox"
                ? Math.abs(Math.sin(now * 0.01)) * 0.12
                : Math.sin(now * 0.003) * 0.03;

            const groundY = pet.activity === "sandbox" ? 0.18 : 0;
            petGroup.position.x = THREE.MathUtils.damp(petGroup.position.x, pet.worldX, 12, dt);
            petGroup.position.z = THREE.MathUtils.damp(petGroup.position.z, pet.worldZ, 12, dt);
            petGroup.position.y = THREE.MathUtils.damp(
              petGroup.position.y,
              groundY + walkBounce,
              14,
              dt
            );

            if (pet.activity === "sandbox") {
              ambientFxTimer -= dt;
              if (ambientFxTimer <= 0) {
                ambientFxTimer = 0.55;
                spawnBurst2D({
                  kind: "sand",
                  worldX: petGroup.position.x,
                  worldY: 0.35,
                  worldZ: petGroup.position.z,
                });
              }
            } else if (pet.activity === "bushes") {
              bushRig.bushes.forEach((b, idx) => {
                const bs = (b.userData.baseScale as number) || 1;
                const rustle = Math.sin(now * 0.02 + idx * 1.4) * 0.07;
                b.rotation.z = rustle;
                b.scale.set(bs * (1 + rustle * 0.5), bs * (1 - rustle * 0.4), bs);
              });
              ambientFxTimer -= dt;
              if (ambientFxTimer <= 0) {
                ambientFxTimer = 0.48;
                spawnBurst2D({
                  kind: "leaves",
                  worldX: PLAYGROUND_SPOTS.bushes.x,
                  worldY: 0.9,
                  worldZ: PLAYGROUND_SPOTS.bushes.z,
                });
              }
            }
          }
        }

        if (pet.activity !== "bushes") {
          bushRig.bushes.forEach((b) => {
            const bs = (b.userData.baseScale as number) || 1;
            b.rotation.z = THREE.MathUtils.damp(b.rotation.z, 0, 8, dt);
            b.scale.x = THREE.MathUtils.damp(b.scale.x, bs, 8, dt);
            b.scale.y = THREE.MathUtils.damp(b.scale.y, bs, 8, dt);
          });
        }

        // Billboard sprite toward camera + subtle emotion posture
        petSpriteMesh.quaternion.copy(camera.quaternion);
        if (pet.state.mood === "scared") {
          petSpriteMesh.rotateZ(Math.sin(now * 0.045) * 0.065);
        } else if (pet.state.mood === "wondering") {
          petSpriteMesh.rotateZ(0.11);
        } else if (pet.state.mood === "angry") {
          petSpriteMesh.rotateZ(Math.sin(now * 0.02) * 0.045);
        }

        const flipX = pet.facingRight ? stageScale : -stageScale;
        const moodScaleY =
          pet.state.mood === "sad"
            ? stageScale * 0.94
            : pet.state.mood === "happy"
            ? stageScale * (1 + Math.abs(Math.sin(now * 0.008)) * 0.05)
            : pet.activity === "walk"
            ? stageScale * (1 + Math.sin(now * 0.025) * 0.06)
            : stageScale;
        petSpriteMesh.scale.set(flipX, moodScaleY, 1);
      }

      // Animate Random-Visit 3D Character (Tailmon)
      const visitor = visitorRef.current;
      visitorRig.group.visible = visitor.isVisible();
      if (visitorRig.group.visible) {
        visitorRig.group.position.set(visitor.worldX, 0, visitor.worldZ);
        visitorRig.group.rotation.y = visitor.yaw;
        const visScale = Math.max(0.01, visitor.visibility);
        visitorRig.group.scale.setScalar(visScale);

        const walkAmp = visitor.speed > 0.1 ? 0.52 : 0;
        const stride = Math.sin(visitor.walkCycle);
        visitorRig.legLPivot.rotation.x = THREE.MathUtils.damp(
          visitorRig.legLPivot.rotation.x,
          stride * walkAmp,
          12,
          dt
        );
        visitorRig.legRPivot.rotation.x = THREE.MathUtils.damp(
          visitorRig.legRPivot.rotation.x,
          -stride * walkAmp,
          12,
          dt
        );
        visitorRig.bodyGroup.position.y =
          visitor.speed > 0.1
            ? Math.abs(stride) * 0.065
            : Math.sin(now * 0.003) * 0.018;

        visitorRig.armLPivot.rotation.x = THREE.MathUtils.damp(
          visitorRig.armLPivot.rotation.x,
          -stride * walkAmp * 0.8,
          10,
          dt
        );

        if (visitor.waveTimer > 0) {
          visitorRig.armRPivot.rotation.z = THREE.MathUtils.damp(
            visitorRig.armRPivot.rotation.z,
            2.25 + Math.sin(now * 0.016) * 0.35,
            12,
            dt
          );
          visitorRig.armRPivot.rotation.x = THREE.MathUtils.damp(
            visitorRig.armRPivot.rotation.x,
            -0.35,
            10,
            dt
          );
        } else {
          visitorRig.armRPivot.rotation.z = THREE.MathUtils.damp(
            visitorRig.armRPivot.rotation.z,
            0,
            10,
            dt
          );
          visitorRig.armRPivot.rotation.x = THREE.MathUtils.damp(
            visitorRig.armRPivot.rotation.x,
            stride * walkAmp * 0.8,
            10,
            dt
          );
        }

        visitorRig.tailPivot.rotation.z = Math.sin(now * 0.005) * 0.28;
        visitorRig.tailTipPivot.rotation.z = Math.sin(now * 0.005 - 0.8) * 0.22;
        visitorRig.headGroup.rotation.z =
          visitor.waveTimer > 0 ? Math.sin(now * 0.008) * 0.12 : Math.sin(now * 0.0025) * 0.04;
      }

      renderer.render(scene, camera);
      draw2DEyeAndMoodFx(dt);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (isSoftwareGl) {
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      spriteTextures.forEach((t) => t.dispose());
      rainGeo.dispose();
      rainMat.dispose();
      snowGeo.dispose();
      snowMat.dispose();
      visitorRig.dispose();
      grassTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    petRef,
    thoughtTextRef,
    thoughtVisibleRef,
    menuOpenRef,
    timeModeRef,
    weatherRef,
    pettingModeRef,
    visitorRef,
    controllerRef,
  ]);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#16223d]">
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-pointer" />
      <canvas
        ref={fxCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  );
}
