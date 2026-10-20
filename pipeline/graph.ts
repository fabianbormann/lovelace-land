import type { LoadedData } from './load';
import type { Confidence, Evidence, Relation } from './schema';
import { cmp } from './util';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation?: Relation;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface Graph {
  data: LoadedData;
  edges: GraphEdge[];
  out: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
}

export const edgeId = (from: string, to: string) => `${from}->${to}`;

/** Expects data that passed validateReferences. */
export function buildGraph(data: LoadedData): Graph {
  const edges: GraphEdge[] = [];
  for (const n of data.nodes)
    for (const u of n.uses)
      edges.push({ id: edgeId(n.id, u.target), from: n.id, to: u.target, relation: u.relation, confidence: u.confidence, evidence: u.evidence });
  for (const c of data.customers)
    for (const u of c.uses)
      edges.push({ id: edgeId(c.id, u.target), from: c.id, to: u.target, confidence: u.confidence, evidence: u.evidence });
  edges.sort((a, b) => cmp(a.id, b.id));

  const out = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const id of [...data.nodes.map((n) => n.id), ...data.customers.map((c) => c.id)]) {
    out.set(id, []);
    incoming.set(id, []);
  }
  for (const e of edges) {
    out.get(e.from)!.push(e);
    incoming.get(e.to)!.push(e);
  }
  return { data, edges, out, incoming };
}

export function findCycles(graph: Graph): string[][] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const found = new Map<string, string[]>();

  const visit = (id: string) => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const e of graph.out.get(id) ?? []) {
      const s = state.get(e.to);
      if (s === 'visiting') {
        const cycle = stack.slice(stack.indexOf(e.to));
        const start = cycle.indexOf([...cycle].sort(cmp)[0]);
        const normalized = [...cycle.slice(start), ...cycle.slice(0, start)];
        found.set(normalized.join('>'), normalized);
      } else if (s === undefined) {
        visit(e.to);
      }
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of graph.data.nodes.map((n) => n.id).sort(cmp)) if (!state.has(id)) visit(id);
  return [...found.keys()].sort(cmp).map((k) => found.get(k)!);
}
