import * as THREE from 'three';
import type { World } from '../../pipeline/emit';
import type { RoadTile } from '../../pipeline/roads';
import type { Appearance } from '../logic/lenses';
import { tileKey } from '../logic/index';
import { tintInstance } from './appearance';

const SURFACES = [
  { width: 0.28, color: '#6b5640' }, // footprints
  { width: 0.55, color: '#8a6a45' }, // mud
  { width: 0.78, color: '#b8a888' }, // gravel
  { width: 0.98, color: '#9a9a96' }, // cobblestone
] as const;

export interface Roads {
  group: THREE.Group;
  apply(appearance: Appearance): void;
}

/** Road tiles as one instanced slab per surface type, sitting just above the ground. */
export function buildRoads(world: World, surfaceY: (x: number, y: number) => number): Roads {
  const group = new THREE.Group();
  group.name = 'roads';
  const geometry = new THREE.BoxGeometry(1, 0.05, 1);
  const perSurface: { mesh: THREE.InstancedMesh; tiles: RoadTile[] }[] = SURFACES.map((s, i) => {
    const tiles = world.tiles.filter((t) => t.surface === i);
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, tiles.length));
    mesh.count = tiles.length;
    mesh.receiveShadow = true;
    group.add(mesh);
    return { mesh, tiles };
  });

  const neighbours = new Set(world.tiles.map((t) => tileKey(t.pos[0], t.pos[1])));
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const base = SURFACES.map((s) => new THREE.Color(s.color));

  const layout = (hiddenKeys: Set<string>) => {
    perSurface.forEach(({ mesh, tiles }, surface) => {
      tiles.forEach((t, i) => {
        const [x, y] = t.pos;
        const key = tileKey(x, y);
        const w = SURFACES[surface].width;
        // dashed (reported-only) and rumor tiles leave gaps in a checker pattern
        const gap = (t.dashed || t.rumor) && (x + y) % 2 === 0;
        const hidden = hiddenKeys.has(key) || gap;
        // stretch towards connected neighbours so roads read as continuous strips
        const east = neighbours.has(tileKey(x + 1, y)) || neighbours.has(tileKey(x - 1, y));
        const south = neighbours.has(tileKey(x, y + 1)) || neighbours.has(tileKey(x, y - 1));
        const sx = hidden ? 0 : east ? 1 : w;
        const sz = hidden ? 0 : south ? 1 : w;
        matrix.compose(new THREE.Vector3(x, surfaceY(x, y) + 0.03 + surface * 0.004, y), quat, new THREE.Vector3(Math.max(sx, w), 1, Math.max(sz, w)).multiplyScalar(hidden ? 0 : 1));
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  return {
    group,
    apply(appearance) {
      const hidden = new Set<string>();
      for (const [key, look] of appearance.tiles) if (look.hidden) hidden.add(key);
      layout(hidden);
      perSurface.forEach(({ mesh, tiles }, surface) => {
        tiles.forEach((t, i) => {
          const look = appearance.tiles.get(tileKey(t.pos[0], t.pos[1])) ?? { dim: false, glow: false, hidden: false };
          tintInstance(t.rumor ? base[0] : base[surface], look, color);
          mesh.setColorAt(i, color);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    },
  };
}
