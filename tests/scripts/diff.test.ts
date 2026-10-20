import { describe, expect, it } from 'vitest';
import type { World } from '../../pipeline/emit';
import { diffWorlds } from '../../scripts/lib/diff';
import { miniWorld } from '../app/world';

describe('diffWorlds', () => {
  it('reports no change for identical worlds', () => {
    const w = miniWorld();
    expect(diffWorlds(w, w)).toBe('No change to the island.');
  });

  it('describes added buildings, ships, roads, tier changes and newly stranded buildings', () => {
    const before = miniWorld();
    const after: World = JSON.parse(JSON.stringify(before));
    after.nodes.push({ ...after.nodes[0], id: 'new-lib', name: 'New Lib', stranded: true, tier: 1 });
    after.customers.push({ ...after.customers[0], id: 'new-ship', name: 'New Ship' });
    after.edges.push({ ...after.edges[0], id: 'new-lib->hearth-node' });
    after.nodes.find((n) => n.id === 'swap-town')!.tier = 4;
    after.nodes.find((n) => n.id === 'seal-notary')!.stranded = true;
    after.nodes = after.nodes.filter((n) => n.id !== 'lonely-tool');
    const text = diffWorlds(before, after);
    expect(text).toContain('**+1 building**: New Lib');
    expect(text).toContain('**−1 building**: Lonely Tool');
    expect(text).toContain('**+1 ship**: New Ship');
    expect(text).toContain('**+1 road**');
    expect(text).toContain('Swap Town grows from hut to keep');
    expect(text).toContain('Newly stranded: New Lib, Seal Notary');
  });
});
