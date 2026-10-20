import * as THREE from 'three';
import type { Look } from '../logic/lenses';

const DIM = new THREE.Color('#9aa3a6');
const GLOW = new THREE.Color('#ffb83d');
const SOOT = new THREE.Color('#2a1d14');
const WEATHERED = new THREE.Color('#5a5148');

/** How the timeline has treated a building: soot-blackened while burning, weathered when unmaintained. */
export type Condition = 'normal' | 'risk' | 'burn';

/** Apply a lens look to every Lambert material under an object (materials are per-building clones). Visibility is the caller's job. */
export function applyLook(obj: THREE.Object3D, look: Look, hovered = false, condition: Condition = 'normal') {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.userData.noAppearance) return;
    const m = child.material as THREE.MeshLambertMaterial;
    if (!m.userData.baseColor) return;
    m.color.copy(m.userData.baseColor);
    m.emissive.copy(m.userData.baseEmissive);
    if (condition === 'burn') m.color.lerp(SOOT, 0.5);
    if (condition === 'risk') m.color.lerp(WEATHERED, 0.3);
    if (look.dim) m.color.lerp(DIM, 0.72);
    if (look.glow) m.emissive.copy(GLOW).multiplyScalar(0.35);
    if (hovered) m.emissive.add(new THREE.Color('#3a3220'));
    m.transparent = look.dim || m.userData.baseOpacity !== undefined;
    m.opacity = look.dim ? 0.55 : (m.userData.baseOpacity ?? 1);
  });
}

export function tintInstance(base: THREE.Color, look: Look, out: THREE.Color) {
  out.copy(base);
  if (look.dim) out.lerp(DIM, 0.75);
  if (look.glow) out.copy(GLOW);
  return out;
}
