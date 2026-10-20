/**
 * Reads the root manifests of every project repo on GitHub and proposes `uses` edges to
 * other projects whose published packages appear there.
 *   npx tsx scripts/scan-manifests.ts            # print proposals
 *   npx tsx scripts/scan-manifests.ts --write    # also add them to data/nodes/*.yaml
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';
import { loadDataDir, nodeFile } from '../pipeline/load';
import { buildPackageIndex, dependenciesIn, MANIFESTS } from './lib/manifests';

const { values } = parseArgs({ options: { data: { type: 'string', default: 'data' }, write: { type: 'boolean', default: false } } });
const dataDir = values.data!;
const { data, errors } = loadDataDir(dataDir);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const index = buildPackageIndex(data.nodes);
const today = new Date().toISOString().slice(0, 10);

interface Proposal { from: string; to: string; url: string }
const proposals: Proposal[] = [];

async function scan(node: (typeof data.nodes)[number]) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(node.links.repo ?? '');
  if (!m) return;
  const [, owner, repo] = m;
  const known = new Set(node.uses.map((u) => u.target));
  for (const file of Object.keys(MANIFESTS)) {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`).catch(() => null);
    if (!res?.ok) continue;
    const text = await res.text();
    for (const to of dependenciesIn(file, text, index)) {
      if (to === node.id || known.has(to)) continue;
      known.add(to);
      proposals.push({ from: node.id, to, url: `https://github.com/${owner}/${repo}/blob/HEAD/${file}` });
    }
  }
}

const queue = [...data.nodes];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) await scan(queue.shift()!);
}));
proposals.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));

if (!proposals.length) {
  console.log('No new manifest dependencies found.');
  process.exit(0);
}
console.log(`| project | uses | manifest |\n|---|---|---|`);
for (const p of proposals) console.log(`| ${p.from} | ${p.to} | ${p.url} |`);

if (values.write) {
  for (const p of proposals) {
    const path = join(dataDir, nodeFile(p.from));
    const doc = parseDocument(readFileSync(path, 'utf8'));
    const entry = { target: p.to, relation: 'library', confidence: 'verified', evidence: [{ url: p.url, kind: 'manifest', retrieved: today }] };
    if (doc.has('uses')) doc.addIn(['uses'], doc.createNode(entry));
    else doc.set('uses', doc.createNode([entry]));
    writeFileSync(path, doc.toString());
  }
  console.log(`\nAdded ${proposals.length} edge(s). Review them, then run npm run build:world.`);
}
