import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World, WorldCustomer } from '../../pipeline/emit';
import { at, box, cylinder, mat, PALETTE as P } from '../buildings/kit';
import { shipKind, shipPlacement, type ShipKind } from '../logic/ships';
import type { Stage } from './stage';
import { SECTOR_COLORS } from './town';

export interface PlacedShip {
  customer: WorldCustomer;
  root: THREE.Group;
  label: HTMLElement;
}

const SEAWARD = { east: [1, 0], north: [0, -1], south: [0, 1] } as const;

function hull(length: number, width: number, height: number, color: string) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2 - width * 0.6, 0);
  shape.lineTo(length / 2, height * 0.9);
  shape.lineTo(-length / 2 - 0.1, height);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(0, -height * 0.45, -width / 2);
  const m = new THREE.Mesh(g, mat(color));
  m.castShadow = true;
  return m;
}

function sail(w: number, h: number, color: string) {
  const s = box(0.05, h, w, color);
  return s;
}

function buildShip(kind: ShipKind, flag: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'rowboat') {
    g.add(hull(1.1, 0.5, 0.3, P.timber));
    for (const z of [-1, 1]) {
      const oar = box(0.9, 0.04, 0.05, P.timberDark);
      oar.rotation.y = z * 0.5;
      g.add(at(oar, 0, 0.1, z * 0.35));
    }
    g.add(at(box(0.18, 0.12, 0.02, flag), -0.5, 0.35, 0));
    g.add(at(cylinder(0.015, 0.015, 0.4, P.timberDark, 4), -0.5, 0, 0));
    return g;
  }
  const length = 2.2;
  g.add(hull(length, 0.8, 0.6, kind === 'wreck' ? '#5d5a52' : P.timberDark));
  g.add(at(box(length * 0.7, 0.06, 0.7, P.timber), -0.1, 0.25, 0));
  const masts = kind === 'wreck' ? [[0.2, 0.9]] : [[0.45, 1.9], [-0.45, 1.6]];
  for (const [x, h] of masts) {
    g.add(at(cylinder(0.04, 0.05, h, P.timberDark, 5), x, 0.25, 0));
    if (kind !== 'wreck') {
      g.add(at(sail(0.95, h * 0.55, P.plaster), x + 0.08, 0.25 + h * 0.3, 0));
      g.add(at(box(0.02, 0.18, 0.32, flag), x, 0.25 + h - 0.05, 0.17));
    }
  }
  return g;
}

export function buildHarbors(world: World, stage: Stage, surfaceY: (x: number, y: number) => number) {
  const group = new THREE.Group();
  const ships: PlacedShip[] = [];
  const bobbers: { obj: THREE.Object3D; phase: number; base: number; wreck: boolean }[] = [];

  world.sectors.forEach((sector, i) => {
    const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
    const [hx, hy] = sector.harbor.pos;
    const [sx, sy] = SEAWARD[sector.coast];
    // Dock: planks from the harbor tile out to sea, with posts.
    const dock = new THREE.Group();
    dock.position.set(hx, Math.max(surfaceY(hx, hy), 0.15), hy);
    for (let k = 0; k < 5; k++) {
      dock.add(at(box(sx ? 1.02 : 1.4, 0.1, sx ? 1.4 : 1.02, P.timber), sx * k, 0.05, sy * k));
      for (const side of [-1, 1]) dock.add(at(cylinder(0.07, 0.07, 1.1, P.timberDark, 5), sx * k + (sx ? 0 : side * 0.7), -0.9, sy * k + (sx ? side * 0.7 : 0)));
    }
    dock.add(at(box(1.3, 0.9, 1.0, P.plaster), -sx * 1.2 + (sx ? 0 : 1.6), 0, -sy * 1.2 + (sx ? 1.6 : 0)));
    dock.add(at(box(0.05, 0.6, 0.05, P.timberDark), sx * 4.5, 0.1, sy * 4.5));
    dock.add(at(box(0.5, 0.3, 0.03, color), sx * 4.5 + 0.25, 0.55, sy * 4.5));
    dock.userData = { kind: 'sector', id: sector.id };
    dock.traverse((c) => (c.userData.pick ??= dock.userData));
    group.add(dock);

    const el = document.createElement('div');
    el.className = 'label label-harbor';
    el.textContent = sector.name;
    el.style.setProperty('--harbor', color);
    const label = new CSS2DObject(el);
    label.position.set(hx - sx * 1.5, 2.6, hy - sy * 1.5);
    group.add(label);
  });

  const colorBySector = new Map(world.sectors.map((s, i) => [s.id, SECTOR_COLORS[i % SECTOR_COLORS.length]] as const));
  const sectorById = new Map(world.sectors.map((s) => [s.id, s] as const));
  for (const customer of world.customers) {
    const sector = sectorById.get(customer.harbor);
    if (!sector) continue;
    const kind = shipKind(customer.stage);
    const spot = shipPlacement(sector.coast, sector.harbor.pos, customer.slot, customer.stage);
    const ship = buildShip(kind, colorBySector.get(customer.harbor)!);
    const root = new THREE.Group();
    root.add(ship);
    ship.scale.setScalar(kind === 'rowboat' ? 1.5 : 1.6);
    root.position.set(spot.x, 0, spot.y);
    root.rotation.y = spot.rotation;
    if (kind === 'wreck') {
      ship.rotation.x = 0.35;
      ship.position.y = -0.3;
    }
    if (kind === 'horizon')
      ship.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          const m = c.material as THREE.MeshLambertMaterial;
          m.transparent = true;
          m.opacity = 0.55;
          m.userData.baseOpacity = 0.55;
        }
      });
    root.userData = { kind: 'customer', id: customer.id };
    root.traverse((c) => (c.userData.pick ??= root.userData));
    const el = document.createElement('div');
    el.className = `label label-ship stage-${customer.stage}`;
    el.textContent = customer.name;
    const label = new CSS2DObject(el);
    label.position.set(0, 3.6, 0);
    root.add(label);
    group.add(root);
    ships.push({ customer, root, label: el });
    bobbers.push({ obj: ship, phase: customer.slot * 1.3, base: ship.position.y, wreck: kind === 'wreck' });
  }
  if (!stage.reducedMotion)
    stage.addTick((t) => {
      for (const b of bobbers) {
        b.obj.position.y = b.base + Math.sin(t * 1.3 + b.phase) * (b.wreck ? 0.02 : 0.08);
        if (!b.wreck) b.obj.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.04;
      }
    });
  return { group, ships };
}
