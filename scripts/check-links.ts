/**
 * Checks every URL cited by the dataset. Prints a Markdown report and exits 1 if any link is broken.
 *   npx tsx scripts/check-links.ts [--data data]
 */
import { parseArgs } from 'node:util';
import { loadDataDir } from '../pipeline/load';
import { collectUrls } from './lib/links';

const { values } = parseArgs({ options: { data: { type: 'string', default: 'data' } } });
const { data, errors } = loadDataDir(values.data!);
if (errors.length) {
  // printed to stdout too, so the weekly issue explains why the check could not run
  console.log(`The data does not load, so links were not checked:\n\n${errors.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}

type Result = { url: string; files: string[]; status: number | string };
const UA = 'Mozilla/5.0 (compatible; CardanoIslandLinkCheck/1.0; +https://github.com)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probe(url: string): Promise<number | string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let status: number | string = 'unreachable';
    for (const method of ['HEAD', 'GET']) {
      try {
        const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
        status = res.status;
        // Many servers answer HEAD badly; only trust a successful HEAD.
        if (method === 'HEAD' && status >= 400) continue;
        break;
      } catch (e) {
        status = (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable';
      }
    }
    // Rate limits (GitHub, mostly) get a pause and another try before counting as blocked.
    if (status === 429 && attempt < 2) {
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    return status;
  }
  return 429;
}

const urls = collectUrls(data);
const results: Result[] = [];
const queue = [...urls];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const { url, files } = queue.shift()!;
    results.push({ url, files, status: await probe(url) });
  }
}));

// 401/403/429/999 usually mean bot protection or rate limits, not a dead link.
const BLOCKED = [401, 403, 429, 999];
const broken = results.filter((r) => typeof r.status === 'string' || (r.status >= 400 && !BLOCKED.includes(r.status)));
const blocked = results.filter((r) => typeof r.status === 'number' && BLOCKED.includes(r.status));
console.log(`Checked ${results.length} links: ${broken.length} broken, ${blocked.length} blocked by the site (not counted).\n`);
if (broken.length) {
  console.log('| status | link | cited in |\n|---|---|---|');
  const cell = (t: string) => t.replace(/\|/g, '%7C');
  for (const r of broken.sort((a, b) => (a.url < b.url ? -1 : 1))) console.log(`| ${r.status} | ${cell(r.url)} | ${r.files.join(', ')} |`);
}
process.exit(broken.length ? 1 : 0);
