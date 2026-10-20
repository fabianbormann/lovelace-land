import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBuilding } from '../../app/buildings/archetypes';
import { applyLook } from '../../app/scene/appearance';

const plain = { dim: false, glow: false, hidden: false };
const emissiveMeshes = (obj: THREE.Object3D) => {
  const hits: string[] = [];
  obj.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshLambertMaterial && c.material.emissive.getHex() !== 0) hits.push(c.material.emissive.getHexString());
  });
  return hits;
};

describe('applyLook', () => {
  it('keeps lit parts (forge fire, lighthouse lamp, relay light) lit', () => {
    for (const kind of ['forge', 'lighthouse', 'relay-tower'] as const) {
      const b = buildBuilding(kind, { tier: 2, accent: '#888888', deprecated: false, stranded: false, seed: 1 });
      applyLook(b.object, plain);
      expect(emissiveMeshes(b.object).length, kind).toBeGreaterThan(0);
    }
  });

  it('leaves forge smoke translucent', () => {
    const b = buildBuilding('forge', { tier: 2, accent: '#888888', deprecated: false, stranded: false, seed: 1 });
    applyLook(b.object, plain);
    let transparent = 0;
    b.object.traverse((c) => c instanceof THREE.Mesh && (c.material as THREE.Material).transparent && transparent++);
    expect(transparent).toBe(3);
  });
});
