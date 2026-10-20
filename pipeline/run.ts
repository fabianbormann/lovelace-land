import { buildWorld, type World } from './emit';
import { computeFlags } from './flags';
import { buildGraph, findCycles } from './graph';
import { computeLayout, emptyLock, parseLock, serializeLock, type LayoutLock } from './layout';
import { loadDataDir, nodeFile } from './load';
import { routeRoads } from './roads';
import { computeTraffic } from './traffic';
import { validateReferences } from './validate';

export interface PipelineResult {
  world: World | null;
  lockText: string | null;
  errors: string[];
  warnings: string[];
}

export function runPipeline(dataDir: string, lockText: string | null, generatedAt: string): PipelineResult {
  const failed = (errors: string[], warnings: string[] = []): PipelineResult => ({ world: null, lockText: null, errors, warnings });

  const { data, errors } = loadDataDir(dataDir);
  if (errors.length) return failed(errors);
  const refs = validateReferences(data);
  const warnings = [...refs.warnings];
  if (refs.errors.length) return failed(refs.errors, warnings);

  let lock: LayoutLock;
  try {
    lock = lockText === null ? emptyLock() : parseLock(lockText);
  } catch (e) {
    return failed([`layout.lock.json: ${(e as Error).message}`], warnings);
  }

  const graph = buildGraph(data);
  for (const cycle of findCycles(graph))
    warnings.push(`${nodeFile(cycle[0])}: dependency cycle ${[...cycle, cycle[0]].join(' -> ')} (allowed, but check it is intended)`);

  const traffic = computeTraffic(graph, { includeInferred: false });
  const rumorTraffic = computeTraffic(graph, { includeInferred: true });
  const flags = computeFlags(graph, traffic);
  const layout = computeLayout(graph, lock);
  const roads = routeRoads(graph, layout, traffic, rumorTraffic);
  warnings.push(...roads.warnings);

  const world = buildWorld({ graph, traffic, rumorTraffic, flags, layout, roads, generatedAt });
  return { world, lockText: serializeLock(layout.lock), errors: [], warnings };
}
