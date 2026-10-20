import * as THREE from 'three';
import type { World } from '../../pipeline/emit';
import type { RoadTile } from '../../pipeline/roads';
import { tileKey } from '../logic/index';
import type { Appearance } from '../logic/lenses';
import { tintInstance } from './appearance';

const SURFACES = [
  { width: 0.28, color: '#6b5640' }, // footprints
  { width: 0.55, color: '#8a6a45' }, // mud
  { width: 0.78, color: '#b8a888' }, // gravel
  { width: 0.98, color: '#9a9a96' }, // cobblestone
] as const;

export interface Roads {
  group: THREE.Group;
  /** surfaces: tile key → surface for the shown month; null keeps the latest snapshot */
  apply(appearance: Appearance, surfaces: Map<string, number> | null): void;
}

/** Road tiles as instanced slabs, regrouped by surface whenever the shown month changes. */
export function buildRoads(world: World, surfaceY: (x: number, y: number) => number): Roads {
  const group = new THREE.Group();
  group.name = 'roads';
  const geometry = new THREE.BoxGeometry(1, 0.05, 1);
  const capacity = Math.max(1, world.tiles.length);
  const meshes = SURFACES.map(() => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), capacity);
    mesh.count = 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  const keys = world.tiles.map((t) => tileKey(t.pos[0], t.pos[1]));
  const neighbours = new Set(keys);
  const heights = world.tiles.map((t) => surfaceY(t.pos[0], t.pos[1]));
  const base = SURFACES.map((s) => new THREE.Color(s.color));
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();

  return {
    group,
    apply(appearance, surfaces) {
      const counts = [0, 0, 0, 0];
      world.tiles.forEach((t: RoadTile, i) => {
        const key = keys[i];
        const look = appearance.tiles.get(key) ?? { dim: false, glow: false, hidden: false };
        const [x, y] = t.pos;
        // dashed (reported-only) and rumor tiles leave gaps in a checker pattern
        const gap = (t.dashed || t.rumor) && (x + y) % 2 === 0;
        if (look.hidden || gap) return;
        const surface = surfaces ? (surfaces.get(key) ?? 0) : t.surface;
        const w = SURFACES[surface].width;
        const east = neighbours.has(tileKey(x + 1, y)) || neighbours.has(tileKey(x - 1, y));
        const south = neighbours.has(tileKey(x, y + 1)) || neighbours.has(tileKey(x, y - 1));
        pos.set(x, heights[i] + 0.03 + surface * 0.004, y);
        scale.set(east ? 1 : w, 1, south ? 1 : w);
        matrix.compose(pos, quat, scale);
        const mesh = meshes[surface];
        const slot = counts[surface]++;
        mesh.setMatrixAt(slot, matrix);
        mesh.setColorAt(slot, tintInstance(t.rumor ? base[0] : base[surface], look, color));
      });
      meshes.forEach((mesh, s) => {
        mesh.count = counts[s];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    },
  };
}
