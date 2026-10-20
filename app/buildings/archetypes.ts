import * as THREE from 'three';
import type { Building } from '../../pipeline/schema';
import { at, box, cone, cylinder, gableRoof, group, lit, mat, PALETTE as P, sphere } from './kit';

export type Tier = 1 | 2 | 3 | 4;

export interface BuildingOptions {
  tier: Tier;
  /** district or sector color used for roofs, awnings and flags */
  accent: string;
  deprecated: boolean;
  stranded: boolean;
  /** stable per-building number for small variations */
  seed: number;
}

export interface BuiltBuilding {
  object: THREE.Group;
  /** per-frame animation; t in seconds */
  tick?: (t: number) => void;
}

type Generator = (o: BuildingOptions, s: number) => BuiltBuilding;

export const TIER_SCALE: Record<Tier, number> = { 1: 0.85, 2: 1.1, 3: 1.4, 4: 1.75 };

function house(w: number, h: number, d: number, wall: string, roof: string) {
  const g = group(box(w, h, d, wall), at(gableRoof(w, h * 0.7, d, roof), 0, h, 0));
  // timber corner posts give the plaster walls a frame
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
    g.add(at(box(0.08, h, 0.08, P.timberDark), (x * w) / 2, 0, (z * d) / 2));
  return g;
}

const relayTower: Generator = (o, s) => {
  const h = 2.2 * s + o.tier * 0.4;
  const g = group(at(house(0.9 * s, 0.6 * s, 0.7 * s, P.stone, P.roofSlate), -0.55 * s, 0, 0.35 * s));
  g.add(at(cylinder(0.06, 0.32 * s, h, P.metal, 4), 0.35 * s, 0, -0.2 * s));
  for (let i = 1; i <= 3; i++) g.add(at(box(0.5 * s * (1 - i / 4), 0.05, 0.05, P.metal), 0.35 * s, (h * i) / 4, -0.2 * s, Math.PI / 4));
  const light = lit(sphere(0.12 + 0.03 * o.tier, P.glow), '#ff7a3d');
  g.add(at(light, 0.35 * s, h + 0.05, -0.2 * s));
  if (o.tier >= 3) g.add(at(cylinder(0.22 * s, 0.02, 0.12, P.plaster, 10), 0.35 * s, h * 0.7, 0.05 * s));
  return {
    object: g,
    tick: (t) => {
      const on = Math.sin(t * 3 + o.seed) > 0.2;
      (light.material as THREE.MeshLambertMaterial).emissiveIntensity = on ? 1.4 : 0.15;
    },
  };
};

const watermill: Generator = (o, s) => {
  const floors = o.tier >= 3 ? 2 : 1;
  const g = group(house(1.1 * s, 0.75 * s * floors, 0.95 * s, P.plaster, o.accent));
  const wheel = new THREE.Group();
  wheel.add(at(cylinder(0.5 * s, 0.5 * s, 0.16, P.timber, 10), 0, -0.08, 0));
  for (let i = 0; i < 4; i++) {
    const spoke = box(0.07, 0.07, 0.98 * s, P.timberDark);
    spoke.rotation.y = (i * Math.PI) / 4;
    wheel.add(at(spoke, 0, 0.06, 0, (i * Math.PI) / 4));
  }
  wheel.rotation.z = Math.PI / 2;
  const hub = new THREE.Group();
  hub.add(wheel);
  hub.position.set(0.66 * s, 0.45 * s, 0);
  g.add(hub);
  return { object: g, tick: (t) => (hub.rotation.x = t * 0.8 + o.seed) };
};

const marketHall: Generator = (o, s) => {
  const w = 1.9 * s;
  const d = 1.1 * s;
  const g = group(box(w, 0.12, d, P.stone));
  for (const x of [-1, 0, 1]) for (const z of [-1, 1]) g.add(at(cylinder(0.06, 0.06, 0.7 * s, P.timber, 6), (x * w) / 2.2, 0.12, (z * d) / 2.2));
  g.add(at(box(w * 0.7, 0.45 * s, d * 0.5, P.plaster), 0, 0.12, 0));
  g.add(at(gableRoof(w, 0.55 * s, d, P.roofSlate), 0, 0.12 + 0.7 * s, 0));
  for (let i = 0; i < 4; i++) g.add(at(box(w / 4.4, 0.04, 0.35 * s, i % 2 ? P.plaster : o.accent), -w / 2 + (w / 4) * (i + 0.5), 0.55 * s, d / 2 + 0.12));
  for (let i = 0; i < Math.min(o.tier + 1, 4); i++) g.add(at(box(0.22, 0.22, 0.22, P.timber), -w / 2 + 0.3 + i * 0.35, 0.12, d / 2 + 0.35));
  return { object: g };
};

const forge: Generator = (o, s) => {
  const g = group(box(1.2 * s, 0.8 * s, 1.0 * s, P.stoneDark));
  g.add(at(gableRoof(1.2 * s, 0.5 * s, 1.0 * s, P.roofSlate), 0, 0.8 * s, 0));
  const chimneyH = 1.5 * s + o.tier * 0.15;
  g.add(at(box(0.32 * s, chimneyH, 0.32 * s, P.stone), 0.38 * s, 0, -0.25 * s));
  const fire = lit(box(0.36 * s, 0.42 * s, 0.05, '#ff9a3c'), '#ff6a1a');
  g.add(at(fire, -0.15 * s, 0.02, 0.51 * s));
  g.add(at(box(0.3, 0.18, 0.14, P.metal), 0.25 * s, 0, 0.75 * s));
  const puffs = [0, 1, 2].map((i) => {
    const p = sphere(0.12 + i * 0.04, '#d8d3c8');
    (p.material as THREE.MeshLambertMaterial).transparent = true;
    p.userData.noAppearance = true; // smoke keeps its own fading opacity
    g.add(p);
    return p;
  });
  const baseY = chimneyH + 0.1;
  return {
    object: g,
    tick: (t) =>
      puffs.forEach((p, i) => {
        const k = (t * 0.35 + i / 3 + o.seed * 0.1) % 1;
        p.position.set(0.38 * s + k * 0.3, baseY + k * 1.3, -0.25 * s - k * 0.2);
        p.scale.setScalar(0.12 + k * 0.25);
        (p.material as THREE.MeshLambertMaterial).opacity = 0.8 * (1 - k);
      }),
  };
};

const workshop: Generator = (o, s) => {
  const floors = o.tier >= 3 ? 1.6 : 1;
  const g = group(house(1.25 * s, 0.7 * s * floors, 0.95 * s, P.plaster, o.accent));
  g.add(at(box(0.5 * s, 0.35 * s, 0.4 * s, P.timber), -0.85 * s, 0, 0.1 * s));
  for (let i = 0; i < 3; i++) {
    const log = cylinder(0.09, 0.09, 0.6 * s, P.timber, 6);
    log.rotation.z = Math.PI / 2;
    g.add(at(log, 0.3 * s * i - 0.3 * s, 0.09, 0.75 * s));
  }
  if (o.tier === 4) g.add(at(box(0.5 * s, 1.4 * s, 0.5 * s, P.stone), 0.55 * s, 0, -0.35 * s));
  return { object: g };
};

const lighthouse: Generator = (o, s) => {
  const h = 2.4 * s + o.tier * 0.25;
  const g = group(cylinder(0.7 * s, 0.85 * s, 0.25, P.stoneDark, 7));
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r0 = 0.45 * s - (0.18 * s * i) / bands;
    const r1 = 0.45 * s - (0.18 * s * (i + 1)) / bands;
    g.add(at(cylinder(r1, r0, h / bands, i % 2 ? '#c23b2a' : P.plaster, 10), 0, 0.25 + (h * i) / bands, 0));
  }
  const lamp = lit(cylinder(0.24 * s, 0.24 * s, 0.3 * s, P.glow, 8), '#ffb93d');
  g.add(at(lamp, 0, 0.25 + h, 0));
  g.add(at(cone(0.32 * s, 0.3 * s, '#3c4a57', 8), 0, 0.25 + h + 0.3 * s, 0));
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 3.2, 12, 1, true).rotateZ(Math.PI / 2).translate(1.6, 0, 0),
    new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.userData.noAppearance = true;
  const pivot = at(new THREE.Group(), 0, 0.25 + h + 0.15 * s, 0);
  pivot.add(beam);
  g.add(pivot);
  return { object: g, tick: (t) => (pivot.rotation.y = t * 0.9 + o.seed) };
};

const vault: Generator = (o, s) => {
  const g = group(cylinder(0.75 * s, 0.85 * s, 0.7 * s, P.stone, 8));
  const dome = sphere(0.72 * s, P.brass, 1);
  dome.scale.y = 0.45 * s;
  g.add(at(dome, 0, 0.7 * s, 0));
  g.add(at(box(0.32 * s, 0.45 * s, 0.1, P.timberDark), 0, 0, 0.8 * s));
  g.add(at(box(0.36 * s, 0.06, 0.12, o.accent), 0, 0.45 * s, 0.8 * s));
  if (o.tier >= 3) for (const x of [-1, 1]) g.add(at(cylinder(0.14 * s, 0.16 * s, 1.1 * s, P.stoneDark, 6), x * 0.85 * s, 0, 0.4 * s));
  return { object: g };
};

const toolShed: Generator = (o, s) => {
  const g = group(box(0.9 * s, 0.6 * s, 0.7 * s, P.timber));
  const roof = box(1.05 * s, 0.08, 0.95 * s, o.accent, 'roof');
  roof.rotation.x = -0.25;
  g.add(at(roof, 0, 0.62 * s, 0));
  g.add(at(cylinder(0.16, 0.18, 0.35, P.timberDark, 8), 0.65 * s, 0, 0.3 * s));
  g.add(at(box(0.3, 0.3, 0.3, P.roofThatch), -0.65 * s, 0, 0.35 * s));
  if (o.tier >= 2) g.add(at(box(0.08, 0.6 * s, 0.6 * s, P.timberDark), -0.5 * s, 0, -0.1 * s));
  return { object: g };
};

const town: Generator = (o, s) => {
  const g = new THREE.Group();
  if (o.tier === 4) {
    g.add(box(1.3 * s, 1.1 * s, 1.3 * s, P.stone));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      g.add(at(cylinder(0.28 * s, 0.3 * s, 1.5 * s, P.stone, 8), (x * 1.3 * s) / 2, 0, (z * 1.3 * s) / 2));
      g.add(at(cone(0.34 * s, 0.5 * s, o.accent, 8, 'roof'), (x * 1.3 * s) / 2, 1.5 * s, (z * 1.3 * s) / 2));
    }
    g.add(at(cylinder(0.02, 0.02, 0.8, P.timberDark, 4), 0, 1.1 * s, 0));
    g.add(at(box(0.45, 0.28, 0.02, o.accent), 0.23, 1.1 * s + 0.5, 0));
    return { object: g };
  }
  g.add(house(1.0 * s, (o.tier >= 2 ? 1.0 : 0.65) * s, 0.85 * s, P.plaster, o.accent));
  if (o.tier >= 3) {
    g.add(at(house(0.7 * s, 0.6 * s, 0.7 * s, P.plaster, o.accent), -0.95 * s, 0, 0.35 * s, Math.PI / 2));
    g.add(at(box(0.4 * s, 1.6 * s, 0.4 * s, P.stone), 0.7 * s, 0, -0.45 * s));
    g.add(at(cone(0.32 * s, 0.45 * s, o.accent, 4, 'roof'), 0.7 * s, 1.6 * s, -0.45 * s));
  }
  return { object: g };
};

const bridge: Generator = (o, s) => {
  const len = 2.4 * s;
  const g = group(at(box(len, 0.16, 0.7 * s, P.stone), 0, 0.55 * s, 0));
  for (const x of [-1, 1]) g.add(at(box(0.35 * s, 0.6 * s, 0.75 * s, P.stoneDark), (x * len) / 2.6, 0, 0));
  for (const z of [-1, 1]) g.add(at(box(len, 0.18, 0.06, P.timberDark), 0, 0.71 * s, (z * 0.7 * s) / 2));
  g.add(at(cylinder(0.02, 0.02, 0.7, P.timberDark, 4), len / 2, 0.71 * s, 0));
  g.add(at(box(0.4, 0.25, 0.02, o.accent), len / 2 + 0.2, 0.71 * s + 0.4, 0));
  return { object: g };
};

const GENERATORS: Record<Building, Generator> = {
  'relay-tower': relayTower,
  watermill,
  'market-hall': marketHall,
  forge,
  workshop,
  lighthouse,
  vault,
  'tool-shed': toolShed,
  town,
  bridge,
};

const MOSS = new THREE.Color('#5f7046');

/** Overgrown, roofless ruin for deprecated projects. */
function ruinify(obj: THREE.Object3D, seed: number) {
  const roofs: THREE.Object3D[] = [];
  obj.traverse((child) => {
    if (child.name === 'roof') roofs.push(child);
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
      child.material.color.lerp(MOSS, 0.45);
      child.material.userData.baseColor = child.material.color.clone();
    }
  });
  roofs.forEach((r, i) => {
    r.rotation.z = 0.5 + i * 0.2;
    r.position.y *= 0.55;
  });
  for (let i = 0; i < 4; i++) {
    const bush = sphere(0.18 + (i % 2) * 0.08, '#5b7a3a');
    obj.add(at(bush, Math.cos(seed + i * 1.7) * 0.7, 0.05, Math.sin(seed + i * 1.7) * 0.7));
  }
}

let questionTexture: THREE.CanvasTexture | null = null;
function strandedFlag(s: number) {
  if (!questionTexture && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f2e9d0';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#7a2a1d';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 36);
    questionTexture = new THREE.CanvasTexture(c);
    questionTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const g = group(at(cylinder(0.025, 0.025, 1.3 * s, P.timberDark, 4), 0.9 * s, 0, 0.6 * s));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: questionTexture, side: THREE.DoubleSide }));
  flag.userData.noAppearance = true;
  g.add(at(flag, 0.9 * s + 0.24, 1.3 * s - 0.25, 0.6 * s));
  return g;
}

export function buildBuilding(archetype: Building, options: BuildingOptions): BuiltBuilding {
  const s = TIER_SCALE[options.tier];
  const built = GENERATORS[archetype](options, s);
  if (options.deprecated) ruinify(built.object, options.seed);
  if (options.stranded) built.object.add(strandedFlag(s));
  return built;
}

export { mat };
