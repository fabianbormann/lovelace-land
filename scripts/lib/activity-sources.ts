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

/** One SQL statement per window, counting distinct transactions per month across all identifiers. */
export function txQueries(onchain: Onchain, ...windows: [string, string][]): string[] {
  const scripts = onchain.scripts ?? [];
  const labels = onchain.metadataLabels ?? [];
  const addresses = onchain.addresses ?? [];
  if (scripts.some((s) => !HEX.test(s)) || addresses.some((a) => !ADDR.test(a)) || labels.some((l) => !Number.isInteger(l)))
    throw new Error('invalid on-chain identifier');
  if (!scripts.length && !labels.length && !addresses.length) return [];
  return windows.map(([from, to]) => {
    const range = `date >= DATE '${from}' AND date < DATE '${to}'`;
    const parts: string[] = [];
    if (scripts.length) parts.push(`SELECT date, tx_hash FROM transaction_scripts WHERE ${range} AND script_hash IN (${list(scripts)})`);
    if (labels.length) parts.push(`SELECT date, tx_hash FROM transaction_metadata WHERE ${range} AND CAST(label AS VARCHAR) IN (${list(labels.map(String))})`);
    if (addresses.length) parts.push(`SELECT date, tx_hash FROM address_utxo WHERE ${range} AND owner_addr IN (${list(addresses)})`);
    return `SELECT strftime(date_trunc('month', date), '%Y-%m') AS month, count(DISTINCT tx_hash) AS txs FROM (${parts.join(' UNION ALL ')}) GROUP BY 1 ORDER BY 1`;
  });
}

export function parseSqlRows(text: string): MonthCounts {
  const json = JSON.parse(text) as { rows?: { month: string; txs: number }[]; error?: string };
  if (!json.rows) throw new Error(`query failed: ${json.error ?? text.slice(0, 200)}`);
  const out: MonthCounts = {};
  for (const r of json.rows) if (Number(r.txs) > 0) out[r.month] = Number(r.txs);
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
