import { customerClosure, nodeUpstream, type WorldIndex } from './index';
import { flagsAt, isStanding } from './time';

export type Lens = 'none' | 'stranded' | 'highways' | 'follow';

export interface ViewState {
  lens: Lens;
  /** follow lens: a customer id (down to the mountain) or a node id (back to its ships) */
  follow: string | null;
  showRumors: boolean;
  /** hide roads backed only by third-party reports */
  hideReported: boolean;
  hiddenDistricts: Set<string>;
  hiddenSectors: Set<string>;
  /** month index on the time axis; null shows the latest snapshot */
  time: number | null;
}

export interface Look {
  dim: boolean;
  glow: boolean;
  hidden: boolean;
}

export interface Appearance {
  nodes: Map<string, Look>;
  customers: Map<string, Look>;
  edges: Map<string, Look>;
  tiles: Map<string, Look>;
}

export const defaultViewState = (): ViewState => ({
  lens: 'none',
  follow: null,
  showRumors: false,
  hideReported: false,
  hiddenDistricts: new Set(),
  hiddenSectors: new Set(),
  time: null,
});

const look = (dim: boolean, glow: boolean, hidden = false): Look => ({ dim, glow: glow && !dim, hidden });

export function computeAppearance(idx: WorldIndex, state: ViewState): Appearance {
  const { world } = idx;
  const filteredNode = (id: string) => {
    const n = idx.node.get(id);
    if (!n) return false;
    return state.hiddenDistricts.has(n.district) || (n.primarySector !== null && state.hiddenSectors.has(n.primarySector));
  };
  const filteredCustomer = (id: string) => {
    const c = idx.customer.get(id);
    return c ? state.hiddenSectors.has(c.harbor) : false;
  };
  const filtered = (id: string) => filteredNode(id) || filteredCustomer(id);

  const following = state.lens === 'follow' && state.follow ? state.follow : null;
  const closure =
    following && idx.customer.has(following)
      ? { ...customerClosure(idx, following, state.showRumors), customers: new Set([following]) }
      : following && idx.node.has(following)
        ? (() => {
            const up = nodeUpstream(idx, following, state.showRumors);
            return { nodes: new Set([...up.nodes, following]), edges: up.edges, customers: up.customers };
          })()
        : null;
  const tl = world.timeline;
  const month = state.time === null ? null : Math.floor(state.time);
  const monthFlags = month === null ? null : flagsAt(world, month);
  const isStranded = (id: string) => (monthFlags ? monthFlags.stranded.has(id) : idx.node.get(id)!.stranded);
  const isHighway = (id: string) => (monthFlags ? monthFlags.highways.has(id) : idx.node.get(id)!.hiddenHighway);
  const standing = (id: string) => month === null || !tl.nodes[id] || isStanding(tl.nodes[id].state[month]);
  const docked = (id: string) => month === null || tl.customers[id]?.state[month] === 'd';
  const present = (id: string) => (idx.node.has(id) ? standing(id) : docked(id));
  const highways =
    state.lens === 'highways'
      ? new Set(world.edges.filter((e) => e.confidence !== 'inferred' && idx.node.has(e.to) && isHighway(e.to)).map((e) => e.id))
      : null;

  const nodes = new Map<string, Look>();
  for (const n of world.nodes) {
    let dim = false;
    let glow = false;
    if (state.lens === 'stranded') [dim, glow] = [!isStranded(n.id), isStranded(n.id)];
    else if (state.lens === 'highways') [dim, glow] = [!isHighway(n.id), isHighway(n.id)];
    else if (closure) [dim, glow] = [!closure.nodes.has(n.id), closure.nodes.has(n.id)];
    nodes.set(n.id, look(dim || filteredNode(n.id), glow, !standing(n.id)));
  }

  const customers = new Map<string, Look>();
  for (const c of world.customers) {
    const followed = closure !== null && closure.customers.has(c.id);
    customers.set(c.id, look((closure !== null && !followed) || filteredCustomer(c.id), followed));
  }

  const edges = new Map<string, Look>();
  for (const e of world.edges) {
    const hidden =
      (e.confidence === 'inferred' && !state.showRumors) || (e.confidence === 'reported' && state.hideReported) || !present(e.from) || !present(e.to);
    let dim = false;
    let glow = false;
    if (state.lens === 'stranded') dim = true;
    else if (highways) [dim, glow] = [!highways.has(e.id), highways.has(e.id)];
    else if (closure) [dim, glow] = [!closure.edges.has(e.id), closure.edges.has(e.id)];
    edges.set(e.id, look(dim || filtered(e.from) || filtered(e.to), glow, hidden));
  }

  const tiles = new Map<string, Look>();
  for (const [key, crossing] of idx.edgesAtTile) {
    const visible = crossing.map((e) => edges.get(e.id)!).filter((l) => !l.hidden);
    if (visible.length === 0) tiles.set(key, look(false, false, true));
    else tiles.set(key, look(visible.every((l) => l.dim), visible.some((l) => l.glow)));
  }

  return { nodes, customers, edges, tiles };
}
