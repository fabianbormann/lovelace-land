import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World } from '../../pipeline/emit';
import { MOUNTAIN_PEAK, PEAK_HEIGHT, noise, type Terrain } from '../logic/terrain';
import type { Stage } from './stage';

const COLORS = {
  grass: new THREE.Color('#86b25a'),
  grassDark: new THREE.Color('#6e9a49'),
  sand: new THREE.Color('#dcc890'),
  seabedShallow: new THREE.Color('#c9b27c'),
  seabedDeep: new THREE.Color('#3d6f7f'),
  rock: new THREE.Color('#8e8b7d'),
  rockDark: new THREE.Color('#6f6c61'),
  snow: new THREE.Color('#f3f5f2'),
  riverbed: new THREE.Color('#5b8e9c'),
};

/** Height of the ground surface at a tile centre: the highest of its four corners, so props never sink in. */
export function makeSurface(terrain: Terrain) {
  const corner = (cx: number, cy: number) => {
    // corner (cx, cy) is shared by tiles (cx-1..cx, cy-1..cy)
    let sum = 0;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) sum += terrain.heightAt(cx + dx, cy + dy);
    return sum / 4;
  };
  const surfaceY = (x: number, y: number) =>
    Math.max(corner(x, y), corner(x + 1, y), corner(x, y + 1), corner(x + 1, y + 1));
  return { corner, surfaceY };
}

export function buildTerrainMesh(world: World, terrain: Terrain) {
  const { corner } = makeSurface(terrain);
  const tint = new Map<string, THREE.Color>();
  for (const d of world.districts) {
    const c = new THREE.Color(d.color);
    for (let x = d.region.x0; x <= d.region.x1; x++) for (let y = d.region.y0; y <= d.region.y1; y++) tint.set(`${x},${y}`, c);
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const shallow = (x: number, y: number) => {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (terrain.isLand(x + dx, y + dy)) return true;
    return false;
  };

  for (let y = terrain.minY; y < terrain.minY + terrain.height; y++) {
    for (let x = terrain.minX; x < terrain.minX + terrain.width; x++) {
      const h = terrain.heightAt(x, y);
      const n = noise(x * 3 + 1, y * 5 + 2);
      if (!terrain.isLand(x, y)) color.copy(shallow(x, y) ? COLORS.seabedShallow : COLORS.seabedDeep);
      else if (terrain.isRiver(x, y)) color.copy(COLORS.riverbed);
      else if (h > PEAK_HEIGHT * 0.72) color.copy(COLORS.snow);
      else if (h > 2.2) color.copy(n > 0.5 ? COLORS.rock : COLORS.rockDark);
      else if (h < 0.2) color.copy(COLORS.sand);
      else {
        color.copy(n > 0.55 ? COLORS.grassDark : COLORS.grass);
        const t = tint.get(`${x},${y}`);
        if (t) color.lerp(t, 0.22);
      }
      const x0 = x - 0.5;
      const x1 = x + 0.5;
      const z0 = y - 0.5;
      const z1 = y + 0.5;
      const h00 = corner(x, y);
      const h10 = corner(x + 1, y);
      const h01 = corner(x, y + 1);
      const h11 = corner(x + 1, y + 1);
      positions.push(x0, h00, z0, x0, h01, z1, x1, h10, z0, x1, h10, z0, x0, h01, z1, x1, h11, z1);
      for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

export function buildWater(terrain: Terrain, stage: Stage) {
  const w = terrain.width + 260;
  const h = terrain.height + 260;
  const geometry = new THREE.PlaneGeometry(w, h, 90, 60).rotateX(-Math.PI / 2);
  geometry.translate(terrain.minX + terrain.width / 2, 0, terrain.minY + terrain.height / 2);
  const material = new THREE.MeshPhongMaterial({ color: '#2f86b0', transparent: true, opacity: 0.86, flatShading: true, shininess: 60, specular: '#cfefff' });
  const water = new THREE.Mesh(geometry, material);
  water.name = 'water';
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  if (!stage.reducedMotion)
    stage.addTick((t) => {
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 0.35 + t * 0.9) * 0.07 + Math.cos(z * 0.3 + t * 0.7) * 0.07);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    });
  return water;
}

/** The Cardano mark: rings of dots that shrink outward, floating above the mountain. */
export function buildCardanoMark(stage: Stage, surfaceY: (x: number, y: number) => number) {
  const mark = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: '#2f5fe0', emissive: '#16348f', emissiveIntensity: 0.9, flatShading: true });
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const rings: [number, number, number, number][] = [
    // radius, count, dot size, angular offset
    [1.05, 6, 0.36, 0],
    [1.95, 6, 0.3, Math.PI / 6],
    [2.35, 12, 0.2, 0],
    [3.25, 12, 0.15, Math.PI / 12],
    [4.15, 6, 0.11, 0],
    [4.6, 6, 0.09, Math.PI / 6],
  ];
  for (const [r, count, size, offset] of rings)
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const dot = new THREE.Mesh(ball, material);
      dot.scale.setScalar(size);
      dot.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      mark.add(dot);
    }
  const holder = new THREE.Group();
  holder.add(mark);
  holder.position.set(MOUNTAIN_PEAK[0], surfaceY(MOUNTAIN_PEAK[0], MOUNTAIN_PEAK[1]) + 4.2, MOUNTAIN_PEAK[1]);
  holder.scale.setScalar(0.95);
  const glow = new THREE.PointLight('#6f95ff', 30, 18, 1.6);
  holder.add(glow);
  stage.addTick((t) => {
    holder.quaternion.copy(stage.camera.quaternion);
    if (!stage.reducedMotion) {
      mark.rotation.z = t * 0.12;
      holder.position.y = surfaceY(MOUNTAIN_PEAK[0], MOUNTAIN_PEAK[1]) + 4.2 + Math.sin(t * 0.8) * 0.25;
    }
  });
  const label = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label label-landmark', textContent: 'Cardano' }));
  label.position.set(0, -5.6, 0);
  holder.add(label);
  return holder;
}

export function buildSignposts(world: World, surfaceY: (x: number, y: number) => number) {
  const group = new THREE.Group();
  const post = new THREE.MeshLambertMaterial({ color: '#5e3c27', flatShading: true });
  for (const d of world.districts) {
    const x = Math.round((d.region.x0 + d.region.x1) / 2);
    const y = d.region.y0 - 1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5).translate(0, 0.7, 0), post);
    pole.position.set(x, surfaceY(x, y), y);
    pole.castShadow = true;
    group.add(pole);
    const el = document.createElement('div');
    el.className = 'label label-district';
    el.textContent = d.name;
    el.style.setProperty('--district', d.color);
    const label = new CSS2DObject(el);
    label.position.set(x, surfaceY(x, y) + 1.6, y);
    group.add(label);
  }
  return group;
}
