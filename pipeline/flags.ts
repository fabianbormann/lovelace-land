import type { Graph } from './graph';
import type { Traffic } from './traffic';

export const HIDDEN_HIGHWAY_TOP_FRACTION = 0.15;
export const HIDDEN_HIGHWAY_MAX_DEPENDENTS = 3;

export type Tier = 1 | 2 | 3 | 4;

export interface NodeFlags {
  stranded: boolean;
  hiddenHighway: boolean;
  tier: Tier;
  dependents: number;
}

/**
 * selfActive: buildings with on-chain transactions of their own right now. They have users even when
 * no customer on the island is named, so they are never stranded.
 */
export function computeFlags(graph: Graph, traffic: Traffic, selfActive: ReadonlySet<string> = new Set()): Map<string, NodeFlags> {
  const nodes = graph.data.nodes;
  const t = (id: string) => traffic.node.get(id) ?? 0;

  const descending = nodes.map((n) => t(n.id)).sort((a, b) => b - a);
  const topCount = Math.ceil(descending.length * HIDDEN_HIGHWAY_TOP_FRACTION);
  const topThreshold = topCount > 0 ? descending[topCount - 1] : Infinity;

  const active = nodes.map((n) => t(n.id)).filter((v) => v > 0).sort((a, b) => a - b);
  const nearestRank = (p: number) => active[Math.max(0, Math.ceil(p * active.length) - 1)];
  const [q1, q2, q3] = active.length > 0 ? [nearestRank(0.25), nearestRank(0.5), nearestRank(0.75)] : [0, 0, 0];

  const flags = new Map<string, NodeFlags>();
  for (const n of nodes) {
    const value = t(n.id);
    const stranded = value === 0 && !selfActive.has(n.id);
    const dependents = new Set(
      (graph.incoming.get(n.id) ?? []).filter((e) => e.confidence !== 'inferred').map((e) => e.from),
    ).size;
    const hiddenHighway = !stranded && value >= topThreshold && dependents <= HIDDEN_HIGHWAY_MAX_DEPENDENTS;
    const tier: Tier = stranded || value <= q1 ? 1 : value <= q2 ? 2 : value <= q3 ? 3 : 4;
    flags.set(n.id, { stranded, hiddenHighway, tier, dependents });
  }
  return flags;
}
