import type { NodeFlags, Tier } from './flags';
import type { Graph } from './graph';
import type { Bounds, Layout, Pos, Region } from './layout';
import type { RoadTile, Roads } from './roads';
import type { Confidence, Customer, District, Evidence, Node, Relation, Sector } from './schema';
import { STAGE_WEIGHT, type Traffic } from './traffic';
import { cmp } from './util';

export interface WorldNode extends Omit<Node, 'uses'> {
  pos: Pos;
  traffic: number;
  trafficWithRumors: number;
  tier: Tier;
  stranded: boolean;
  hiddenHighway: boolean;
  dependents: number;
}
export interface WorldCustomer extends Omit<Customer, 'uses'> {
  harbor: string;
  slot: number;
  weight: number;
}
export interface WorldEdge {
  id: string;
  from: string;
  to: string;
  relation?: Relation;
  confidence: Confidence;
  evidence: Evidence[];
  traffic: number;
  trafficWithRumors: number;
  path: Pos[];
}
export interface WorldDistrict extends District { region: Region }
export interface WorldSector extends Sector { harbor: { pos: Pos } }
export interface World {
  version: 1;
  generatedAt: string;
  bounds: Bounds;
  districts: WorldDistrict[];
  sectors: WorldSector[];
  nodes: WorldNode[];
  customers: WorldCustomer[];
  edges: WorldEdge[];
  tiles: RoadTile[];
}

export function buildWorld(input: {
  graph: Graph;
  traffic: Traffic;
  rumorTraffic: Traffic;
  flags: Map<string, NodeFlags>;
  layout: Layout;
  roads: Roads;
  generatedAt: string;
}): World {
  const { graph, traffic, rumorTraffic, flags, layout, roads, generatedAt } = input;

  const districts = [...graph.data.districts]
    .sort((a, b) => a.order - b.order || cmp(a.id, b.id))
    .map((d) => ({ ...d, region: layout.districts.get(d.id)! }));
  const sectors = graph.data.sectors.map((s) => ({ ...s, harbor: { pos: layout.harbors.get(s.id)! } }));

  const nodes = [...graph.data.nodes]
    .sort((a, b) => cmp(a.id, b.id))
    .map(({ uses: _uses, ...n }) => ({
      ...n,
      pos: layout.nodes.get(n.id)!,
      traffic: traffic.node.get(n.id) ?? 0,
      trafficWithRumors: rumorTraffic.node.get(n.id) ?? 0,
      ...flags.get(n.id)!,
    }));

  const slots = new Map<string, number>();
  const customers = [...graph.data.customers]
    .sort((a, b) => cmp(a.id, b.id))
    .map(({ uses: _uses, ...c }) => {
      const harbor = c.sectors[0];
      const slot = slots.get(harbor) ?? 0;
      slots.set(harbor, slot + 1);
      return { ...c, harbor, slot, weight: STAGE_WEIGHT[c.stage] };
    });

  const edges = graph.edges.map((e) => ({
    ...e,
    traffic: traffic.edge.get(e.id) ?? 0,
    trafficWithRumors: rumorTraffic.edge.get(e.id) ?? 0,
    path: roads.paths.get(e.id)!,
  }));

  return { version: 1, generatedAt, bounds: layout.bounds, districts, sectors, nodes, customers, edges, tiles: roads.tiles };
}

export function serializeWorld(world: World): string {
  return `${JSON.stringify(world, null, 2)}\n`;
}
