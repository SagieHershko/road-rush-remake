import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPONS, type ModelId, type RiderStyle, type WeaponId } from './config';

const loaded: Partial<Record<ModelId, THREE.Group>> = {};
const wheelRadius: Record<ModelId, number> = { ninja: 0.31, srad: 0.31 };

export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  const ids: ModelId[] = ['ninja', 'srad'];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${base}models/${id}.glb`);
        loaded[id] = gltf.scene;
        const w = gltf.scene.getObjectByName('wheel_front');
        if (w) {
          const box = new THREE.Box3().setFromObject(w);
          wheelRadius[id] = (box.max.y - box.min.y) / 2 || 0.31;
        }
      } catch (err) {
        console.warn('model failed to load, using fallback', id, err);
      }
    }),
  );
}

// ---- shared helpers ---------------------------------------------------------------------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function stdMat(color: number, rough = 0.6, metal = 0.05): THREE.MeshStandardMaterial {
  const key = `${color}-${rough}-${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}
const paintCache = new Map<number, THREE.MeshStandardMaterial>();
function paintMat(color: number, base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = paintCache.get(color);
  if (!m) {
    m = base.clone();
    m.color.setHex(color);
    m.roughness = 0.28;
    m.metalness = 0.25;
    paintCache.set(color, m);
  }
  return m;
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const sphGeo = new THREE.SphereGeometry(1, 14, 10);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

function limb(mat: THREE.Material, rx: number, rz = rx): THREE.Mesh {
  const m = new THREE.Mesh(cylGeo, mat);
  m.userData = { rx, rz };
  return m;
}
const _d = new THREE.Vector3();
function placeLimb(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _d.divideScalar(len || 1));
  m.scale.set(m.userData.rx as number, len, m.userData.rz as number);
}
function ball(mat: THREE.Material, r: number): THREE.Mesh {
  const m = new THREE.Mesh(sphGeo, mat);
  m.scale.setScalar(r);
  return m;
}

// ---- rider ------------------------------------------------------------------------------
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class RiderRig {
  readonly group = new THREE.Group();
  private suitM: THREE.MeshStandardMaterial;
  private helmM: THREE.MeshStandardMaterial;
  private accM: THREE.MeshStandardMaterial;
  private armU: THREE.Mesh[] = [];
  private armL: THREE.Mesh[] = [];
  private hands: THREE.Mesh[] = [];
  private weaponMeshes: THREE.Group[] = [];
  private shoulder = [V(-0.2, 1.15, -0.17), V(0.2, 1.15, -0.17)];
  private grip = [V(-0.31, 1.0, -0.44), V(0.31, 1.0, -0.44)];
  private handPos = [V(0, 0, 0), V(0, 0, 0)];
  readonly head = new THREE.Group();
  readonly torso: THREE.Mesh;
  private tmpElbow = new THREE.Vector3();

  constructor(style: RiderStyle, police = false) {
    this.suitM = stdMat(style.suit, 0.55, 0.05).clone();
    this.helmM = stdMat(style.helmet, 0.25, 0.2).clone();
    this.accM = stdMat(style.accent, 0.5, 0.05).clone();
    const dark = stdMat(0x15171c, 0.2, 0.4);
    const hip = V(0, 0.84, 0.3);
    const shoulderC = V(0, 1.15, -0.17);

    this.torso = limb(this.suitM, 0.2, 0.15);
    placeLimb(this.torso, hip, shoulderC);
    this.group.add(this.torso);
    const chest = new THREE.Mesh(sphGeo, this.suitM);
    chest.scale.set(0.2, 0.15, 0.16);
    chest.position.copy(shoulderC);
    const butt = new THREE.Mesh(sphGeo, this.suitM);
    butt.scale.set(0.19, 0.14, 0.17);
    butt.position.copy(hip);
    this.group.add(chest, butt);
    for (const s of [-1, 1]) {
      // legs
      const knee = V(s * 0.27, 0.8, -0.08);
      const foot = V(s * 0.25, 0.37, 0.3);
      const thigh = limb(this.suitM, 0.1);
      placeLimb(thigh, V(s * 0.12, 0.84, 0.3), knee);
      const shin = limb(this.suitM, 0.085);
      placeLimb(shin, knee, foot);
      const boot = new THREE.Mesh(boxGeo, this.accM);
      boot.scale.set(0.11, 0.1, 0.28);
      boot.position.set(foot.x, foot.y - 0.02, foot.z - 0.07);
      const kneeBall = ball(this.suitM, 0.1);
      kneeBall.position.copy(knee);
      this.group.add(thigh, shin, boot, kneeBall);

      // arms
      const idx = s < 0 ? 0 : 1;
      const up = limb(this.suitM, 0.065);
      const lo = limb(this.suitM, 0.055);
      const hand = ball(this.accM, 0.075);
      this.armU[idx] = up;
      this.armL[idx] = lo;
      this.hands[idx] = hand;
      const shoulderBall = ball(this.suitM, 0.09);
      shoulderBall.position.copy(this.shoulder[idx]);
      this.group.add(up, lo, hand, shoulderBall);

      const w = new THREE.Group();
      w.visible = false;
      hand.add(w);
      this.weaponMeshes[idx] = w;
    }

    // helmet
    const headPos = V(0, 1.31, -0.31);
    this.head.position.copy(headPos);
    const shell = new THREE.Mesh(sphGeo, this.helmM);
    shell.scale.set(0.17, 0.175, 0.2);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, Math.PI * 1.5 - 0.75, 1.5, Math.PI * 0.28, Math.PI * 0.26),
      new THREE.MeshStandardMaterial({ color: police ? 0x111122 : 0xff9a1a, roughness: 0.1, metalness: 0.6 }),
    );
    visor.scale.set(0.176, 0.18, 0.205);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 6, 28, Math.PI), this.accM);
    ring.scale.set(0.17, 0.176, 0.2);
    ring.rotation.y = Math.PI / 2;
    ring.rotation.z = 0;
    const chin = new THREE.Mesh(sphGeo, dark);
    chin.scale.set(0.08, 0.05, 0.08);
    chin.position.set(0, -0.12, -0.12);
    this.head.add(shell, visor, ring, chin);
    this.group.add(this.head);
    const neck = ball(this.suitM, 0.09);
    neck.position.set(0, 1.21, -0.23);
    this.group.add(neck);

    this.setWeapon(null);
  }

  setStyle(style: RiderStyle): void {
    this.suitM.color.setHex(style.suit);
    this.helmM.color.setHex(style.helmet);
    this.accM.color.setHex(style.accent);
  }

  setWeapon(w: WeaponId | null): void {
    for (const g of this.weaponMeshes) {
      g.clear();
      g.visible = !!w;
      if (!w) continue;
      const spec = WEAPONS[w];
      // the hand is a sphere scaled by 0.075, so children are expressed in hand units
      const unit = 1 / 0.075;
      const stick = new THREE.Mesh(cylGeo, stdMat(spec.color, 0.5, 0.3));
      stick.scale.set(0.02 * unit, spec.len * unit * 0.5, 0.02 * unit);
      stick.position.set(0, spec.len * unit * 0.25, 0);
      g.add(stick);
      if (w === 'prod') {
        const tip = ball(stdMat(0xffee66, 0.2, 0.0), 0.5);
        tip.position.set(0, spec.len * unit * 0.5, 0);
        g.add(tip);
      }
    }
  }

  /**
   * attack: -1 left, 1 right, 0 none; t in 0..1 through the swing.
   */
  update(attackSide: number, t: number, hasWeapon: boolean): void {
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const sh = this.shoulder[i];
      const hand = this.handPos[i];
      hand.copy(this.grip[i]);
      if (attackSide === s) {
        // wind back, then punch out sideways/forward, then return
        const k = t < 0.25 ? t / 0.25 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        const wind = t < 0.25 ? -Math.sin((t / 0.25) * Math.PI) * 0.18 : 0;
        const out = V(s * (hasWeapon ? 0.95 : 0.8), 1.0 + (hasWeapon ? 0.15 : 0), -0.35 + wind);
        hand.lerp(out, Math.max(0, Math.min(1, k)));
        this.weaponMeshes[i].rotation.z = -s * (hasWeapon ? 0.9 * k : 0);
        this.weaponMeshes[i].rotation.x = 0.3;
      } else {
        this.weaponMeshes[i].rotation.set(0, 0, 0);
      }
      this.hands[i].position.copy(hand);
      this.tmpElbow.addVectors(sh, hand).multiplyScalar(0.5);
      this.tmpElbow.x += s * 0.1;
      this.tmpElbow.y -= 0.1;
      placeLimb(this.armU[i], sh, this.tmpElbow);
      placeLimb(this.armL[i], this.tmpElbow, hand);
      // the weapon is a child of the hand: show on the right hand always, left only mid-attack
      this.weaponMeshes[i].visible = hasWeapon && (s === 1 || attackSide === s);
    }
  }
}

// ---- bike -------------------------------------------------------------------------------
export interface BikeRig {
  root: THREE.Group; // positioned/oriented by the game
  tilt: THREE.Group; // lean + pitch
  bike: THREE.Group;
  rider: RiderRig;
  wheelF: THREE.Object3D | null;
  wheelR: THREE.Object3D | null;
  wheelRadius: number;
  shadow: THREE.Mesh;
  paints: THREE.MeshStandardMaterial[];
  paintBase: number;
  lightBar?: { red: THREE.MeshBasicMaterial; blue: THREE.MeshBasicMaterial };
  setPaint(color: number): void;
}

const shadowGeo = new THREE.CircleGeometry(1, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

function fallbackBike(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo, stdMat(0xaaaaaa));
  body.scale.set(0.35, 0.4, 1.4);
  body.position.set(0, 0.55, 0);
  g.add(body);
  for (const z of [-0.75, 0.75]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 14), stdMat(0x111111));
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.31, z);
    w.name = z < 0 ? 'wheel_front' : 'wheel_rear';
    g.add(w);
  }
  return g;
}

export function makeBike(model: ModelId, paint: number, style: RiderStyle, opts: { police?: boolean } = {}): BikeRig {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const src = loaded[model];
  const bike = src ? (src.clone(true) as THREE.Group) : fallbackBike();
  const paints: THREE.MeshStandardMaterial[] = [];
  let paintBase = paint;
  const apply = (hex: number) => {
    paintBase = hex;
    bike.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === 'paint' || mesh.userData.paint) {
        mesh.userData.paint = true;
        if (!mesh.userData.baseMat) mesh.userData.baseMat = m;
        mesh.material = paintMat(hex, mesh.userData.baseMat as THREE.MeshStandardMaterial);
        if (!paints.includes(mesh.material as THREE.MeshStandardMaterial)) paints.push(mesh.material as THREE.MeshStandardMaterial);
      }
    });
  };
  apply(paint);
  tilt.add(bike);
  const rider = new RiderRig(style, opts.police);
  tilt.add(rider.group);

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.55, 1.3, 1);
  shadow.rotation.z = 0;
  shadow.position.y = 0.04;
  root.add(shadow);
  shadow.rotation.set(-Math.PI / 2, 0, 0);
  shadow.scale.set(0.6, 1.25, 1);

  const rig: BikeRig = {
    root, tilt, bike, rider,
    wheelF: bike.getObjectByName('wheel_front') ?? null,
    wheelR: bike.getObjectByName('wheel_rear') ?? null,
    wheelRadius: wheelRadius[model],
    shadow, paints, paintBase,
    setPaint(c) {
      apply(c);
      rig.paintBase = c;
    },
  };

  if (opts.police) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2255ff });
    const bar = new THREE.Group();
    const a = new THREE.Mesh(boxGeo, red);
    a.scale.set(0.14, 0.07, 0.1);
    a.position.set(-0.09, 0, 0);
    const b = new THREE.Mesh(boxGeo, blue);
    b.scale.set(0.14, 0.07, 0.1);
    b.position.set(0.09, 0, 0);
    bar.add(a, b);
    bar.position.set(0, 1.05, 0.62);
    tilt.add(bar);
    rig.lightBar = { red, blue };
  }
  return rig;
}

// ---- traffic, animals ---------------------------------------------------------------------
export type CarKind = 'sedan' | 'wagon' | 'truck';
const CAR_COLORS = [0xb7b7b0, 0x7a2d2d, 0x2d4f7a, 0x3a6b45, 0xc8c2a0, 0x8a8a8a, 0xd8d8d8, 0x6c4a2e, 0x1d1d1d];

export function makeCar(kind: CarKind, seed: number): THREE.Group {
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(seed * CAR_COLORS.length) % CAR_COLORS.length];
  const glass = stdMat(0x1c2630, 0.1, 0.6);
  const tire = stdMat(0x0c0c0c, 0.9);
  const lens = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const dims = kind === 'truck' ? { l: 6.2, h: 1.0, w: 2.3 } : kind === 'wagon' ? { l: 4.8, h: 0.7, w: 1.95 } : { l: 4.3, h: 0.65, w: 1.85 };
  const body = new THREE.Mesh(boxGeo, stdMat(color, 0.4, 0.3));
  body.scale.set(dims.w, dims.h, dims.l);
  body.position.y = 0.35 + dims.h / 2;
  g.add(body);
  if (kind === 'truck') {
    const cab = new THREE.Mesh(boxGeo, stdMat(color, 0.4, 0.3));
    cab.scale.set(dims.w, 1.4, 1.8);
    cab.position.set(0, 1.6, -dims.l / 2 + 1.1);
    const box = new THREE.Mesh(boxGeo, stdMat(0xe4e4e0, 0.7));
    box.scale.set(dims.w - 0.1, 1.8, 4);
    box.position.set(0, 1.85, 1.0);
    const wnd = new THREE.Mesh(boxGeo, glass);
    wnd.scale.set(dims.w - 0.1, 0.6, 0.05);
    wnd.position.set(0, 1.95, -dims.l / 2 + 0.22);
    g.add(cab, box, wnd);
  } else {
    const cabL = kind === 'wagon' ? 3.0 : 2.1;
    const cab = new THREE.Mesh(boxGeo, glass);
    cab.scale.set(dims.w - 0.2, 0.62, cabL);
    cab.position.set(0, 0.35 + dims.h + 0.28, kind === 'wagon' ? 0.3 : 0.1);
    const roof = new THREE.Mesh(boxGeo, stdMat(color, 0.4, 0.3));
    roof.scale.set(dims.w - 0.25, 0.06, cabL - 0.1);
    roof.position.set(0, 0.35 + dims.h + 0.6, cab.position.z);
    g.add(cab, roof);
  }
  for (const sx of [-1, 1]) {
    for (const z of [-dims.l / 2 + 0.9, dims.l / 2 - 0.9]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * (dims.w / 2 - 0.05), 0.36, z);
      g.add(w);
    }
    const tl = new THREE.Mesh(boxGeo, lens);
    tl.scale.set(0.35, 0.16, 0.06);
    tl.position.set(sx * (dims.w / 2 - 0.3), 0.35 + dims.h * 0.7, dims.l / 2 + 0.01);
    g.add(tl);
  }
  const sh = new THREE.Mesh(shadowGeo, shadowMat);
  sh.rotation.x = -Math.PI / 2;
  sh.scale.set(dims.w * 0.55, dims.l * 0.55, 1);
  sh.position.y = 0.04;
  g.add(sh);
  g.userData.size = { w: dims.w, l: dims.l };
  return g;
}

export function makeCow(): THREE.Group {
  const g = new THREE.Group();
  const white = stdMat(0xf1eee6, 0.9);
  const black = stdMat(0x1c1c1c, 0.9);
  const body = new THREE.Mesh(boxGeo, white);
  body.scale.set(0.8, 0.85, 1.9);
  body.position.y = 1.0;
  const patch = new THREE.Mesh(boxGeo, black);
  patch.scale.set(0.82, 0.5, 0.7);
  patch.position.set(0, 1.12, 0.2);
  const head = new THREE.Mesh(boxGeo, white);
  head.scale.set(0.5, 0.5, 0.6);
  head.position.set(0, 1.25, -1.2);
  g.add(body, patch, head);
  for (const sx of [-1, 1]) for (const z of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(boxGeo, white);
    leg.scale.set(0.16, 0.7, 0.16);
    leg.position.set(sx * 0.28, 0.35, z);
    g.add(leg);
  }
  return g;
}

export function makeCone(): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), stdMat(0xff6a14, 0.6));
  c.position.y = 0.35;
  g.add(c);
  return g;
}
