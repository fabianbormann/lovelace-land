import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadActivity, validateActivity } from '../../pipeline/activity';
import { makeData, node } from '../helpers';

function tree(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'island-act-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('loadActivity', () => {
  it('returns empty maps when there is no activity folder', () => {
    const { activity, errors } = loadActivity(tree({}));
    expect(errors).toEqual([]);
    expect(activity.tx.size + activity.commits.size).toBe(0);
  });

  it('reads transaction and commit series', () => {
    const dir = tree({
      'activity/tx/minswap.json': { id: 'minswap', source: 'yaci', collected: '2026-10-20', months: { '2026-09': 3967 } },
      'activity/commits/pallas.json': { id: 'pallas', repo: 'txpipe/pallas', collected: '2026-10-20', months: { '2026-08': 12, '2026-09': 3 } },
    });
    const { activity, errors } = loadActivity(dir);
    expect(errors).toEqual([]);
    expect(activity.tx.get('minswap')).toEqual({ '2026-09': 3967 });
    expect(activity.commits.get('pallas')!['2026-08']).toBe(12);
  });

  it('reports invalid JSON, bad shapes and id mismatches with the file path', () => {
    const dir = tree({
      'activity/tx/a.json': '{ nope',
      'activity/tx/b.json': { id: 'b', source: 'y', collected: '2026-10-20', months: { '2026-9': 1 } },
      'activity/commits/c.json': { id: 'd', repo: 'x/y', collected: '2026-10-20', months: {} },
    });
    const { errors } = loadActivity(dir);
    expect(errors[0]).toMatch(/^activity\/tx\/a\.json: invalid JSON/);
    expect(errors.some((e) => e.startsWith('activity/tx/b.json: months'))).toBe(true);
    expect(errors).toContain('activity/commits/c.json: id "d" must match the filename "c"');
  });
});

describe('validateActivity', () => {
  it('flags activity for ids that are not on the island', () => {
    const data = makeData({ nodes: [node('a', 'core')] });
    const activity = { tx: new Map([['ghost', {}]]), commits: new Map([['a', {}]]) };
    expect(validateActivity(activity, data)).toEqual(['activity/tx/ghost.json: "ghost" is not a building or ship on the island']);
  });
});
