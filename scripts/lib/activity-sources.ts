import type { MonthCounts } from '../../pipeline/activity';
import { monthRange } from '../../pipeline/months';

export interface Onchain {
  scripts?: string[];
  metadataLabels?: number[];
  addresses?: string[];
}

/** [startDate, endDate) windows by calendar year, so each query stays within the server's time limit. */
export function yearChunks(from: string, to: string): [string, string][] {
  const months = monthRange(from, to);
  const chunks: [string, string][] = [];
  let start = months[0];
  const nextMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  };
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    const isLast = i === months.length - 1;
    if (m.endsWith('-12') || isLast) {
      chunks.push([`${start}-01`, `${nextMonth(m)}-01`]);
      start = nextMonth(m);
    }
  }
  return chunks;
}

const HEX = /^[0-9a-f]{56}$/;
const ADDR = /^addr1[0-9a-z]+$/;
const list = (values: string[]) => values.map((v) => `'${v}'`).join(', ');

/** The analytics service refuses longer statements. */
export const MAX_SQL_LENGTH = 9500;

/**
 * Every script hash h a transaction touches: scripts it runs, and scripts it pays to (outputs whose payment
 * credential is the script). Paying to a script without running it is how DEX orders and notary records
 * are placed, so counting only executions misses most of their activity.
 */
const scriptsTouched = (range: string, outputs: boolean) =>
  `SELECT date, tx_hash, script_hash AS h FROM transaction_scripts WHERE ${range}` +
  (outputs ? ` UNION ALL SELECT date, tx_hash, owner_payment_credential AS h FROM address_utxo WHERE ${range}` : '');

function query(range: string, scriptFilter: string | null, labels: number[], addresses: string[], outputs: boolean) {
  const parts: string[] = [];
  if (scriptFilter) parts.push(`SELECT date, tx_hash FROM (${scriptsTouched(range, outputs)}) WHERE ${scriptFilter}`);
  if (labels.length) parts.push(`SELECT date, tx_hash FROM transaction_metadata WHERE ${range} AND CAST(label AS VARCHAR) IN (${list(labels.map(String))})`);
  if (addresses.length) parts.push(`SELECT date, tx_hash FROM address_utxo WHERE ${range} AND owner_addr IN (${list(addresses)})`);
  return `SELECT strftime(date_trunc('month', date), '%Y-%m') AS month, count(DISTINCT tx_hash) AS txs FROM (${parts.join(' UNION ALL ')}) GROUP BY 1 ORDER BY 1`;
}

export interface TxPlan {
  /** one statement per window */
  queries: string[];
  /** false when scripts are counted by runs only, because matching their outputs too would not fit */
  outputs: boolean;
  /** set when scripts are matched by prefix: run checkQuery and exclude any foreign hashes it returns */
  prefix?: { length: number; checkQuery: string };
}

/**
 * SQL counting distinct transactions per month across all identifiers. Long script lists do not fit
 * the server's statement limit, so they are matched by hash prefix; checkQuery lists every script the
 * prefixes match, and foreign ones are passed back in `excluded` so the count stays exact.
 */
export function txPlan(onchain: Onchain, windows: [string, string][], excluded: string[] = [], outputs = true): TxPlan {
  const scripts = [...new Set(onchain.scripts ?? [])];
  const labels = onchain.metadataLabels ?? [];
  const addresses = onchain.addresses ?? [];
  if ([...scripts, ...excluded].some((s) => !HEX.test(s)) || addresses.some((a) => !ADDR.test(a)) || labels.some((l) => !Number.isInteger(l)))
    throw new Error('invalid on-chain identifier');
  if (!scripts.length && !labels.length && !addresses.length) return { queries: [], outputs };
  const range = ([from, to]: [string, string]) => `date >= DATE '${from}' AND date < DATE '${to}'`;
  const exact = scripts.length ? `h IN (${list(scripts)})` : null;
  if (query(range(windows[0]), exact, labels, addresses, outputs).length <= MAX_SQL_LENGTH)
    return { queries: windows.map((w) => query(range(w), exact, labels, addresses, outputs)), outputs };
  for (let length = 16; length >= 6; length--) {
    const prefixes = [...new Set(scripts.map((s) => s.slice(0, length)))];
    const filter = `substr(h, 1, ${length}) IN (${list(prefixes)})${excluded.length ? ` AND h NOT IN (${list(excluded)})` : ''}`;
    if (query(range(windows[0]), filter, labels, addresses, outputs).length > MAX_SQL_LENGTH) continue;
    const all: [string, string] = [windows[0][0], windows[windows.length - 1][1]];
    return {
      queries: windows.map((w) => query(range(w), filter, labels, addresses, outputs)),
      outputs,
      prefix: {
        length,
        checkQuery: `SELECT DISTINCT h AS script_hash FROM (${scriptsTouched(range(all), outputs)}) WHERE substr(h, 1, ${length}) IN (${list(prefixes)})`,
      },
    };
  }
  throw new Error(`${scripts.length} scripts are too many to query, even by prefix`);
}

/**
 * Build a plan and, when scripts are matched by prefix, exclude every foreign script the prefixes
 * match. Exclusions lengthen the statement and may force a shorter prefix, so check again until the
 * prefix length is stable.
 */
export async function resolvePlan(onchain: Onchain, windows: [string, string][], runCheck: (sql: string) => Promise<string[]>): Promise<TxPlan> {
  try {
    return await resolveWith(onchain, windows, runCheck, true);
  } catch (e) {
    // very long lists: wallets' key hashes share prefixes with the scripts' outputs far too often to exclude them all
    if (!/too many to query/.test((e as Error).message)) throw e;
    return resolveWith(onchain, windows, runCheck, false);
  }
}

async function resolveWith(onchain: Onchain, windows: [string, string][], runCheck: (sql: string) => Promise<string[]>, outputs: boolean): Promise<TxPlan> {
  const ours = new Set(onchain.scripts ?? []);
  const excluded = new Set<string>();
  let plan = txPlan(onchain, windows, [], outputs);
  const checkedLengths = new Set<number>();
  for (let round = 0; plan.prefix && !checkedLengths.has(plan.prefix.length) && round < 8; round++) {
    checkedLengths.add(plan.prefix.length);
    for (const h of await runCheck(plan.prefix.checkQuery)) if (!ours.has(h)) excluded.add(h);
    plan = txPlan(onchain, windows, [...excluded].sort(), outputs);
  }
  return plan;
}

/** Back-compatible: the statements of a plan without prefix exclusions. */
export function txQueries(onchain: Onchain, ...windows: [string, string][]): string[] {
  return txPlan(onchain, windows).queries;
}

/** Rows of a query result as plain objects. */
export function parseRows(text: string): Record<string, unknown>[] {
  const json = JSON.parse(text) as { rows?: Record<string, unknown>[]; truncated?: boolean; error?: string };
  if (!json.rows) throw new Error(`query failed: ${json.error ?? text.slice(0, 200)}`);
  if (json.truncated) throw new Error('query result was truncated');
  return json.rows;
}

export function parseSqlRows(text: string): MonthCounts {
  const out: MonthCounts = {};
  for (const r of parseRows(text)) if (Number(r.txs) > 0) out[String(r.month)] = Number(r.txs);
  return out;
}

export function repoOf(url: string | undefined): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(url ?? '');
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

const nextMonthStart = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01-01T00:00:00Z` : `${y}-${String(mo + 1).padStart(2, '0')}-01T00:00:00Z`;
};

/** GraphQL asking for the default branch's commit count in each month. */
export function commitsQuery(owner: string, repo: string, months: string[]): string {
  const fields = months.map((m, i) => `m${i}: history(since: "${m}-01T00:00:00Z", until: "${nextMonthStart(m)}") { totalCount }`).join('\n          ');
  return `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { defaultBranchRef { target { ... on Commit {
          ${fields}
        } } } } }`;
}

export function parseCommits(json: unknown, months: string[]): MonthCounts | null {
  const errors = (json as { errors?: { message: string; type?: string }[] })?.errors;
  // a missing repository is reported as NOT_FOUND; anything else (bad token, rate limit) is a failure
  if (errors?.length && !errors.every((e) => e.type === 'NOT_FOUND')) throw new Error(errors.map((e) => e.message).join('; '));
  const target = (json as { data?: { repository?: { defaultBranchRef?: { target?: Record<string, { totalCount: number }> } } | null } })?.data?.repository
    ?.defaultBranchRef?.target;
  if (!target) return null;
  const out: MonthCounts = {};
  months.forEach((m, i) => {
    const n = target[`m${i}`]?.totalCount ?? 0;
    if (n > 0) out[m] = n;
  });
  return out;
}
