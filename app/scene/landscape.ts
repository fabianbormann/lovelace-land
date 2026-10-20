import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World } from '../../pipeline/emit';
import { MOUNTAIN_PEAK, PEAK_HEIGHT, noise, type Terrain } from '../logic/terrain';
import { CARDANO_BLUE, CARDANO_STARBURST, CARDANO_WHITE } from './cardano-starburst';
import type { Stage } from './stage';

const COLORS = {
  grass: new THREE.Color('#86b25a'),
  grassDark: new THREE.Color('#6e9a49'),
  sand: new THREE.Color('#dcc890'),
  seabedShallow: new THREE.Color('#a8a27c'),
  seabedDeep: new THREE.Color('#2c5d6d'),
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
  // An endless seabed under the water so the edge of the terrain grid never shows.
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 3, h * 3).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: COLORS.seabedDeep }),
  );
  seabed.position.set(terrain.minX + terrain.width / 2, -0.95, terrain.minY + terrain.height / 2);
  water.add(seabed);
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
    });
  return water;
}

/** World width of the Cardano mark at normal zoom, in tiles. */
const MARK_WIDTH = 9.5;
/** Brand rule: the logo is never shown narrower than this on the web. */
const MARK_MIN_PX = 64;

/**
 * The official Cardano starburst floating above the mountain, built dot by dot from the brand asset.
 * It always faces the viewer, upright and undistorted, in brand blue by day and white by night,
 * and it never rotates.
 */
export function buildCardanoMark(stage: Stage, surfaceY: (x: number, y: number) => number) {
  const { width, height, dots } = CARDANO_STARBURST;
  const scale = MARK_WIDTH / width;
  const material = new THREE.MeshBasicMaterial({ color: CARDANO_BLUE, side: THREE.DoubleSide });
  const mark = new THREE.Group();
  for (const d of dots) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(d.r * scale, 40), material);
    disc.position.set((d.x - width / 2) * scale, -(d.y - height / 2) * scale, 0);
    mark.add(disc);
  }
  const holder = new THREE.Group();
  holder.add(mark);
  const peakY = surfaceY(MOUNTAIN_PEAK[0], MOUNTAIN_PEAK[1]);
  holder.position.set(MOUNTAIN_PEAK[0], peakY + 4.4, MOUNTAIN_PEAK[1]);
  const glow = new THREE.PointLight('#6f95ff', 30, 18, 1.6);
  glow.position.y = -2;
  holder.add(glow);
  stage.addTick((t) => {
    // face the viewer without turning the mark itself
    holder.quaternion.copy(stage.camera.quaternion);
    // keep it at least 64 px wide on screen when zoomed out
    const cam = stage.camera;
    const pxPerUnit = (stage.renderer.domElement.clientHeight || 1) / ((cam.top - cam.bottom) / cam.zoom);
    holder.scale.setScalar(Math.max(1, MARK_MIN_PX / (MARK_WIDTH * pxPerUnit)));
    if (!stage.reducedMotion) holder.position.y = peakY + 4.4 + Math.sin(t * 0.8) * 0.25;
  });
  // the name sits below the mountain top, well outside the logo's clear space
  const object = new THREE.Group();
  object.add(holder);
  if (typeof document !== 'undefined') {
    const label = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label label-landmark', textContent: 'Cardano' }));
    label.position.set(MOUNTAIN_PEAK[0], peakY - 3.2, MOUNTAIN_PEAK[1] + 3);
    object.add(label);
  }
  return {
    object,
    setNight(night: boolean) {
      material.color.set(night ? CARDANO_WHITE : CARDANO_BLUE);
    },
  };
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

/** Block "rafts" drifting down the chain river, a nod to blocks flowing from the mountain. */
export function buildRafts(terrain: Terrain, stage: Stage) {
  const group = new THREE.Group();
  const path = terrain.riverPath;
  if (path.length < 3) return group;
  const material = new THREE.MeshLambertMaterial({ color: '#7a5634', flatShading: true });
  const cargo = new THREE.MeshLambertMaterial({ color: '#2f5fe0', flatShading: true });
  const rafts = Array.from({ length: Math.max(2, Math.floor(path.length / 8)) }, (_, i) => {
    const raft = new THREE.Group();
    raft.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), material));
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), cargo);
    block.position.y = 0.18;
    raft.add(block);
    group.add(raft);
    return { raft, offset: (i / Math.max(2, Math.floor(path.length / 8))) * (path.length - 1) };
  });
  const place = (t: number) => {
    const len = path.length - 1;
    for (const r of rafts) {
      const d = (r.offset + t * 0.9) % len;
      const k = Math.floor(d);
      const f = d - k;
      if (!path[k]) continue;
      const [ax, ay] = path[k];
      const [bx, by] = path[Math.min(k + 1, len)];
      r.raft.position.set(ax + (bx - ax) * f, 0.05, ay + (by - ay) * f);
      r.raft.rotation.y = Math.atan2(bx - ax, by - ay);
    }
  };
  place(0);
  if (!stage.reducedMotion) stage.addTick((t) => place(t));
  return group;
}
