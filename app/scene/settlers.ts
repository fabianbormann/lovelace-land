import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../../pipeline/emit';
import type { WorldIndex } from '../logic/index';
import { pointAt, settlerDistance, settlerRoutes, type Trail } from '../logic/routes';
import { cursorAt } from '../logic/time';
import type { Stage } from './stage';

const CLOTHES = ['#b03a2e', '#2e6db0', '#c9962a', '#3f8a4a', '#7a4a9a', '#d0d0c8'];
const CAP = 420;
/** settlers per unit of flow weight log10(1 + tx) */
const PER_WEIGHT = 3;

/**
 * Settlers carry each docked ship's activity from its harbor along its dependency chains to the
 * Cardano mark. How many walk depends on that month's flow; where they are depends only on the
 * settler's index and the clock, so every visitor sees the same procession.
 */
export function buildSettlers(world: World, idx: WorldIndex, stage: Stage, surfaceY: (x: number, y: number) => number, trail: Trail) {
  const routes = new Map(world.customers.map((c) => [c.id, settlerRoutes(world, idx, c.id, trail)] as const));
  const body = new THREE.CylinderGeometry(0.07, 0.11, 0.32, 5).translate(0, 0.16, 0);
  const head = new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.4, 0);
  const pack = new THREE.BoxGeometry(0.12, 0.12, 0.12).translate(0, 0.27, -0.1);
  const geometry = mergeGeometries([body, head, pack].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ flatShading: true }), CAP);
  mesh.castShadow = true;
  const color = new THREE.Color();
  for (let i = 0; i < CAP; i++) mesh.setColorAt(i, color.set(CLOTHES[i % CLOTHES.length]));
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let enabled = !stage.reducedMotion;
  let T = world.timeline.months.length - 1;
  let visible: Set<string> | null = null;
  /** total flow arriving at the mark, 0..1, for its glow */
  let arriving = 0;

  const plan = () => {
    const { index } = cursorAt(world.timeline.months, T);
    const wanted = world.customers
      .filter((c) => world.timeline.customers[c.id].state[index] === 'd' && (!visible || visible.has(c.id)) && routes.get(c.id)!.length)
      .map((c) => ({ id: c.id, n: Math.max(1, Math.round(world.timeline.customers[c.id].w[index] * PER_WEIGHT)) }));
    const total = wanted.reduce((s, w) => s + w.n, 0);
    const factor = total > CAP ? CAP / total : 1;
    arriving = Math.min(1, total / 200);
    return wanted.map((w) => ({ id: w.id, n: Math.max(1, Math.floor(w.n * factor)) }));
  };
  let current = plan();

  const update = (seconds: number) => {
    let slot = 0;
    for (const { id, n } of current) {
      const rs = routes.get(id)!;
      for (let i = 0; i < n && slot < CAP; i++) {
        const route = rs[i % rs.length];
        const clock = seconds + (id.length % 7);
        const d = settlerDistance(route, i, n, clock);
        const [x, y] = pointAt(route, d);
        const [nx, ny] = pointAt(route, Math.min(d + 0.05, route.length - 1));
        // shrink into a sparkle over the last tiles before the mark
        const s = Math.min(1, (route.length - 1 - d) / 3);
        pos.set(x, surfaceY(Math.round(x), Math.round(y)) + 0.05 + Math.abs(Math.sin(seconds * 9 + i)) * 0.04, y);
        quat.setFromAxisAngle(up, Math.atan2(nx - x, ny - y));
        scale.setScalar(s);
        matrix.compose(pos, quat, scale);
        mesh.setMatrixAt(slot++, matrix);
      }
    }
    mesh.count = slot;
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  mesh.visible = enabled;
  stage.addTick((t) => enabled && update(t));
  return {
    mesh,
    get arriving() {
      return enabled ? arriving : 0;
    },
    setEnabled(on: boolean) {
      enabled = on;
      mesh.visible = on;
    },
    setTime(next: number) {
      T = next;
      current = plan();
      if (!enabled) update(0);
    },
    /** customers whose roads are visible under the current lens and filters */
    setVisibleCustomers(ids: Set<string> | null) {
      visible = ids;
      current = plan();
    },
  };
}
