import { describe, expect, it } from 'vitest';
import { commitsQuery, MAX_SQL_LENGTH, parseCommits, parseSqlRows, repoOf, resolvePlan, txPlan, txQueries, yearChunks } from '../../scripts/lib/activity-sources';

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

  it('matches long script lists by hash prefix so the count stays exact and under the limit', () => {
    const many = Array.from({ length: 700 }, (_, i) => (i * 7919).toString(16).padStart(8, '0') + 'a'.repeat(48));
    const plan = txPlan({ scripts: many }, [['2026-01-01', '2026-02-01']]);
    expect(plan.queries).toHaveLength(1);
    expect(plan.queries[0].length).toBeLessThan(MAX_SQL_LENGTH);
    expect(plan.queries[0]).toMatch(/substr\(script_hash, 1, \d+\) IN/);
    expect(plan.prefix!.checkQuery).toMatch(/SELECT DISTINCT script_hash FROM transaction_scripts/);
    expect(plan.prefix!.checkQuery.length).toBeLessThan(MAX_SQL_LENGTH);
  });

  it('excludes foreign scripts that share a prefix', () => {
    const many = Array.from({ length: 700 }, (_, i) => (i * 7919).toString(16).padStart(8, '0') + 'a'.repeat(48));
    const foreign = many[3].slice(0, 20) + 'f'.repeat(36);
    const plan = txPlan({ scripts: many }, [['2026-01-01', '2026-02-01']], [foreign]);
    expect(plan.queries[0]).toContain(`script_hash NOT IN ('${foreign}')`);
  });

  it('keeps short lists exact without prefixes', () => {
    const plan = txPlan({ scripts: [HASH] }, [['2026-01-01', '2026-02-01']]);
    expect(plan.prefix).toBeUndefined();
    expect(plan.queries[0]).toContain(`script_hash IN ('${HASH}')`);
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

describe('resolvePlan', () => {
  const many = Array.from({ length: 700 }, (_, i) => (i * 7919).toString(16).padStart(8, '0') + 'a'.repeat(48));

  it('re-checks foreign matches whenever exclusions change the prefix length', async () => {
    const checked: number[] = [];
    // each check reports a new foreign hash for the prefix length it was asked about
    const runCheck = async (q: string) => {
      const len = Number(/substr\(script_hash, 1, (\d+)\)/.exec(q)![1]);
      checked.push(len);
      // the chain holds 20 foreign scripts sharing our first 12 characters; excluding them forces a shorter prefix
      return Array.from({ length: 20 }, (_, k) => many[k].slice(0, 12) + 'f'.repeat(44)).filter((h) => many.some((m) => m.startsWith(h.slice(0, len))));
    };
    const plan = await resolvePlan({ scripts: many }, [['2026-01-01', '2026-02-01']], runCheck);
    const foreignInQuery = [...plan.queries[0].matchAll(/'([0-9a-f]{56})'/g)].map((m) => m[1]).filter((h) => h.endsWith('ffff'));
    expect(checked.length).toBeGreaterThan(1);
    expect(foreignInQuery.length).toBe(20);
    expect(plan.prefix!.length).toBe(checked[checked.length - 1]);
  });

  it('skips the check for short lists', async () => {
    const plan = await resolvePlan({ scripts: [HASH] }, [['2026-01-01', '2026-02-01']], async () => {
      throw new Error('should not be called');
    });
    expect(plan.queries).toHaveLength(1);
  });
});

describe('parseCommits errors', () => {
  it('throws on GraphQL errors instead of treating them as a missing repository', () => {
    expect(() => parseCommits({ errors: [{ message: 'Bad credentials' }] }, ['2026-01'])).toThrow(/Bad credentials/);
  });
});
