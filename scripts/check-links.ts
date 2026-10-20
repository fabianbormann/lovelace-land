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
  console.error(errors.join('\n'));
  process.exit(1);
}

type Result = { url: string; files: string[]; status: number | string };
const UA = 'Mozilla/5.0 (compatible; CardanoIslandLinkCheck/1.0; +https://github.com)';

async function probe(url: string): Promise<number | string> {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 404)) continue;
      return res.status;
    } catch (e) {
      if (method === 'GET') return (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable';
    }
  }
  return 'unreachable';
}

const urls = collectUrls(data);
const results: Result[] = [];
const queue = [...urls];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const { url, files } = queue.shift()!;
    results.push({ url, files, status: await probe(url) });
  }
}));

// 401/403/429 usually mean bot protection or rate limits, not a dead link.
const broken = results.filter((r) => typeof r.status === 'string' || (r.status >= 400 && ![401, 403, 429].includes(r.status)));
const blocked = results.filter((r) => typeof r.status === 'number' && [401, 403, 429].includes(r.status));
console.log(`Checked ${results.length} links: ${broken.length} broken, ${blocked.length} blocked by the site (not counted).\n`);
if (broken.length) {
  console.log('| status | link | cited in |\n|---|---|---|');
  for (const r of broken.sort((a, b) => (a.url < b.url ? -1 : 1))) console.log(`| ${r.status} | ${r.url} | ${r.files.join(', ')} |`);
}
process.exit(broken.length ? 1 : 0);
