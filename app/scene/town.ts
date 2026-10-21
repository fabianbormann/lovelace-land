import * as THREE from 'three';
import { accentFor } from '../logic/colors';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World, WorldNode } from '../../pipeline/emit';
import { buildBuilding, flames, plotMarker, ruinify, scaffold, strandedFlag, TIER_SCALE, type BuiltBuilding, type Tier } from '../buildings/archetypes';
import type { Look } from '../logic/lenses';
import { applyLook, type Condition } from './appearance';
import type { Stage } from './stage';

/** One building and every look the time axis can give it. */
export interface PlacedBuilding {
  node: WorldNode;
  root: THREE.Group;
  label: HTMLElement;
  /** show the building for a lifecycle state (see pipeline/timeline.ts) at a size tier */
  setState(state: string, tier: number, stranded: boolean): void;
  /** re-apply the lens look (dim / glow / hover) */
  applyLook(look: Look, hovered: boolean): void;
}

const TIER_NAMES = ['hut', 'house', 'hall', 'keep'] as const;
export const tierName = (tier: number) => TIER_NAMES[Math.max(1, tier) - 1];

function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function buildTown(world: World, stage: Stage, surfaceY: (x: number, y: number) => number): PlacedBuilding[] {
  const districtById = new Map(world.districts.map((d) => [d.id, d] as const));
  const sectorColor = new Map(world.sectors.map((s, i) => [s.id, SECTOR_COLORS[i % SECTOR_COLORS.length]] as const));
  const placed: PlacedBuilding[] = [];
  const animated: { tick: (t: number) => void; visible: () => boolean }[] = [];

  for (const node of world.nodes) {
    const district = districtById.get(node.district)!;
    const seed = hash(node.id);
    const accent = accentFor(node, district.color, sectorColor);
    const opts = { tier: node.tier, accent, deprecated: false, stranded: false, seed: seed * 10 };
    const s = TIER_SCALE[node.tier];
    const normal = buildBuilding(district.building, opts);
    const ruin = buildBuilding(district.building, opts);
    ruinify(ruin.object, seed * 10);
    const fire = flames(s, seed * 10);
    const build = scaffold(s);
    const repair = scaffold(s, true);
    const plot = plotMarker(s, seed);
    const flag = strandedFlag(s);
    const facing = Math.floor(seed * 4) * (Math.PI / 2);
    const body = new THREE.Group();
    body.add(normal.object, ruin.object, fire.group, build, repair, flag);
    body.rotation.y = facing;
    const root = new THREE.Group();
    root.add(body, plot);
    root.position.set(node.pos[0], surfaceY(node.pos[0], node.pos[1]), node.pos[1]);
    root.userData = { kind: 'node', id: node.id };
    root.traverse((c) => (c.userData.pick ??= root.userData));
    plot.traverse((c) => (c.userData.pick = undefined));

    const el = document.createElement('div');
    el.className = `label label-node tier-${node.tier}`;
    el.textContent = node.name;
    const label = new CSS2DObject(el);
    label.position.set(0, 1.2 + node.tier * 0.55, 0);
    root.add(label);

    let condition: Condition = 'normal';
    let current = 'a';
    const tick = (t: number) => {
      normal.tick?.(t);
      if (current === 'b') fire.tick(t);
    };
    animated.push({ tick, visible: () => root.visible });

    const building: PlacedBuilding = {
      node,
      root,
      label: el,
      setState(state, tier, stranded) {
        current = state;
        const standing = state !== 'e' && state !== 'g';
        normal.object.visible = state === 'a' || state === 'r' || state === 'c' || state === 'b';
        ruin.object.visible = state === 'u';
        fire.group.visible = state === 'b';
        build.visible = state === 'c';
        repair.visible = state === 'r';
        plot.visible = state === 'g';
        flag.visible = stranded && standing;
        body.visible = standing;
        el.hidden = !standing;
        el.classList.toggle('is-stranded', stranded && standing);
        condition = state === 'b' ? 'burn' : state === 'r' ? 'risk' : 'normal';
        // size follows that month's traffic; construction rises from half height
        const scale = (TIER_SCALE[Math.max(1, tier) as Tier] ?? s) / s;
        body.scale.set(scale, state === 'c' ? scale * 0.55 : scale, scale);
        label.position.y = (1.2 + Math.max(1, tier) * 0.55) * (state === 'c' ? 0.7 : 1);
      },
      applyLook(look, hovered) {
        for (const part of [normal.object, ruin.object]) applyLook(part, { ...look, hidden: false }, hovered, condition);
        root.visible = !look.hidden || current === 'g';
      },
    };
    stage.scene.add(root);
    placed.push(building);
  }
  const tickAll = (t: number) => animated.forEach((a) => a.visible() && a.tick(t));
  if (!stage.reducedMotion) stage.addTick((t) => tickAll(t));
  else tickAll(0);
  return placed;
}

export type { BuiltBuilding };

/** Harbor/sector palette — distinct, legible on grass and water. */
export const SECTOR_COLORS = ['#c0392b', '#d68910', '#7d3c98', '#1f618d', '#117a65', '#b9770e', '#884ea0', '#2e86c1', '#a04000', '#239b56'];
