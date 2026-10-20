import { describe, expect, it } from 'vitest';
import { planSettlers } from '../../app/logic/settlers';
import { miniWorld } from './world';

describe('planSettlers', () => {
  const world = miniWorld();

  it('only sends settlers along edges with traffic', () => {
    const plan = planSettlers(world, 300);
    const ids = new Set(plan.map((s) => s.edgeId));
    for (const e of world.edges) expect(ids.has(e.id)).toBe(e.traffic > 0);
  });

  it('sends more settlers along busier roads', () => {
    const plan = planSettlers(world, 300);
    const count = (id: string) => plan.filter((s) => s.edgeId === id).length;
    expect(count('anvil-lib->hearth-node')).toBeGreaterThan(count('guild-of-scribes->seal-notary'));
  });

  it('respects the cap and is deterministic', () => {
    expect(planSettlers(world, 3).length).toBeLessThanOrEqual(3);
    expect(planSettlers(world, 300)).toEqual(planSettlers(world, 300));
  });
});
