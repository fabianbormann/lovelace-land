import * as THREE from 'three';
import type { Look } from '../logic/lenses';

const DIM = new THREE.Color('#9aa3a6');
const GLOW = new THREE.Color('#ffb83d');

/** Apply a lens look to every Lambert material under an object (materials are per-building clones). */
export function applyLook(obj: THREE.Object3D, look: Look, hovered = false) {
  obj.visible = !look.hidden;
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.userData.noAppearance) return;
    const m = child.material as THREE.MeshLambertMaterial;
    if (!m.userData.baseColor) return;
    m.color.copy(m.userData.baseColor);
    m.emissive.copy(m.userData.baseEmissive);
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
