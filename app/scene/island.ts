import * as THREE from 'three';
import type { World } from '../../pipeline/emit';
import type { Target } from '../logic/hash';
import { tileKey, type WorldIndex } from '../logic/index';
import type { Appearance } from '../logic/lenses';
import { makeTrail } from '../logic/routes';
import { buildTerrain, MOUNTAIN_PEAK } from '../logic/terrain';
import { cursorAt, flagsAt, seriesAt, shipPresence, surfaceAt } from '../logic/time';
import { applyLook } from './appearance';
import { buildHarbors } from './harbors';
import { buildCardanoMark, buildRafts, buildSignposts, buildTerrainMesh, buildWater, makeSurface } from './landscape';
import { buildRoads } from './roads';
import { buildSettlers } from './settlers';
import { DAY, NIGHT, Stage } from './stage';
import { buildTown } from './town';

export interface Pick {
  target: Target | { kind: 'sector'; id: string };
  clientX: number;
  clientY: number;
}

export interface IslandMap {
  stage: Stage;
  apply(appearance: Appearance): void;
  focus(target: Target, opts?: { liftForBottomPanel?: boolean }): void;
  setSettlers(on: boolean): void;
  setNight(night: boolean): void;
  onHover(cb: (pick: Pick | null) => void): void;
  onSelect(cb: (pick: Pick | null) => void): void;
  setSelected(target: Target | null): void;
  /** show the island at time T (months since the first month, fractional) */
  setTime(T: number): void;
}

/** Assemble the whole island scene from world.json and wire pointer picking. */
export function createIsland(host: HTMLElement, world: World, idx: WorldIndex): IslandMap {
  const stage = new Stage(host);
  const terrain = buildTerrain(world);
  const { surfaceY } = makeSurface(terrain);

  const ground = buildTerrainMesh(world, terrain);
  stage.scene.add(ground);
  stage.scene.add(buildWater(terrain, stage));
  const mark = buildCardanoMark(stage, surfaceY);
  stage.scene.add(mark.object);
  stage.scene.add(buildSignposts(world, surfaceY));
  stage.scene.add(buildRafts(terrain, stage));
  const roads = buildRoads(world, surfaceY);
  stage.scene.add(roads.group);
  const town = buildTown(world, stage, surfaceY);
  const harbors = buildHarbors(world, stage, surfaceY);
  stage.scene.add(harbors.group);
  const settlers = buildSettlers(world, idx, stage, surfaceY, makeTrail(world, terrain));
  stage.scene.add(settlers.mesh);
  addDistantIslands(world, stage);

  const productsRegion = world.districts.find((d) => d.building === 'town')?.region;
  const portrait = host.clientWidth < host.clientHeight;
  // Landscape screens see the whole island; portrait phones start at the mountain end and pan east.
  const focusX = portrait
    ? MOUNTAIN_PEAK[0] + 30
    : productsRegion
      ? (MOUNTAIN_PEAK[0] + productsRegion.x1) / 2
      : (world.bounds.minX + world.bounds.maxX) / 2;
  stage.frame(world.bounds, new THREE.Vector3(focusX, 0, 0));
  stage.camera.zoom = initialZoom(world, host);
  stage.camera.updateProjectionMatrix();

  const labelLayer = stage.labels.domElement;
  const zoomBand = (z: number) => (z < 0.9 ? 'far' : z < 1.9 ? 'mid' : 'near');
  stage.onZoom = (z) => (labelLayer.dataset.zoom = zoomBand(z));
  labelLayer.dataset.zoom = zoomBand(stage.camera.zoom);

  const buildingById = new Map(town.map((b) => [b.node.id, b] as const));
  const shipById = new Map(harbors.ships.map((s) => [s.customer.id, s] as const));
  let current: Appearance | null = null;
  let hovered: string | null = null;
  let selected: string | null = null;

  const refreshObject = (kind: 'node' | 'customer', id: string) => {
    if (!current) return;
    const key = `${kind}:${id}`;
    if (kind === 'node') {
      const b = buildingById.get(id);
      if (b) b.applyLook(current.nodes.get(id)!, key === hovered || key === selected);
    } else {
      const s = shipById.get(id);
      if (!s) return;
      const look = current.customers.get(id)!;
      applyShipLook(s.root, look, key === hovered || key === selected);
      s.label.classList.toggle('is-shown', key === hovered || key === selected || look.glow);
    }
  };

  // Picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables: THREE.Object3D[] = [...town.map((b) => b.root), ...harbors.ships.map((s) => s.root), harbors.group, ground];
  const canvas = stage.renderer.domElement;
  const pickAt = (clientX: number, clientY: number): Pick | null => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, stage.camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      // the raycaster also hits children of hidden groups (empty plots, ships at sea)
      if (!shownInScene(hit.object)) continue;
      const data = hit.object.userData.pick as { kind: string; id: string } | undefined;
      if (data && (data.kind === 'node' || data.kind === 'customer' || data.kind === 'sector'))
        return { target: data as Pick['target'], clientX, clientY };
      if (hit.object === ground) {
        const key = tileKey(Math.round(hit.point.x), Math.round(hit.point.z));
        const edges = (idx.edgesAtTile.get(key) ?? []).filter((e) => !current?.edges.get(e.id)?.hidden);
        if (!edges.length) return null;
        const best = [...edges].sort((a, b) => b.traffic - a.traffic)[0];
        return { target: { kind: 'edge', id: best.id }, clientX, clientY };
      }
    }
    return null;
  };

  let hoverCb: (p: Pick | null) => void = () => {};
  let selectCb: (p: Pick | null) => void = () => {};
  let pending: PointerEvent | null = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (!pending) requestAnimationFrame(() => {
      const ev = pending;
      if (!ev) return; // the pointer left the canvas meanwhile
      pending = null;
      const p = pickAt(ev.clientX, ev.clientY);
      const key = p && (p.target.kind === 'node' || p.target.kind === 'customer') ? `${p.target.kind}:${p.target.id}` : null;
      if (key !== hovered) {
        const prev = hovered;
        hovered = key;
        if (prev) refreshObject(prev.split(':')[0] as 'node', prev.slice(prev.indexOf(':') + 1));
        if (key) refreshObject(key.split(':')[0] as 'node', key.slice(key.indexOf(':') + 1));
      }
      canvas.style.cursor = p ? 'pointer' : '';
      hoverCb(p);
    });
    pending = e;
  });
  canvas.addEventListener('pointerleave', () => {
    pending = null;
    const prev = hovered;
    hovered = null;
    if (prev) refreshObject(prev.split(':')[0] as 'node', prev.slice(prev.indexOf(':') + 1));
    canvas.style.cursor = '';
    hoverCb(null);
  });
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    selectCb(pickAt(e.clientX, e.clientY));
  });

  // The Cardano mark glows brighter the more activity reaches it.
  let markLight: THREE.PointLight | undefined;
  mark.object.traverse((c) => c instanceof THREE.PointLight && (markLight = c));
  stage.addTick((t) => {
    if (markLight) markLight.intensity = 18 + 60 * settlers.arriving * (0.85 + 0.15 * Math.sin(t * 3));
  });

  // Time axis
  const tl = world.timeline;
  let T = tl.months.length - 1;
  let surfaces: Map<string, number> | null = null;
  // Monthly traffic per road tile, summed once so playback only interpolates.
  const edgeIndex = new Map(world.edges.map((e, i) => [e.id, i] as const));
  const tileSeries = [...idx.edgesAtTile].map(([key, edges]) => {
    const series = tl.months.map(() => 0);
    for (const e of edges) tl.edges[edgeIndex.get(e.id)!].forEach((v, m) => (series[m] += v));
    return [key, series] as const;
  });
  /** surfaces for time T, or null when nothing changed since last time */
  const computeSurfaces = (previous: Map<string, number> | null) => {
    const map = new Map<string, number>();
    let changed = previous === null;
    for (const [key, series] of tileSeries) {
      const surface = surfaceAt(seriesAt(series, T));
      map.set(key, surface);
      if (!changed && previous!.get(key) !== surface) changed = true;
    }
    return changed ? map : null;
  };
  let shownMonth = -1;
  const applyTime = () => {
    const { index } = cursorAt(tl.months, T);
    if (index !== shownMonth) {
      shownMonth = index;
      const { stranded } = flagsAt(world, index);
      for (const b of town) b.setState(tl.nodes[b.node.id].state[index], Number(tl.nodes[b.node.id].tier[index]), stranded.has(b.node.id));
    }
    for (const s of harbors.ships) {
      const p = shipPresence(tl, s.customer.id, T);
      s.setPresence(p.docked, p.wreck);
    }
    settlers.setTime(T);
    const next = computeSurfaces(surfaces);
    if (next) {
      surfaces = next;
      if (current) roads.apply(current, surfaces);
    }
  };
  applyTime();

  stage.setColors(DAY);
  stage.start();

  const positionOf = (target: Target): THREE.Vector3 | null => {
    if (target.kind === 'node') {
      const b = buildingById.get(target.id);
      return b ? b.root.position.clone() : null;
    }
    if (target.kind === 'customer') {
      // the berth, not the ship: a ship that sailed away would leave the camera on open sea
      const s = shipById.get(target.id);
      return s ? s.berth.clone() : null;
    }
    const e = idx.edge.get(target.id);
    if (!e) return null;
    const [x, y] = e.path[Math.floor(e.path.length / 2)];
    return new THREE.Vector3(x, surfaceY(x, y), y);
  };

  return {
    stage,
    apply(appearance) {
      current = appearance;
      roads.apply(appearance, surfaces);
      for (const b of town) {
        const look = appearance.nodes.get(b.node.id)!;
        refreshObject('node', b.node.id);
        b.label.classList.toggle('is-dim', look.dim);
        b.label.classList.toggle('is-glow', look.glow);
      }
      for (const s of harbors.ships) refreshObject('customer', s.customer.id);
      settlers.setVisibleCustomers(new Set([...appearance.customers].filter(([, l]) => !l.hidden && !l.dim).map(([id]) => id)));
    },
    focus(target, opts = {}) {
      const p = positionOf(target);
      if (p) stage.flyTo(p, target.kind === 'edge' ? 1.6 : 2.4, opts.liftForBottomPanel ? 0.5 : 0);
    },
    setSettlers: (on) => settlers.setEnabled(on),
    setNight: (night) => {
      stage.setColors(night ? NIGHT : DAY);
      mark.setNight(night);
    },
    onHover: (cb) => (hoverCb = cb),
    onSelect: (cb) => (selectCb = cb),
    setTime(next) {
      T = next;
      applyTime();
    },
    setSelected(target) {
      const prev = selected;
      selected = target && (target.kind === 'node' || target.kind === 'customer') ? `${target.kind}:${target.id}` : null;
      for (const key of [prev, selected]) if (key) refreshObject(key.split(':')[0] as 'node', key.slice(key.indexOf(':') + 1));
    },
  };
}

function shownInScene(obj: THREE.Object3D | null): boolean {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function applyShipLook(root: THREE.Object3D, look: Appearance['customers'] extends Map<string, infer L> ? L : never, hovered: boolean) {
  applyLook(root, { ...look, hidden: false }, hovered);
}

function initialZoom(world: World, host: HTMLElement) {
  if (host.clientWidth < host.clientHeight) return 1.5;
  const w = world.bounds.maxX - world.bounds.minX + 10;
  const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
  // frustum width at zoom 1 is 2 * 26 * aspect; fit most of the island in view
  return Math.min(1.4, Math.max(0.4, (2 * 26 * aspect * 1.25) / w));
}

/** Faint neighbouring islands in the fog beyond the bridges. */
function addDistantIslands(world: World, stage: Stage) {
  if (!world.nodes.some((n) => n.district === 'bridges')) return;
  const material = new THREE.MeshLambertMaterial({ color: '#7d9a7a', flatShading: true });
  const spots: [number, number, number][] = [
    [world.bounds.maxX + 55, world.bounds.minY - 10, 9],
    [world.bounds.maxX + 70, world.bounds.maxY + 12, 12],
  ];
  for (const [x, z, r] of spots) {
    const island = new THREE.Mesh(new THREE.ConeGeometry(r, 4, 7), material);
    island.position.set(x, 0.6, z);
    stage.scene.add(island);
  }
}
