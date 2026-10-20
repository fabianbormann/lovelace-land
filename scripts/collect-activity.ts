/**
 * Collects monthly activity for the time axis and writes data/activity/{tx,commits}/<id>.json.
 *   npx tsx scripts/collect-activity.ts                 # everything
 *   npx tsx scripts/collect-activity.ts --kind tx       # only on-chain transactions
 *   npx tsx scripts/collect-activity.ts --only minswap  # one entity
 *
 * Transactions: Yaci Store MCP (DuckDB analytics over Cardano mainnet), YACI_MCP_URL to override.
 * Commits: GitHub GraphQL with GITHUB_TOKEN, or the token of the local `gh` CLI.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { MonthCounts } from '../pipeline/activity';
import { loadDataDir } from '../pipeline/load';
import { monthOf, monthRange } from '../pipeline/months';
import { TIMELINE_START } from '../pipeline/timeline';
import { commitsQuery, parseCommits, parseRows, parseSqlRows, repoOf, txPlan, yearChunks, type Onchain } from './lib/activity-sources';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    kind: { type: 'string', default: 'all' },
    only: { type: 'string' },
  },
});
const dataDir = values.data!;
const MCP = process.env.YACI_MCP_URL ?? 'https://yaci-playground.cf-app.org/mcp';
const today = new Date().toISOString().slice(0, 10);
const current = monthOf(new Date().toISOString());
/** Commits are read a year before the time axis starts, so long-lived projects are known to exist. */
const COMMITS_FROM = '2020-09';

const { data, errors } = loadDataDir(dataDir);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

function write(kind: 'tx' | 'commits', id: string, body: Record<string, unknown>) {
  const dir = join(dataDir, 'activity', kind);
  mkdirSync(dir, { recursive: true });
  const months = body.months as MonthCounts;
  const sorted = Object.fromEntries(Object.keys(months).sort().map((k) => [k, months[k]]));
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify({ ...body, months: sorted }, null, 2)}\n`);
}

let rpcId = 0;
async function sql(query: string): Promise<MonthCounts> {
  return parseSqlRows(await sqlText(query));
}

async function sqlText(query: string): Promise<string> {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name: 'analytics-execute-sql', arguments: { sql: query, maxRows: 1000, timeoutSeconds: 120 } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json()) as { result?: { content?: { text: string }[]; isError?: boolean }; error?: { message: string } };
  const text = json.result?.content?.map((c) => c.text).join('') ?? '';
  if (json.error || json.result?.isError) throw new Error(json.error?.message ?? text.slice(0, 300));
  return text;
}

async function collectTx(id: string, onchain: Onchain & { source?: string }) {
  const windows = yearChunks(TIMELINE_START, current);
  let plan = txPlan(onchain, windows);
  if (plan.prefix) {
    // prefixes may also match foreign scripts: list them and exclude them by full hash
    const ours = new Set(onchain.scripts);
    const matched = parseRows(await sqlText(plan.prefix.checkQuery)).map((r) => String(r.script_hash));
    const foreign = matched.filter((h) => !ours.has(h));
    if (foreign.length) plan = txPlan(onchain, windows, foreign);
  }
  const queries = plan.queries;
  const months: MonthCounts = {};
  for (const q of queries) for (const [m, n] of Object.entries(await sql(q))) months[m] = (months[m] ?? 0) + n;
  write('tx', id, {
    id,
    source: `Yaci Store analytics (${MCP})${onchain.source ? `; identifiers from ${onchain.source}` : ''}${plan.prefix ? `; scripts matched by ${plan.prefix.length}-character hash prefix with foreign matches excluded` : ''}`,
    query: queries[0]?.replace(/date >= DATE '[^']+' AND date < DATE '[^']+'/, 'date in <year window>'),
    collected: today,
    months,
  });
  const total = Object.values(months).reduce((a, b) => a + b, 0);
  console.log(`tx       ${id.padEnd(32)} ${total.toLocaleString('en')} transactions`);
}

let token: string | null = process.env.GITHUB_TOKEN ?? null;
function githubToken() {
  if (!token) token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  return token;
}

async function collectCommits(id: string, owner: string, repo: string) {
  const months = monthRange(COMMITS_FROM, current);
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${githubToken()}`, 'content-type': 'application/json', 'user-agent': 'cardano-island' },
    body: JSON.stringify({ query: commitsQuery(owner, repo, months) }),
  });
  const counts = parseCommits(await res.json(), months);
  if (!counts) {
    console.warn(`commits  ${id.padEnd(32)} repository ${owner}/${repo} not found or not accessible — skipped`);
    return;
  }
  write('commits', id, { id, repo: `${owner}/${repo}`, collected: today, months: counts });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`commits  ${id.padEnd(32)} ${total} commits since ${COMMITS_FROM}`);
}

const jobs: (() => Promise<void>)[] = [];
const wanted = (id: string) => !values.only || values.only === id;
if (values.kind === 'all' || values.kind === 'tx')
  for (const entity of [...data.nodes, ...data.customers])
    if (entity.onchain && wanted(entity.id)) jobs.push(() => collectTx(entity.id, entity.onchain!));
if (values.kind === 'all' || values.kind === 'commits')
  for (const n of data.nodes) {
    const repo = repoOf(n.links.repo);
    if (repo && wanted(n.id)) jobs.push(() => collectCommits(n.id, repo.owner, repo.repo));
  }

let failures = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const job = jobs.shift()!;
      try {
        await job();
      } catch (e) {
        failures++;
        console.error(`failed: ${(e as Error).message}`);
      }
    }
  }),
);
console.log(`\nDone${failures ? ` with ${failures} failure(s)` : ''}. Run npm run build:world to see the timeline.`);
process.exit(failures ? 1 : 0);
