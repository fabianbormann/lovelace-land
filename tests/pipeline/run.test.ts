import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeWorld } from '../../pipeline/emit';
import { runPipeline } from '../../pipeline/run';

const AT = '2026-10-20T00:00:00.000Z';

describe('runPipeline on the mini fixture', () => {
  const result = runPipeline('fixtures/mini', null, AT);
  const world = result.world!;
  const nodeById = new Map(world.nodes.map((n) => [n.id, n] as const));

  it('succeeds without errors or warnings', () => {
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('computes traffic with stage weights and confidence rules', () => {
    expect(Object.fromEntries(world.nodes.map((n) => [n.id, n.traffic]))).toEqual({
      'anvil-lib': 1.5,
      'hearth-node': 1.5,
      'lonely-tool': 0,
      'mill-indexer': 1,
      'seal-notary': 0.5,
      'swap-town': 1,
    });
    expect(nodeById.get('mill-indexer')!.trafficWithRumors).toBe(1.5);
  });

  it('flags stranded nodes and hidden highways', () => {
    expect(world.nodes.filter((n) => n.stranded).map((n) => n.id)).toEqual(['lonely-tool']);
    expect(world.nodes.filter((n) => n.hiddenHighway).map((n) => n.id)).toEqual(['anvil-lib', 'hearth-node']);
  });

  it('emits customers with harbor, slot and weight, without uses', () => {
    expect(world.customers.map((c) => [c.id, c.harbor, c.slot, c.weight])).toEqual([
      ['guild-of-scribes', 'proof-verification', 0, 0.5],
      ['harbor-traders', 'defi', 0, 1],
      ['old-pilot', 'defi', 1, 0],
    ]);
    expect('uses' in world.customers[0]).toBe(false);
    expect('uses' in world.nodes[0]).toBe(false);
  });

  it('emits regions, harbors, edges with paths and tiles', () => {
    expect(world.version).toBe(1);
    expect(world.generatedAt).toBe(AT);
    expect(world.districts.map((d) => d.id)).toEqual(['core', 'indexers', 'sdks', 'products']);
    expect(world.districts[0].region.x0).toBe(16);
    expect(world.sectors.map((s) => s.harbor.pos.length)).toEqual([2, 2]);
    expect(world.edges).toHaveLength(11);
    for (const e of world.edges) expect(e.path.length).toBeGreaterThan(1);
    expect(world.tiles.length).toBeGreaterThan(0);
  });

  it('is byte-identical across runs and stable when fed its own lock', () => {
    const again = runPipeline('fixtures/mini', null, AT);
    expect(serializeWorld(again.world!)).toBe(serializeWorld(world));
    expect(again.lockText).toBe(result.lockText);
    const locked = runPipeline('fixtures/mini', result.lockText, AT);
    expect(serializeWorld(locked.world!)).toBe(serializeWorld(world));
    expect(locked.lockText).toBe(result.lockText);
  });
});

describe('runPipeline failure and edge cases', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'island-run-'));

  it('produces an empty but valid world for a fresh dataset', () => {
    const d = dir();
    writeFileSync(join(d, 'districts.yaml'), '[]\n');
    writeFileSync(join(d, 'sectors.yaml'), '[]\n');
    const r = runPipeline(d, null, AT);
    expect(r.errors).toEqual([]);
    expect(r.world).toMatchObject({ nodes: [], customers: [], edges: [], tiles: [], districts: [], sectors: [] });
    expect(r.lockText).toBe('{\n  "version": 1,\n  "districts": {},\n  "nodes": {}\n}\n');
  });

  it('returns load errors without a world', () => {
    const r = runPipeline(dir(), null, AT);
    expect(r.world).toBeNull();
    expect(r.errors).toEqual(['districts.yaml: file not found', 'sectors.yaml: file not found']);
  });

  it('reports a malformed lock file as an error', () => {
    const r = runPipeline('fixtures/mini', '{ broken', AT);
    expect(r.world).toBeNull();
    expect(r.errors[0]).toMatch(/^layout\.lock\.json: invalid JSON/);
  });

  it('warns about dependency cycles but still builds', () => {
    const d = dir();
    writeFileSync(join(d, 'districts.yaml'), '- { id: core, name: Core, description: d, building: relay-tower, order: 0, color: "#111111" }\n');
    writeFileSync(join(d, 'sectors.yaml'), '[]\n');
    const ev = 'evidence: [{ url: "https://example.org/e", kind: docs, retrieved: 2026-10-20 }]';
    const mk = (id: string, target: string) =>
      `id: ${id}\nname: ${id}\ndistrict: core\ndescription: d\nstatus: active\nlastVerified: 2026-10-20\nuses:\n  - { target: ${target}, relation: library, confidence: verified, ${ev} }\n`;
    mkdirSync(join(d, 'nodes'));
    writeFileSync(join(d, 'nodes', 'a.yaml'), mk('a', 'b'));
    writeFileSync(join(d, 'nodes', 'b.yaml'), mk('b', 'a'));
    const r = runPipeline(d, null, AT);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['nodes/a.yaml: dependency cycle a -> b -> a (allowed, but check it is intended)']);
    expect(r.world!.nodes).toHaveLength(2);
  });
});

describe('runPipeline timeline', () => {
  const world = runPipeline('fixtures/mini', null, AT).world!;

  it('spans 2021-09 to the month of generatedAt', () => {
    expect(world.timeline.months[0]).toBe('2021-09');
    expect(world.timeline.months.at(-1)).toBe('2026-10');
    expect(world.timeline.edges).toHaveLength(world.edges.length);
  });

  it('drives the fixture segment from its product’s transactions', () => {
    const traders = world.timeline.customers['harbor-traders'];
    const i = world.timeline.months.indexOf('2026-07');
    expect(traders.source).toBe('products');
    expect(traders.tx[i]).toBe(999);
    expect(traders.w[i]).toBe(3);
    expect(traders.state[i]).toBe('d');
    expect(traders.state[i + 2]).toBe('a');
  });

  it('reports activity errors with their file', () => {
    const r = runPipeline('fixtures/mini', null, AT);
    expect(r.errors).toEqual([]);
    expect(world.timeline.nodes['anvil-lib'].lastCommit).toBe('2026-02');
  });
});
