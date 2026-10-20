import * as THREE from 'three';

/** Small helpers for assembling low-poly, flat-shaded props from primitives. */

const geometryCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometryCache.get(key);
  if (!g) {
    g = make();
    geometryCache.set(key, g);
  }
  return g;
}

export function mat(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; opacity?: number } = {}) {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  if (opts.opacity !== undefined) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  m.userData.baseColor = m.color.clone();
  m.userData.baseEmissive = m.emissive.clone();
  return m;
}

function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, name?: string) {
  const m = new THREE.Mesh(geometry, mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation, name?: string) {
  const m = mesh(cached('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), color, name);
  m.scale.set(w, h, d);
  return m;
}

export function cylinder(rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, segments = 8, name?: string) {
  const key = `cyl:${rTop}:${rBottom}:${segments}`;
  const m = mesh(cached(key, () => new THREE.CylinderGeometry(rTop, rBottom, 1, segments).translate(0, 0.5, 0)), color, name);
  m.scale.y = h;
  return m;
}

export function cone(r: number, h: number, color: THREE.ColorRepresentation, segments = 6, name?: string) {
  const m = mesh(cached(`cone:${segments}`, () => new THREE.ConeGeometry(1, 1, segments).translate(0, 0.5, 0)), color, name);
  m.scale.set(r, h, r);
  return m;
}

export function sphere(r: number, color: THREE.ColorRepresentation, detail = 0) {
  const m = mesh(cached(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail)), color);
  m.scale.setScalar(r);
  return m;
}

/** A gable roof (triangular prism) spanning w along x and d along z. */
export function gableRoof(w: number, h: number, d: number, color: THREE.ColorRepresentation, name = 'roof') {
  const g = cached('gable', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  });
  const m = mesh(g, color, name);
  m.scale.set(w * 1.12, h, d * 1.08);
  return m;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, rotY = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  return obj;
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

export const PALETTE = {
  timber: '#8a5a3b',
  timberDark: '#5e3c27',
  plaster: '#efe4cc',
  stone: '#a7a294',
  stoneDark: '#7c786d',
  roofRed: '#b24a32',
  roofSlate: '#4f5d6b',
  roofThatch: '#c9a35a',
  metal: '#6d7680',
  brass: '#c9a03c',
  glow: '#ffd27a',
  water: '#3d86a8',
  cardano: '#2a5bd7',
} as const;
