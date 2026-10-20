import type { World, WorldCustomer, WorldEdge, WorldNode } from '../../pipeline/emit';

export interface WorldIndex {
  world: World;
  node: Map<string, WorldNode>;
  customer: Map<string, WorldCustomer>;
  edge: Map<string, WorldEdge>;
  out: Map<string, WorldEdge[]>;
  incoming: Map<string, WorldEdge[]>;
  /** "x,y" of a road tile → edges whose path crosses it */
  edgesAtTile: Map<string, WorldEdge[]>;
}

export const tileKey = (x: number, y: number) => `${x},${y}`;

export function indexWorld(world: World): WorldIndex {
  const out = new Map<string, WorldEdge[]>();
  const incoming = new Map<string, WorldEdge[]>();
  for (const id of [...world.nodes.map((n) => n.id), ...world.customers.map((c) => c.id)]) {
    out.set(id, []);
    incoming.set(id, []);
  }
  const roadTiles = new Set(world.tiles.map((t) => tileKey(t.pos[0], t.pos[1])));
  const edgesAtTile = new Map<string, WorldEdge[]>();
  for (const e of world.edges) {
    out.get(e.from)?.push(e);
    incoming.get(e.to)?.push(e);
    for (const [x, y] of e.path) {
      const k = tileKey(x, y);
      if (!roadTiles.has(k)) continue;
      const list = edgesAtTile.get(k);
      if (list) list.push(e);
      else edgesAtTile.set(k, [e]);
    }
  }
  return {
    world,
    node: new Map(world.nodes.map((n) => [n.id, n] as const)),
    customer: new Map(world.customers.map((c) => [c.id, c] as const)),
    edge: new Map(world.edges.map((e) => [e.id, e] as const)),
    out,
    incoming,
    edgesAtTile,
  };
}

export interface Closure {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Everything a customer depends on, all the way down to the mountain. */
export function customerClosure(idx: WorldIndex, customerId: string, includeInferred: boolean): Closure {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!idx.customer.has(customerId)) return { nodes, edges };
  const queue = [customerId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of idx.out.get(current) ?? []) {
      if (!includeInferred && e.confidence === 'inferred') continue;
      edges.add(e.id);
      if (!nodes.has(e.to)) {
        nodes.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return { nodes, edges };
}

/** Non-rumor edges that lead into a hidden-highway building. */
export function highwayEdges(idx: WorldIndex): Set<string> {
  return new Set(
    idx.world.edges
      .filter((e) => e.confidence !== 'inferred' && idx.node.get(e.to)?.hiddenHighway)
      .map((e) => e.id),
  );
}
