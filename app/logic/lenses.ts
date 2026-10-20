import { customerClosure, highwayEdges, type WorldIndex } from './index';

export type Lens = 'none' | 'stranded' | 'highways' | 'follow';

export interface ViewState {
  lens: Lens;
  /** customer id for the follow lens */
  follow: string | null;
  showRumors: boolean;
  hiddenDistricts: Set<string>;
  hiddenSectors: Set<string>;
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
  hiddenDistricts: new Set(),
  hiddenSectors: new Set(),
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

  const closure = state.lens === 'follow' && state.follow ? customerClosure(idx, state.follow, state.showRumors) : null;
  const highways = state.lens === 'highways' ? highwayEdges(idx) : null;

  const nodes = new Map<string, Look>();
  for (const n of world.nodes) {
    let dim = false;
    let glow = false;
    if (state.lens === 'stranded') [dim, glow] = [!n.stranded, n.stranded];
    else if (state.lens === 'highways') [dim, glow] = [!n.hiddenHighway, n.hiddenHighway];
    else if (closure) [dim, glow] = [!closure.nodes.has(n.id), closure.nodes.has(n.id)];
    nodes.set(n.id, look(dim || filteredNode(n.id), glow));
  }

  const customers = new Map<string, Look>();
  for (const c of world.customers) {
    const followed = closure !== null && state.follow === c.id;
    customers.set(c.id, look((closure !== null && !followed) || filteredCustomer(c.id), followed));
  }

  const edges = new Map<string, Look>();
  for (const e of world.edges) {
    const hidden = e.confidence === 'inferred' && !state.showRumors;
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
