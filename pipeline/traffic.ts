import type { Graph } from './graph';
import type { Stage } from './schema';

export const STAGE_WEIGHT: Record<Stage, number> = { production: 1, pilot: 0.5, announced: 0.25, ended: 0 };

export interface Traffic {
  edge: Map<string, number>;
  node: Map<string, number>;
}

/** Each customer adds its stage weight once to every edge and node in its dependency closure. */
export function computeTraffic(graph: Graph, opts: { includeInferred: boolean }): Traffic {
  const edge = new Map<string, number>(graph.edges.map((e) => [e.id, 0]));
  const node = new Map<string, number>(graph.data.nodes.map((n) => [n.id, 0]));

  for (const c of graph.data.customers) {
    const weight = STAGE_WEIGHT[c.stage];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    const queue = [c.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of graph.out.get(current) ?? []) {
        if (!opts.includeInferred && e.confidence === 'inferred') continue;
        seenEdges.add(e.id);
        if (!seenNodes.has(e.to)) {
          seenNodes.add(e.to);
          queue.push(e.to);
        }
      }
    }
    for (const id of seenEdges) edge.set(id, edge.get(id)! + weight);
    for (const id of seenNodes) node.set(id, node.get(id)! + weight);
  }
  return { edge, node };
}
