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
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { MonthCounts } from '../pipeline/activity';
import { loadDataDir } from '../pipeline/load';
import { monthOf, monthRange } from '../pipeline/months';
import { TIMELINE_START } from '../pipeline/timeline';
import { commitsQuery, parseCommits, parseRows, parseSqlRows, repoOf, resolvePlan, yearChunks, type Onchain } from './lib/activity-sources';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    kind: { type: 'string', default: 'all' },
    only: { type: 'string' },
    strict: { type: 'boolean', default: false },
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Retry flaky network calls a few times with growing pauses. */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${what}: ${(e as Error).message}`);
      await sleep(3_000 * attempt);
    }
  }
}

let rpcId = 0;
async function sql(query: string): Promise<MonthCounts> {
  return parseSqlRows(await sqlText(query));
}

async function sqlText(query: string): Promise<string> {
  return withRetry('analytics query', () => sqlOnce(query));
}

async function sqlOnce(query: string): Promise<string> {
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { content?: { text: string }[]; isError?: boolean }; error?: { message: string } };
  const text = json.result?.content?.map((c) => c.text).join('') ?? '';
  if (json.error || json.result?.isError) throw new Error(json.error?.message ?? text.slice(0, 300));
  return text;
}

async function collectTx(id: string, onchain: Onchain & { source?: string }) {
  const windows = yearChunks(TIMELINE_START, current);
  const plan = await resolvePlan(onchain, windows, async (q) => parseRows(await sqlText(q)).map((r) => String(r.script_hash)));
  const queries = plan.queries;
  if (!queries.length) return;
  const months: MonthCounts = {};
  for (const q of queries) for (const [m, n] of Object.entries(await sql(q))) months[m] = (months[m] ?? 0) + n;
  write('tx', id, {
    id,
    source: `Yaci Store analytics (${MCP})${onchain.source ? `; identifiers from ${onchain.source}` : ''}${plan.prefix ? `; scripts matched by ${plan.prefix.length}-character hash prefix with foreign matches excluded` : ''}${plan.outputs ? '' : '; counts script runs only (too many scripts to also match payments to them)'}`,
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
  const counts = await withRetry(`commits ${owner}/${repo}`, async () => {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${githubToken()}`, 'content-type': 'application/json', 'user-agent': 'lovelace-land' },
      body: JSON.stringify({ query: commitsQuery(owner, repo, months) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseCommits(await res.json(), months);
  });
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
const hasIdentifiers = (o: Onchain | undefined) => !!(o?.scripts?.length || o?.metadataLabels?.length || o?.addresses?.length);
if (values.kind === 'all' || values.kind === 'tx')
  for (const entity of [...data.nodes, ...data.customers])
    if (hasIdentifiers(entity.onchain) && wanted(entity.id)) jobs.push(() => collectTx(entity.id, entity.onchain!));

// Files for entities that were renamed or removed would fail the build: remove them.
if (!values.only) {
  const known = new Set([...data.nodes.map((n) => n.id), ...data.customers.map((c) => c.id)]);
  for (const kind of ['tx', 'commits']) {
    const dir = join(dataDir, 'activity', kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir))
      if (name.endsWith('.json') && !known.has(name.slice(0, -5))) {
        rmSync(join(dir, name));
        console.log(`removed  activity/${kind}/${name} (no longer on the island)`);
      }
  }
}
if (values.kind === 'all' || values.kind === 'commits')
  for (const n of data.nodes) {
    const repo = repoOf(n.links.repo);
    if (repo && wanted(n.id)) jobs.push(() => collectCommits(n.id, repo.owner, repo.repo));
  }

const failures: string[] = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const job = jobs.shift()!;
      try {
        await job();
      } catch (e) {
        failures.push((e as Error).message);
        console.error(`failed: ${(e as Error).message}`);
      }
    }
  }),
);
// Partial results are still worth keeping: list failures, and fail the run only with --strict.
console.log(`\nDone${failures.length ? ` with ${failures.length} failure(s):\n${failures.map((f) => `- ${f}`).join('\n')}` : ''}. Run npm run build:world to see the timeline.`);
process.exit(failures.length && values.strict ? 1 : 0);
