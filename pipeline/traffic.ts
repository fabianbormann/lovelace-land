import type { Graph } from './graph';
import type { Stage } from './schema';

export const STAGE_WEIGHT: Record<Stage, number> = { production: 1, pilot: 0.5, announced: 0.25, ended: 0 };

export interface Traffic {
  edge: Map<string, number>;
  node: Map<string, number>;
}

export interface Closure {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Everything each customer depends on, all the way down (each edge and node once). */
export function customerClosures(graph: Graph, opts: { includeInferred: boolean }): Map<string, Closure> {
  const result = new Map<string, Closure>();
  for (const c of graph.data.customers) {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const queue = [c.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of graph.out.get(current) ?? []) {
        if (!opts.includeInferred && e.confidence === 'inferred') continue;
        edges.add(e.id);
        if (!nodes.has(e.to)) {
          nodes.add(e.to);
          queue.push(e.to);
        }
      }
    }
    result.set(c.id, { nodes, edges });
  }
  return result;
}

/** Sum customer weights over their closures. */
export function trafficFromWeights(graph: Graph, closures: Map<string, Closure>, weight: (customerId: string) => number): Traffic {
  const edge = new Map<string, number>(graph.edges.map((e) => [e.id, 0]));
  const node = new Map<string, number>(graph.data.nodes.map((n) => [n.id, 0]));
  for (const [id, closure] of closures) {
    const w = weight(id);
    if (!w) continue;
    for (const e of closure.edges) edge.set(e, edge.get(e)! + w);
    for (const n of closure.nodes) node.set(n, node.get(n)! + w);
  }
  return { edge, node };
}

/** Each customer adds its stage weight once to every edge and node in its dependency closure. */
export function computeTraffic(graph: Graph, opts: { includeInferred: boolean }): Traffic {
  const stage = new Map(graph.data.customers.map((c) => [c.id, STAGE_WEIGHT[c.stage]] as const));
  return trafficFromWeights(graph, customerClosures(graph, opts), (id) => stage.get(id)!);
}
