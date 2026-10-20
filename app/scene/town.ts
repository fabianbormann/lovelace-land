import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World, WorldNode } from '../../pipeline/emit';
import { buildBuilding, type BuiltBuilding } from '../buildings/archetypes';
import type { Stage } from './stage';

export interface PlacedBuilding {
  node: WorldNode;
  root: THREE.Group;
  label: HTMLElement;
}

const TIER_NAMES = ['hut', 'house', 'hall', 'keep'] as const;
export const tierName = (tier: number) => TIER_NAMES[tier - 1];

function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function buildTown(world: World, stage: Stage, surfaceY: (x: number, y: number) => number): PlacedBuilding[] {
  const districtById = new Map(world.districts.map((d) => [d.id, d] as const));
  const sectorColor = new Map(world.sectors.map((s, i) => [s.id, SECTOR_COLORS[i % SECTOR_COLORS.length]] as const));
  const placed: PlacedBuilding[] = [];
  const animated: BuiltBuilding[] = [];
  for (const node of world.nodes) {
    const district = districtById.get(node.district)!;
    const seed = hash(node.id);
    const accent = node.primarySector ? (sectorColor.get(node.primarySector) ?? district.color) : district.color;
    const built = buildBuilding(district.building, {
      tier: node.tier,
      accent,
      deprecated: node.status === 'deprecated',
      stranded: node.stranded,
      seed: seed * 10,
    });
    const root = new THREE.Group();
    root.add(built.object);
    // Face the building towards the nearest 90° so the town looks planned, varied by id.
    built.object.rotation.y = Math.floor(seed * 4) * (Math.PI / 2);
    root.position.set(node.pos[0], surfaceY(node.pos[0], node.pos[1]), node.pos[1]);
    root.userData = { kind: 'node', id: node.id };
    root.traverse((c) => (c.userData.pick ??= root.userData));
    if (built.tick) animated.push(built);

    const el = document.createElement('div');
    el.className = `label label-node tier-${node.tier}`;
    el.textContent = node.name;
    if (node.hiddenHighway) el.classList.add('is-highway');
    if (node.stranded) el.classList.add('is-stranded');
    const label = new CSS2DObject(el);
    label.position.set(0, 1.2 + node.tier * 0.55, 0);
    root.add(label);

    stage.scene.add(root);
    placed.push({ node, root, label: el });
  }
  if (!stage.reducedMotion) stage.addTick((t) => animated.forEach((b) => b.tick!(t)));
  else animated.forEach((b) => b.tick!(0));
  return placed;
}

/** Harbor/sector palette — distinct, legible on grass and water. */
export const SECTOR_COLORS = ['#c0392b', '#d68910', '#7d3c98', '#1f618d', '#117a65', '#b9770e', '#884ea0', '#2e86c1', '#a04000', '#239b56'];
