import { describe, expect, it } from 'vitest';
import { customerClosure, highwayEdges, indexWorld, nodeUpstream } from '../../app/logic/index';
import { miniWorld } from './world';

describe('indexWorld', () => {
  const world = miniWorld();
  const idx = indexWorld(world);

  it('looks up nodes, customers and edges by id', () => {
    expect(idx.node.get('anvil-lib')!.name).toBe('Anvil Lib');
    expect(idx.customer.get('old-pilot')!.stage).toBe('ended');
    expect(idx.edge.get('swap-town->anvil-lib')!.confidence).toBe('verified');
  });

  it('lists incoming and outgoing edges per id', () => {
    expect(idx.out.get('swap-town')!.map((e) => e.to)).toEqual(['anvil-lib', 'mill-indexer']);
    expect(idx.incoming.get('anvil-lib')!.map((e) => e.from)).toEqual(['mill-indexer', 'seal-notary', 'swap-town']);
  });

  it('maps every road tile to the edges that cross it', () => {
    for (const t of world.tiles) expect(idx.edgesAtTile.get(`${t.pos[0]},${t.pos[1]}`)!.length).toBeGreaterThan(0);
  });
});

describe('customerClosure', () => {
  const world = miniWorld();
  const idx = indexWorld(world);

  it('follows a ship down to the mountain without rumors', () => {
    const c = customerClosure(idx, 'guild-of-scribes', false);
    expect([...c.nodes].sort()).toEqual(['anvil-lib', 'hearth-node', 'seal-notary']);
    expect(c.edges.has('seal-notary->mill-indexer')).toBe(false);
    expect(c.edges.has('guild-of-scribes->seal-notary')).toBe(true);
  });

  it('includes inferred edges when rumors are shown', () => {
    const c = customerClosure(idx, 'guild-of-scribes', true);
    expect(c.nodes.has('mill-indexer')).toBe(true);
  });

  it('returns an empty closure for an unknown customer', () => {
    expect(customerClosure(idx, 'nobody', false).nodes.size).toBe(0);
  });
});

describe('highwayEdges', () => {
  it('returns non-inferred edges that lead into hidden highways', () => {
    const idx = indexWorld(miniWorld());
    expect([...highwayEdges(idx)].sort()).toEqual([
      'anvil-lib->hearth-node',
      'lonely-tool->hearth-node',
      'mill-indexer->anvil-lib',
      'mill-indexer->hearth-node',
      'seal-notary->anvil-lib',
      'swap-town->anvil-lib',
    ]);
  });
});

describe('nodeUpstream', () => {
  const idx = indexWorld(miniWorld());

  it('traces a building back to every ship that relies on it', () => {
    const up = nodeUpstream(idx, 'hearth-node', false);
    expect([...up.customers].sort()).toEqual(['guild-of-scribes', 'harbor-traders', 'old-pilot']);
    expect(up.nodes.has('anvil-lib')).toBe(true);
    expect(up.nodes.has('lonely-tool')).toBe(true);
    expect(up.edges.has('swap-town->anvil-lib')).toBe(true);
    expect(up.edges.has('harbor-traders->swap-town')).toBe(true);
  });

  it('follows rumors only when asked', () => {
    expect(nodeUpstream(idx, 'mill-indexer', false).customers.has('guild-of-scribes')).toBe(false);
    expect(nodeUpstream(idx, 'mill-indexer', true).customers.has('guild-of-scribes')).toBe(true);
  });

  it('finds no ships for a stranded building', () => {
    expect(nodeUpstream(idx, 'lonely-tool', false).customers.size).toBe(0);
  });
});
