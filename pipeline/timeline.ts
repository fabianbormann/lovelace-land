import type { Activity, MonthCounts } from './activity';
import type { Graph } from './graph';
import { monthDiff } from './months';
import { customerClosures, trafficFromWeights } from './traffic';

/** First month of the time axis: Alonzo, when smart contracts arrived. */
export const TIMELINE_START = '2021-09';
/** Flow assumed for announced or inferred presence, in transactions per month. */
export const DATED_FLOW = 10;
export const BURNING_AFTER = 4;
export const RUIN_AFTER = 6;
export const GRASS_AFTER = 12;
export const AT_RISK_AFTER = 6;
/** A ship stays docked through this many quiet months before it sails away. */
export const DOCKED_GRACE = 2;

/** e empty plot · c construction · a active · r at risk · b burning · u ruin · g grass */
export type NodeState = 'e' | 'c' | 'a' | 'r' | 'b' | 'u' | 'g';
/** d docked · a away · w wreck */
export type ShipState = 'd' | 'a' | 'w';
export type FlowSource = 'onchain' | 'announced' | 'products' | 'product-activity' | 'assumed' | 'none';

export interface CustomerTimeline {
  tx: number[];
  w: number[];
  state: string;
  source: FlowSource;
}

export interface NodeTimeline {
  traffic: number[];
  tier: string;
  state: string;
  commits: number[];
  tx: number[];
  lastCommit: string | null;
  lastUse: string | null;
  noData: boolean;
}

export interface Timeline {
  months: string[];
  totals: number[];
  customers: Record<string, CustomerTimeline>;
  nodes: Record<string, NodeTimeline>;
  /** traffic per month, aligned with graph.edges */
  edges: number[][];
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const at = (counts: MonthCounts | undefined, months: string[]) => months.map((m) => counts?.[m] ?? 0);

export function computeTimeline(graph: Graph, activity: Activity, months: string[]): Timeline {
  const { nodes, customers } = graph.data;
  const last = months.length - 1;
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const inWindow = (active: { from: string; until?: string } | undefined, m: string) =>
    !!active && monthDiff(active.from, m) >= 0 && (!active.until || monthDiff(m, active.until) >= 0);
  /** A product's own transactions, ignoring any after its announced end (its contracts may live on elsewhere). */
  const ownTx = (id: string): MonthCounts | undefined => {
    const series = activity.tx.get(id);
    const until = nodeById.get(id)?.active?.until;
    if (!series || !until) return series;
    return Object.fromEntries(Object.entries(series).filter(([m]) => monthDiff(m, until) >= 0));
  };

  // 1. Customer flows
  const customerTl: Record<string, CustomerTimeline> = {};
  for (const c of customers) {
    let tx: number[];
    let source: FlowSource;
    const products = c.uses.map((u) => ownTx(u.target)).filter((s): s is MonthCounts => s !== undefined);
    if (activity.tx.has(c.id)) {
      tx = at(activity.tx.get(c.id), months);
      source = 'onchain';
    } else if (c.active) {
      const until = c.active.until ?? months[last];
      tx = months.map((m) => (monthDiff(c.active!.from, m) >= 0 && monthDiff(m, until) >= 0 ? DATED_FLOW : 0));
      source = 'announced';
    } else if (products.length && c.type === 'segment') {
      tx = months.map((m) => products.reduce((s, p) => s + (p[m] ?? 0), 0));
      source = 'products';
    } else if (products.length) {
      tx = months.map((m) => (products.some((p) => (p[m] ?? 0) > 0) ? DATED_FLOW : 0));
      source = 'product-activity';
    } else if (c.stage === 'ended') {
      tx = months.map(() => 0);
      source = 'none';
    } else {
      tx = months.map(() => DATED_FLOW);
      source = 'assumed';
    }
    // The running month is still being collected: carry last month's flow so ships don't leave early.
    if (last > 0 && source !== 'announced') tx[last] = Math.max(tx[last], tx[last - 1]);
    const w = tx.map((v) => round(Math.log10(1 + v)));
    const lastActive = w.reduce((found, v, i) => (v > 0 ? i : found), -1);
    const state = w
      .map((_, i) => {
        if (c.stage === 'ended') {
          // a wreck only after its last activity; without any data, only in today's snapshot
          if (lastActive === -1) return i === last ? 'w' : 'a';
          if (i > lastActive) return 'w';
        }
        // sparse activity (a treasury paying out every few months) should not send the ship back and forth
        for (let k = Math.max(0, i - DOCKED_GRACE); k <= i; k++) if (w[k] > 0) return 'd';
        return 'a';
      })
      .join('');
    customerTl[c.id] = { tx, w, state, source };
  }

  // 2. Monthly traffic over each customer's (non-rumor) closure
  const closures = customerClosures(graph, { includeInferred: false });
  const edgeIndex = new Map(graph.edges.map((e, i) => [e.id, i] as const));
  const edges = graph.edges.map(() => months.map(() => 0));
  const nodeTraffic = new Map(nodes.map((n) => [n.id, months.map(() => 0)] as const));
  months.forEach((_, i) => {
    const t = trafficFromWeights(graph, closures, (id) => customerTl[id].w[i]);
    for (const [id, v] of t.edge) edges[edgeIndex.get(id)!][i] = round(v);
    for (const [id, v] of t.node) nodeTraffic.get(id)![i] = round(v);
  });

  // 3. Building lifecycle
  const nodeTl: Record<string, NodeTimeline> = {};
  for (const n of nodes) {
    const commitSeries = activity.commits.get(n.id);
    const txSeries = ownTx(n.id);
    const hasRepo = commitSeries !== undefined;
    const traffic = nodeTraffic.get(n.id)!;
    const commits = at(commitSeries, months);
    const tx = at(txSeries, months);
    // without transaction data, an announced active window stands in for use
    const used = months.map((m, i) => traffic[i] > 0 || tx[i] > 0 || (txSeries === undefined && inWindow(n.active, m)));
    // Month offsets relative to the window start; commits may predate it.
    const commitOffsets = Object.entries(commitSeries ?? {})
      .filter(([, v]) => v > 0)
      .map(([m]) => monthDiff(months[0], m))
      .sort((a, b) => a - b);
    const useOffsets = used.flatMap((u, i) => (u ? [i] : []));
    const announced = n.active ? monthDiff(months[0], n.active.from) : null;
    const firsts = [commitOffsets[0], useOffsets[0], announced ?? undefined].filter((v): v is number => v !== undefined);
    const noData = !hasRepo && txSeries === undefined && useOffsets.length === 0 && !n.active;
    const founded = firsts.length ? Math.min(...firsts) : 0;
    const lastBefore = (offsets: number[], i: number) => {
      let found: number | null = null;
      for (const o of offsets) if (o <= i) found = o;
      return found;
    };

    const state: NodeState[] = [];
    months.forEach((_, i) => {
      if (noData) return state.push('a');
      if (i < founded) return state.push('e');
      // the running month is not over yet, so it does not add inactivity on its own
      const eff = i === last && !used[i] && !commits[i] ? i - 1 : i;
      const lastCommit = lastBefore(commitOffsets, i);
      const lastUse = lastBefore(useOffsets, i);
      const lastActivity = Math.max(lastCommit ?? -Infinity, lastUse ?? -Infinity, founded);
      const inactive = Math.max(0, eff - lastActivity);
      if (inactive >= GRASS_AFTER) return state.push('g');
      if (inactive >= RUIN_AFTER) return state.push('u');
      if (inactive >= BURNING_AFTER) return state.push('b');
      if (i === founded && founded > 0) return state.push('c');
      // at risk: still depended on, but nobody commits; a product busy with its own transactions is evidently operated
      if (used[i] && !tx[i] && hasRepo && eff - (lastCommit ?? founded) >= AT_RISK_AFTER) return state.push('r');
      state.push('a');
    });
    const lastOf = (offsets: number[]) => {
      const inWindow = offsets.filter((o) => o <= last);
      return inWindow.length ? monthAtOffset(months, inWindow[inWindow.length - 1]) : null;
    };
    nodeTl[n.id] = {
      traffic,
      tier: '',
      state: state.join(''),
      commits,
      tx,
      lastCommit: lastOf(commitOffsets),
      lastUse: lastOf(useOffsets),
      noData,
    };
  }

  // 4. Size tier per month: traffic quartiles among standing buildings, 0 when nothing stands
  const standing = (s: string) => s !== 'e' && s !== 'g';
  months.forEach((_, i) => {
    const values = nodes.map((n) => nodeTl[n.id].traffic[i]).filter((v) => v > 0).sort((a, b) => a - b);
    const rank = (p: number) => values[Math.max(0, Math.ceil(p * values.length) - 1)];
    const [q1, q2, q3] = values.length ? [rank(0.25), rank(0.5), rank(0.75)] : [0, 0, 0];
    for (const n of nodes) {
      const tl = nodeTl[n.id];
      const v = tl.traffic[i];
      const t = !standing(tl.state[i]) ? 0 : v === 0 || v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4;
      tl.tier += String(t);
    }
  });

  const totals = months.map((_, i) => nodes.reduce((s, n) => s + nodeTl[n.id].tx[i], 0));
  return { months, totals, customers: customerTl, nodes: nodeTl, edges };
}

function monthAtOffset(months: string[], offset: number): string {
  if (offset >= 0 && offset < months.length) return months[offset];
  const [y, m] = months[0].split('-').map(Number);
  const idx = y * 12 + (m - 1) + offset;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
