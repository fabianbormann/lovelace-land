import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CARDANO_STARBURST } from '../../app/scene/cardano-starburst';
import { buildCardanoMark } from '../../app/scene/landscape';

function fakeStage() {
  const ticks: ((t: number) => void)[] = [];
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
  const renderer = { domElement: { clientHeight: 800 } };
  return { stage: { addTick: (f: (t: number) => void) => ticks.push(f), camera, renderer, reducedMotion: false } as never, ticks };
}

const discs = (obj: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  obj.traverse((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.CircleGeometry && out.push(c));
  return out;
};

describe('Cardano mark above the mountain', () => {
  it('uses the official starburst geometry from cardano.org (30 dots)', () => {
    expect(CARDANO_STARBURST.dots).toHaveLength(30);
    const { stage } = fakeStage();
    const mark = buildCardanoMark(stage, () => 0);
    expect(discs(mark.object)).toHaveLength(30);
  });

  it('is drawn in brand blue #0033AD, unaffected by scene lighting', () => {
    const { stage } = fakeStage();
    const mark = buildCardanoMark(stage, () => 0);
    for (const d of discs(mark.object)) {
      expect(d.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect((d.material as THREE.MeshBasicMaterial).color.getHexString()).toBe('0033ad');
    }
  });

  it('never rotates (brand rule: do not rotate the logo)', () => {
    const { stage, ticks } = fakeStage();
    const mark = buildCardanoMark(stage, () => 0);
    const before = discs(mark.object).map((d) => d.getWorldQuaternion(new THREE.Quaternion()).toArray().join());
    ticks.forEach((t) => t(37.5));
    mark.object.updateMatrixWorld(true);
    const after = discs(mark.object).map((d) => d.getWorldQuaternion(new THREE.Quaternion()).toArray().join());
    expect(after).toEqual(before);
  });

  it('switches to the white variant at night', () => {
    const { stage } = fakeStage();
    const mark = buildCardanoMark(stage, () => 0);
    mark.setNight(true);
    expect((discs(mark.object)[0].material as THREE.MeshBasicMaterial).color.getHexString()).toBe('ffffff');
    mark.setNight(false);
    expect((discs(mark.object)[0].material as THREE.MeshBasicMaterial).color.getHexString()).toBe('0033ad');
  });
});
