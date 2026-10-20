import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../../pipeline/emit';
import { planSettlers } from '../logic/settlers';
import type { Stage } from './stage';

const CLOTHES = ['#b03a2e', '#2e6db0', '#c9962a', '#3f8a4a', '#7a4a9a', '#d0d0c8'];

/** Tiny walkers carrying goods inward along busy roads; count follows traffic. */
export function buildSettlers(world: World, stage: Stage, surfaceY: (x: number, y: number) => number) {
  const plan = planSettlers(world, 360);
  const body = new THREE.CylinderGeometry(0.07, 0.11, 0.32, 5).translate(0, 0.16, 0);
  const head = new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.4, 0);
  const pack = new THREE.BoxGeometry(0.12, 0.12, 0.12).translate(0, 0.27, -0.1);
  const geometry = mergeGeometries([body, head, pack].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, plan.length));
  mesh.count = plan.length;
  mesh.castShadow = true;
  const color = new THREE.Color();
  plan.forEach((_, i) => mesh.setColorAt(i, color.set(CLOTHES[i % CLOTHES.length])));
  const pathById = new Map(world.edges.map((e) => [e.id, e.path] as const));
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const visibleEdges = new Set(world.edges.map((e) => e.id));

  const update = (t: number) => {
    plan.forEach((s, i) => {
      const path = pathById.get(s.edgeId)!;
      if (!visibleEdges.has(s.edgeId) || path.length < 2) {
        matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, matrix);
        return;
      }
      const len = path.length - 1;
      const d = ((s.phase * len + t * s.speed) % len + len) % len;
      const k = Math.floor(d);
      const f = d - k;
      const [ax, ay] = path[k];
      const [bx, by] = path[Math.min(k + 1, len)];
      const x = ax + (bx - ax) * f;
      const y = ay + (by - ay) * f;
      pos.set(x, surfaceY(Math.round(x), Math.round(y)) + 0.05 + Math.abs(Math.sin(t * 9 + i)) * 0.04, y);
      quat.setFromAxisAngle(up, Math.atan2(bx - ax, by - ay));
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  let enabled = !stage.reducedMotion;
  mesh.visible = enabled;
  stage.addTick((t) => enabled && update(t));
  return {
    mesh,
    setEnabled(on: boolean) {
      enabled = on;
      mesh.visible = on;
    },
    setVisibleEdges(ids: Set<string>) {
      visibleEdges.clear();
      ids.forEach((id) => visibleEdges.add(id));
    },
  };
}
