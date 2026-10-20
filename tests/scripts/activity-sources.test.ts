import { describe, expect, it } from 'vitest';
import { commitsQuery, parseCommits, parseSqlRows, repoOf, txQueries, yearChunks } from '../../scripts/lib/activity-sources';

const HASH = 'e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309';

describe('yearChunks', () => {
  it('splits a month range into calendar-year windows', () => {
    expect(yearChunks('2021-09', '2023-02')).toEqual([
      ['2021-09-01', '2022-01-01'],
      ['2022-01-01', '2023-01-01'],
      ['2023-01-01', '2023-03-01'],
    ]);
  });
});

describe('txQueries', () => {
  it('counts distinct transactions per month for scripts, labels and addresses', () => {
    const [q] = txQueries({ scripts: [HASH], metadataLabels: [674], addresses: ['addr1qxy'] }, ['2026-01-01', '2026-02-01']);
    expect(q).toContain("FROM transaction_scripts WHERE date >= DATE '2026-01-01' AND date < DATE '2026-02-01' AND script_hash IN ('" + HASH + "')");
    expect(q).toContain("FROM transaction_metadata WHERE date >= DATE '2026-01-01' AND date < DATE '2026-02-01' AND CAST(label AS VARCHAR) IN ('674')");
    expect(q).toContain("FROM address_utxo WHERE date >= DATE '2026-01-01' AND date < DATE '2026-02-01' AND owner_addr IN ('addr1qxy')");
    expect(q).toMatch(/count\(DISTINCT tx_hash\)/);
    expect(q).toMatch(/UNION/);
  });

  it('refuses identifiers that could break out of the SQL string', () => {
    expect(() => txQueries({ scripts: ["x' OR 1=1 --"] }, ['2026-01-01', '2026-02-01'])).toThrow(/invalid/);
  });

  it('returns nothing without identifiers', () => {
    expect(txQueries({}, ['2026-01-01', '2026-02-01'])).toEqual([]);
  });
});

describe('parseSqlRows', () => {
  it('turns query rows into month counts', () => {
    expect(parseSqlRows('{"rows":[{"month":"2026-01","txs":5},{"month":"2026-02","txs":0}],"row_count":2}')).toEqual({ '2026-01': 5 });
  });
  it('throws on an error payload', () => {
    expect(() => parseSqlRows('{"error":"timeout"}')).toThrow(/timeout/);
  });
});

describe('GitHub commits', () => {
  it('reads owner and repo from a GitHub URL', () => {
    expect(repoOf('https://github.com/txpipe/pallas')).toEqual({ owner: 'txpipe', repo: 'pallas' });
    expect(repoOf('https://github.com/txpipe/pallas/tree/main/x')).toEqual({ owner: 'txpipe', repo: 'pallas' });
    expect(repoOf('https://gitlab.com/x/y')).toBeNull();
  });

  it('asks for one history count per month', () => {
    const q = commitsQuery('txpipe', 'pallas', ['2026-01', '2026-02']);
    expect(q).toContain('repository(owner: "txpipe", name: "pallas")');
    expect(q).toContain('m0: history(since: "2026-01-01T00:00:00Z", until: "2026-02-01T00:00:00Z") { totalCount }');
    expect(q).toContain('m1: history(since: "2026-02-01T00:00:00Z", until: "2026-03-01T00:00:00Z") { totalCount }');
  });

  it('parses counts and reports a missing repository as null', () => {
    const ok = { data: { repository: { defaultBranchRef: { target: { m0: { totalCount: 3 }, m1: { totalCount: 0 } } } } } };
    expect(parseCommits(ok, ['2026-01', '2026-02'])).toEqual({ '2026-01': 3 });
    expect(parseCommits({ data: { repository: null } }, ['2026-01'])).toBeNull();
  });
});
